"""
Auto Retraining — triggered automatically when drift_detection flags a
newly uploaded dataset (see routes/upload.py). Re-runs the full
preprocessing pipeline on the new data to retrain KNNImputer and
IsolationForest, registers the resulting model versions (Phase 12), and
evaluates them: a new version is auto-promoted to Production when the
post-repair quality score clears the bar, otherwise it lands in Staging
for manual review.
"""
import os

from app.config import UPLOAD_DIR, REPORTS_DIR
from app.services.preprocessing import preprocess_dataset
from app.services.quality import score_dataset, grade
from app.services.mlflow_tracker import track_repair_run
from app.services.model_registry import promote_model
from app.services.monitoring import timed_event

# "Good" or better, per quality.py's grade() bands.
PROMOTION_QUALITY_THRESHOLD = 75.0


def trigger_retraining(filename: str, raw_path: str) -> dict:
    with timed_event("repair", filename) as ev:
        # 1-2. Collect the latest dataset + retrain (KNNImputer, IsolationForest)
        #      strategy='flag' keeps every row while still fitting IsolationForest.
        result = preprocess_dataset(raw_path, outlier_strategy="flag")
        fitted_models = result.pop("_fitted_models", {})

        base         = os.path.splitext(filename)[0]
        cleaned_path = os.path.join(UPLOAD_DIR, f"{base}_cleaned.csv")
        pdf_path     = os.path.join(REPORTS_DIR, f"{base}_report.pdf")

        # 3. Evaluate
        quality_before = score_dataset(raw_path)
        quality_after  = score_dataset(cleaned_path)
        score          = quality_after["overall_score"]
        ev["quality_score"] = score

        # Register new version (logs + registers inside one MLflow run)
        mlflow_result = track_repair_run(
            filename       = f"{filename} (auto-retrain)",
            repair_log     = result["audit"],
            quality_before = quality_before,
            quality_after  = quality_after,
            cleaned_path   = cleaned_path,
            pdf_path       = pdf_path,
            fitted_models  = fitted_models,
        )

        # 4. Deploy — promote to Production only if the retrained models clear the bar
        deployed = []
        if score >= PROMOTION_QUALITY_THRESHOLD:
            for m in mlflow_result.get("registered_models", []):
                if "version" in m:
                    promote_model(m["name"], m["version"], "Production")
                    deployed.append({"name": m["name"], "version": m["version"]})

        return {
            "triggered_by":           "drift_detected",
            "quality_before":         quality_before["overall_score"],
            "quality_after":          score,
            "grade":                  grade(score),
            "registered_models":      mlflow_result.get("registered_models", []),
            "deployed_to_production": deployed,
            "promotion_threshold":    PROMOTION_QUALITY_THRESHOLD,
        }
