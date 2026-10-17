"""
preprocessing.py — Full ML-ready dataset preprocessing pipeline.

Works on ANY CSV dataset. No hardcoded rules. Every step is data-driven.
Output is a cleaned, ML-ready dataset with a detailed audit log.
"""

import math
import os
import numpy as np
import pandas as pd
from sklearn.impute import KNNImputer, SimpleImputer
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import LabelEncoder
from sklearn.linear_model import LogisticRegression
from app.config import UPLOAD_DIR, REPORTS_DIR

os.makedirs(REPORTS_DIR, exist_ok=True)


# ─── Utility ──────────────────────────────────────────────────────────────────
def _safe_float(v):
    try:
        f = float(v)
        return None if (math.isnan(f) or math.isinf(f)) else round(f, 4)
    except Exception:
        return None


# ─── Step 1: Structural Fixes ─────────────────────────────────────────────────
def fix_structure(df: pd.DataFrame) -> tuple:
    log = {}

    # Strip whitespace from column names
    original_cols = list(df.columns)
    df.columns    = df.columns.str.strip()
    renamed = [(o, n) for o, n in zip(original_cols, df.columns) if o != n]
    log["columns_renamed"] = renamed

    # Drop fully empty columns
    empty_cols = df.columns[df.isnull().all()].tolist()
    df = df.drop(columns=empty_cols)
    log["empty_columns_dropped"] = empty_cols

    # Drop fully empty rows
    empty_rows_before = len(df)
    df = df.dropna(how="all").reset_index(drop=True)
    log["empty_rows_dropped"] = empty_rows_before - len(df)

    # Strip whitespace from string values
    for col in df.select_dtypes(include=["object"]).columns:
        df[col] = df[col].str.strip()

    log["rows_after"] = len(df)
    return df, log


# ─── Step 2: Type Inference & Casting ────────────────────────────────────────
def infer_and_cast_types(df: pd.DataFrame) -> tuple:
    log = {"type_changes": {}}

    for col in df.columns:
        orig = str(df[col].dtype)

        # Try numeric conversion for object columns
        if df[col].dtype == object:
            converted = pd.to_numeric(df[col], errors="coerce")
            # If >80% converted successfully, cast to numeric
            valid_pct = converted.notna().sum() / max(len(df), 1)
            if valid_pct >= 0.8:
                df[col] = converted
                new_type = str(df[col].dtype)
                log["type_changes"][col] = f"{orig} → {new_type}"
                continue

            # Try boolean
            bool_map = {"true": True, "false": False, "yes": True, "no": False,
                        "1": True, "0": False}
            lower_vals = df[col].dropna().str.lower().unique()
            if set(lower_vals).issubset(bool_map.keys()):
                df[col] = df[col].str.lower().map(bool_map).astype("boolean")
                log["type_changes"][col] = f"{orig} → boolean"
                continue

        # Downcast integers to save memory
        if pd.api.types.is_integer_dtype(df[col]):
            df[col] = pd.to_numeric(df[col], downcast="integer")
        elif pd.api.types.is_float_dtype(df[col]):
            df[col] = pd.to_numeric(df[col], downcast="float")

    return df, log


# ─── Step 3: Duplicate Removal ────────────────────────────────────────────────
def remove_duplicates(df: pd.DataFrame) -> tuple:
    before = len(df)
    df     = df.drop_duplicates().reset_index(drop=True)
    removed = before - len(df)
    log = {
        "rows_before":        before,
        "duplicates_removed": removed,
        "rows_after":         len(df),
    }
    return df, log


# ─── Step 4: Missing Value Imputation ────────────────────────────────────────
def impute_missing(df: pd.DataFrame) -> tuple:
    log = {"numerical_imputed": [], "categorical_imputed": [], "columns_dropped": []}
    fitted_imputer = None

    # Drop columns with >60% missing — too sparse to impute reliably
    threshold = 0.6
    sparse    = [c for c in df.columns if df[c].isnull().mean() > threshold]
    df = df.drop(columns=sparse)
    log["columns_dropped"] = sparse

    num_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    cat_cols = df.select_dtypes(exclude=[np.number]).columns.tolist()

    # Numerical — KNN imputation (captures feature relationships)
    num_missing = [c for c in num_cols if df[c].isnull().any()]
    if num_missing:
        n_neighbors = min(5, len(df) - 1)
        imputer     = KNNImputer(n_neighbors=n_neighbors)
        df[num_cols] = imputer.fit_transform(df[num_cols])
        log["numerical_imputed"] = num_missing
        fitted_imputer = imputer

    # Categorical — most frequent
    cat_missing = [c for c in cat_cols if df[c].isnull().any()]
    if cat_missing:
        imputer  = SimpleImputer(strategy="most_frequent")
        df[cat_cols] = imputer.fit_transform(df[cat_cols])
        log["categorical_imputed"] = cat_missing

    return df, log, fitted_imputer


# ─── Step 5: Outlier Handling ─────────────────────────────────────────────────
def handle_outliers(df: pd.DataFrame, strategy: str = "clip") -> tuple:
    """
    strategy:
      'clip'   — clip to IQR bounds (preserves row count, good for regression/most tasks)
      'remove' — remove rows with extreme outliers via IsolationForest
      'flag'   — add is_outlier column, keep rows (good when you want to inspect)
    """
    log = {"strategy": strategy, "columns_clipped": [], "total_values_clipped": 0,
           "rows_removed": 0, "outliers_flagged": 0}
    fitted_iso = None

    num_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    # Exclude binary columns (0/1) — they're likely labels or flags
    feature_cols = [c for c in num_cols
                    if df[c].dropna().nunique() > 2]

    if not feature_cols:
        return df, log, fitted_iso

    if strategy == "clip":
        for col in feature_cols:
            q1  = df[col].quantile(0.25)
            q3  = df[col].quantile(0.75)
            iqr = q3 - q1
            lower = q1 - 3.0 * iqr
            upper = q3 + 3.0 * iqr
            clipped = int(((df[col] < lower) | (df[col] > upper)).sum())
            if clipped > 0:
                df[col] = df[col].clip(lower=lower, upper=upper)
                log["columns_clipped"].append(f"{col} ({clipped} values)")
                log["total_values_clipped"] += clipped

    elif strategy == "remove":
        iso   = IsolationForest(contamination=0.05, random_state=42, n_jobs=-1)
        preds = iso.fit_predict(df[feature_cols].fillna(df[feature_cols].median()))
        mask  = preds == -1
        removed = int(mask.sum())
        df    = df[~mask].reset_index(drop=True)
        log["rows_removed"] = removed
        fitted_iso = iso

    elif strategy == "flag":
        iso   = IsolationForest(contamination=0.05, random_state=42, n_jobs=-1)
        preds = iso.fit_predict(df[feature_cols].fillna(df[feature_cols].median()))
        df    = df.copy()
        df["is_outlier"] = (preds == -1).astype(int)
        log["outliers_flagged"] = int((preds == -1).sum())
        fitted_iso = iso

    return df, log, fitted_iso


# ─── Step 6: Constant & Low-Variance Column Removal ──────────────────────────
def remove_low_variance(df: pd.DataFrame) -> tuple:
    log = {"constant_columns_dropped": [], "near_constant_dropped": []}

    # Constant columns (single unique value)
    const_cols = [c for c in df.columns if df[c].nunique() <= 1]
    df = df.drop(columns=const_cols)
    log["constant_columns_dropped"] = const_cols

    # Near-constant numerical columns (>98% same value)
    for col in df.select_dtypes(include=[np.number]).columns:
        top_pct = df[col].value_counts(normalize=True).iloc[0]
        if top_pct >= 0.98:
            df = df.drop(columns=[col])
            log["near_constant_dropped"].append(col)

    return df, log


# ─── Step 7: Duplicate Columns ────────────────────────────────────────────────
def remove_duplicate_columns(df: pd.DataFrame) -> tuple:
    log = {"duplicate_columns_dropped": []}
    seen   = {}
    to_drop = []
    for col in df.columns:
        key = tuple(df[col].fillna("__NAN__").astype(str).values)
        if key in seen:
            to_drop.append(col)
            log["duplicate_columns_dropped"].append(f"{col} (duplicate of {seen[key]})")
        else:
            seen[key] = col
    df = df.drop(columns=to_drop)
    return df, log


# ─── Step 8: Label Error Detection ───────────────────────────────────────────
def detect_label_errors(df: pd.DataFrame) -> tuple:
    log = {"label_errors_found": 0, "skipped": False, "target_column": None}

    # Auto-detect binary target: a column with exactly 2 values (0/1 or similar)
    target_col = None
    for col in reversed(df.columns.tolist()):  # check last columns first (target usually last)
        unique_vals = set(df[col].dropna().unique())
        if len(unique_vals) == 2 and unique_vals.issubset({0, 1, True, False, "0", "1"}):
            target_col = col
            break

    if target_col is None:
        log["skipped"] = True
        log["reason"]  = "No binary target column detected."
        return df, log

    log["target_column"] = target_col

    try:
        from cleanlab.classification import CleanLearning

        feature_cols = [c for c in df.columns if c not in [target_col, "is_outlier"]]
        X = df[feature_cols].copy()
        y = df[target_col].astype(int).values

        # Encode categoricals
        for col in X.select_dtypes(exclude=[np.number]).columns:
            le   = LabelEncoder()
            X[col] = le.fit_transform(X[col].astype(str))

        X = X.select_dtypes(include=[np.number]).fillna(0).values

        if X.shape[1] == 0:
            raise ValueError("No numeric features available after encoding.")

        clf    = LogisticRegression(max_iter=1000, random_state=42, n_jobs=-1)
        cl     = CleanLearning(clf=clf)
        cl.fit(X, y)
        issues = cl.find_label_issues(X, y)

        mask  = issues["is_label_issue"].values
        count = int(mask.sum())
        log["label_errors_found"] = count

        # Flag but do not remove — user decides
        df = df.copy()
        df["label_issue"] = mask.astype(int)

    except Exception as e:
        log["skipped"] = True
        log["reason"]  = f"CleanLab skipped: {str(e)}"

    return df, log


# ─── Master Pipeline ──────────────────────────────────────────────────────────
def preprocess_dataset(filepath: str, outlier_strategy: str = "clip") -> dict:
    df             = pd.read_csv(filepath)
    original_shape = {"rows": len(df), "columns": len(df.columns)}
    audit          = {}

    # Run pipeline steps
    df, audit["structure"]                     = fix_structure(df)
    df, audit["type_inference"]                = infer_and_cast_types(df)
    df, audit["duplicates"]                    = remove_duplicates(df)
    df, audit["missing_values"], knn_imputer   = impute_missing(df)
    df, audit["outliers"], isolation_forest    = handle_outliers(df, strategy=outlier_strategy)
    df, audit["low_variance"]                  = remove_low_variance(df)
    df, audit["duplicate_columns"]             = remove_duplicate_columns(df)
    df, audit["label_errors"]                  = detect_label_errors(df)

    fitted_models = {
        "knn_imputer":      knn_imputer,
        "isolation_forest": isolation_forest,
    }

    # Save cleaned file — drop internal flag columns
    flag_cols   = [c for c in ["is_outlier", "label_issue"] if c in df.columns]
    clean_df    = df.drop(columns=flag_cols)

    base         = os.path.splitext(os.path.basename(filepath))[0]
    cleaned_path = os.path.join(UPLOAD_DIR, f"{base}_cleaned.csv")
    clean_df.to_csv(cleaned_path, index=False)

    cleaned_shape = {"rows": len(clean_df), "columns": len(clean_df.columns)}

    # Build summary
    rows_removed = original_shape["rows"] - cleaned_shape["rows"]
    cols_removed = original_shape["columns"] - cleaned_shape["columns"]

    return {
        "status":          "Preprocessing complete",
        "original_shape":  original_shape,
        "cleaned_shape":   cleaned_shape,
        "rows_removed":    rows_removed,
        "columns_removed": cols_removed,
        "cleaned_file":    f"{base}_cleaned.csv",
        "outlier_strategy": outlier_strategy,
        "audit":           audit,
        "_fitted_models":  fitted_models,  # popped by the route before the JSON response
    }
