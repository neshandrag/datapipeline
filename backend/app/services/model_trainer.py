"""
model_trainer.py
Trains ML models using the config provided by Gemini,
evaluates them, selects the best, and saves as .pkl
"""

import os
import pickle
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.metrics import (
    accuracy_score, f1_score, precision_score, recall_score,
    mean_squared_error, r2_score, silhouette_score
)
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.linear_model import LogisticRegression, Ridge, LinearRegression
from sklearn.svm import SVC
from sklearn.cluster import KMeans, DBSCAN

try:
    from xgboost import XGBClassifier, XGBRegressor
    HAS_XGB = True
except ImportError:
    HAS_XGB = False

try:
    from imblearn.over_sampling import SMOTE
    HAS_SMOTE = True
except ImportError:
    HAS_SMOTE = False

from app.config import UPLOAD_DIR, REPORTS_DIR

MODELS_DIR = os.path.join(os.path.dirname(UPLOAD_DIR), "models")
os.makedirs(MODELS_DIR, exist_ok=True)


# ── Model registry ────────────────────────────────────────────────────────────
MODEL_MAP = {
    "RandomForestClassifier":  lambda: RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1),
    "LogisticRegression":      lambda: LogisticRegression(max_iter=2000, random_state=42),
    "SVC":                     lambda: SVC(probability=True, random_state=42),
    "RandomForestRegressor":   lambda: RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1),
    "LinearRegression":        lambda: LinearRegression(),
    "Ridge":                   lambda: Ridge(alpha=1.0),
    "KMeans":                  lambda: KMeans(n_clusters=4, random_state=42, n_init=10),
    "DBSCAN":                  lambda: DBSCAN(eps=0.5, min_samples=5),
}
if HAS_XGB:
    MODEL_MAP["XGBClassifier"]  = lambda: XGBClassifier(n_estimators=100, random_state=42,
                                                          eval_metric="logloss", verbosity=0)
    MODEL_MAP["XGBRegressor"]   = lambda: XGBRegressor(n_estimators=100, random_state=42, verbosity=0)


# ── Preprocessing ─────────────────────────────────────────────────────────────
def prepare_features(df: pd.DataFrame, feature_cols: list, target_col: str = None):
    X = df[feature_cols].copy()
    y = df[target_col].copy() if target_col else None

    # Encode categoricals
    encoders = {}
    for col in X.select_dtypes(exclude=[np.number]).columns:
        le = LabelEncoder()
        X[col] = le.fit_transform(X[col].astype(str))
        encoders[col] = le

    # Fill any remaining NaN
    X = X.fillna(X.median(numeric_only=True))

    # Encode target if classification with string labels
    target_encoder = None
    if y is not None and y.dtype == object:
        te = LabelEncoder()
        y  = pd.Series(te.fit_transform(y.astype(str)), index=y.index)
        target_encoder = te

    return X, y, encoders, target_encoder


# ── Train & Evaluate ──────────────────────────────────────────────────────────
def train_and_evaluate(filepath: str, config: dict) -> dict:
    # Read cleaned file if available, else original
    base         = os.path.splitext(os.path.basename(filepath))[0]
    cleaned_path = os.path.join(UPLOAD_DIR, f"{base}_cleaned.csv")
    data_path    = cleaned_path if os.path.exists(cleaned_path) else filepath
    df           = pd.read_csv(data_path)

    problem_type    = config["problem_type"]
    target_col      = config.get("target_column")
    feature_cols    = config["feature_columns"]
    models_to_train = config["models_to_train"]
    handle_imbalance = config.get("handle_imbalance", False)

    # Validate columns exist
    feature_cols = [c for c in feature_cols if c in df.columns]
    if target_col and target_col not in df.columns:
        target_col = None

    results      = {}
    best_name    = None
    best_score   = -999
    best_model   = None
    scaler       = StandardScaler()

    # ── Clustering ────────────────────────────────────────────────────────────
    if problem_type == "clustering":
        X, _, encoders, _ = prepare_features(df, feature_cols)
        X_scaled = scaler.fit_transform(X)

        for name in models_to_train:
            if name not in MODEL_MAP:
                continue
            try:
                m = MODEL_MAP[name]()
                labels = m.fit_predict(X_scaled)
                n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
                if n_clusters > 1:
                    score = float(silhouette_score(X_scaled, labels))
                else:
                    score = 0.0
                results[name] = {
                    "silhouette_score": round(score, 4),
                    "n_clusters":       n_clusters,
                }
                if score > best_score:
                    best_score = score
                    best_name  = name
                    best_model = m
            except Exception as e:
                results[name] = {"error": str(e)}

        metrics = results.get(best_name, {})
        feature_importance = {}

    # ── Supervised ────────────────────────────────────────────────────────────
    else:
        if not target_col:
            return {"error": "No target column found for supervised learning."}

        X, y, encoders, target_encoder = prepare_features(df, feature_cols, target_col)
        X_scaled = scaler.fit_transform(X)

        # Handle class imbalance
        if handle_imbalance and HAS_SMOTE and problem_type in ("binary_classification", "multiclass_classification"):
            try:
                sm      = SMOTE(random_state=42)
                X_scaled, y = sm.fit_resample(X_scaled, y)
            except Exception:
                pass

        X_train, X_test, y_train, y_test = train_test_split(
            X_scaled, y, test_size=0.2, random_state=42,
            stratify=y if problem_type in ("binary_classification", "multiclass_classification") else None
        )

        for name in models_to_train:
            if name not in MODEL_MAP:
                continue
            try:
                m = MODEL_MAP[name]()
                m.fit(X_train, y_train)
                preds = m.predict(X_test)

                if problem_type in ("binary_classification", "multiclass_classification"):
                    avg = "binary" if problem_type == "binary_classification" else "weighted"
                    acc  = float(accuracy_score(y_test, preds))
                    f1   = float(f1_score(y_test, preds, average=avg, zero_division=0))
                    prec = float(precision_score(y_test, preds, average=avg, zero_division=0))
                    rec  = float(recall_score(y_test, preds, average=avg, zero_division=0))
                    results[name] = {
                        "accuracy":  round(acc * 100, 2),
                        "f1_score":  round(f1 * 100, 2),
                        "precision": round(prec * 100, 2),
                        "recall":    round(rec * 100, 2),
                    }
                    score = f1
                else:
                    rmse = float(np.sqrt(mean_squared_error(y_test, preds)))
                    r2   = float(r2_score(y_test, preds))
                    results[name] = {
                        "rmse": round(rmse, 4),
                        "r2":   round(r2, 4),
                    }
                    score = r2

                if score > best_score:
                    best_score = score
                    best_name  = name
                    best_model = m

            except Exception as e:
                results[name] = {"error": str(e)}

        metrics = results.get(best_name, {})

        # Feature importance
        feature_importance = {}
        if best_model and hasattr(best_model, "feature_importances_"):
            imp = best_model.feature_importances_
            feature_importance = {
                col: round(float(v), 4)
                for col, v in sorted(zip(feature_cols, imp), key=lambda x: -x[1])
            }
        elif best_model and hasattr(best_model, "coef_"):
            coef = np.abs(best_model.coef_).flatten()[:len(feature_cols)]
            feature_importance = {
                col: round(float(v), 4)
                for col, v in sorted(zip(feature_cols, coef), key=lambda x: -x[1])
            }

    # ── Save best model ───────────────────────────────────────────────────────
    model_filename = None
    if best_model is not None:
        model_filename = f"{base}_{best_name}.pkl"
        model_path     = os.path.join(MODELS_DIR, model_filename)
        with open(model_path, "wb") as f:
            pickle.dump({
                "model":          best_model,
                "scaler":         scaler,
                "feature_cols":   feature_cols,
                "target_col":     target_col,
                "problem_type":   problem_type,
                "encoders":       encoders if "encoders" in dir() else {},
            }, f)

    # ── Generate inference code ───────────────────────────────────────────────
    inference_code = _generate_inference_code(
        best_name, feature_cols, target_col, problem_type, model_filename
    )

    return {
        "status":             "Training complete",
        "best_model":         best_name,
        "best_score":         round(best_score, 4),
        "problem_type":       problem_type,
        "target_column":      target_col,
        "feature_columns":    feature_cols,
        "model_filename":     model_filename,
        "metrics":            metrics,
        "all_results":        results,
        "feature_importance": feature_importance,
        "inference_code":     inference_code,
        "data_used":          os.path.basename(data_path),
    }


def _generate_inference_code(model_name, features, target, problem_type, pkl_file):
    feat_dict = "\n".join([f'    "{c}": [value],' for c in features[:6]])
    if len(features) > 6:
        feat_dict += f"\n    # ... {len(features) - 6} more columns"

    if problem_type in ("binary_classification", "multiclass_classification"):
        predict_block = (
            "prediction = bundle['model'].predict(X_scaled)\n"
            "proba      = bundle['model'].predict_proba(X_scaled)\n"
            f"print('Predicted {target}:', prediction[0])\n"
            "print('Confidence:', round(proba[0].max() * 100, 2), '%')"
        )
    elif problem_type == "regression":
        predict_block = (
            "prediction = bundle['model'].predict(X_scaled)\n"
            f"print('Predicted {target}:', prediction[0])"
        )
    else:
        predict_block = (
            "cluster = bundle['model'].predict(X_scaled)\n"
            "print('Cluster:', cluster[0])"
        )

    return f"""import pickle
import pandas as pd
import numpy as np

# Load model bundle
with open("{pkl_file or 'model.pkl'}", "rb") as f:
    bundle = pickle.load(f)

# Prepare input data (same columns as training)
data = pd.DataFrame({{
{feat_dict}
}})

# Encode categorical columns (same as training)
for col, encoder in bundle['encoders'].items():
    if col in data.columns:
        data[col] = encoder.transform(data[col].astype(str))

# Scale features
X_scaled = bundle['scaler'].transform(data[bundle['feature_cols']])

# Predict
{predict_block}
"""
