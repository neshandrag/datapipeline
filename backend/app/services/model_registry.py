"""
Model Registry — versions and stages the models the repair pipeline fits
(KNNImputer for missing values, IsolationForest for outliers) using MLflow's
Model Registry, plus a local joblib copy under models/ for offline access.

Must be called from inside an active MLflow run (see mlflow_tracker.py).
New versions land in "Staging"; promote_model() moves them to "Production"
or back to "Development" (mapped to MLflow's "None" stage).
"""
import os

import joblib
import mlflow
import mlflow.sklearn
from mlflow.tracking import MlflowClient

from app.config import REPO_ROOT

MODELS_DIR = str(REPO_ROOT / "models")
os.makedirs(MODELS_DIR, exist_ok=True)

REGISTRY_NAMES = {
    "knn_imputer":      "knn-missing-value-imputer",
    "isolation_forest": "isolation-forest-outlier-detector",
}

VALID_STAGES = {"Development", "Staging", "Production", "Archived"}


def register_models(fitted_models: dict, dataset_name: str) -> list:
    active_run = mlflow.active_run()
    if active_run is None:
        return [{"error": "register_models() called with no active MLflow run"}]

    client  = MlflowClient()
    results = []

    for key, model in fitted_models.items():
        if model is None:
            continue
        registry_name = REGISTRY_NAMES.get(key, key)
        try:
            mlflow.sklearn.log_model(model, artifact_path=key)
            model_uri = f"runs:/{active_run.info.run_id}/{key}"
            mv = mlflow.register_model(model_uri, registry_name)

            client.update_model_version(
                name=registry_name,
                version=mv.version,
                description=f"Auto-registered from repair run on '{dataset_name}'.",
            )
            client.transition_model_version_stage(
                name=registry_name,
                version=mv.version,
                stage="Staging",
                archive_existing_versions=False,
            )

            local_dir = os.path.join(MODELS_DIR, registry_name)
            os.makedirs(local_dir, exist_ok=True)
            local_path = os.path.join(local_dir, f"v{mv.version}.joblib")
            joblib.dump(model, local_path)

            results.append({
                "name":       registry_name,
                "version":    mv.version,
                "stage":      "Staging",
                "run_id":     active_run.info.run_id,
                "local_path": local_path,
            })
        except Exception as e:
            results.append({"name": registry_name, "error": str(e)[:300]})

    return results


def promote_model(name: str, version: int, stage: str) -> dict:
    if stage not in VALID_STAGES:
        raise ValueError(f"stage must be one of {VALID_STAGES}, got '{stage}'")

    client = MlflowClient()
    mlflow_stage = "None" if stage == "Development" else stage
    client.transition_model_version_stage(
        name=name,
        version=version,
        stage=mlflow_stage,
        archive_existing_versions=(stage == "Production"),
    )
    return {"name": name, "version": version, "stage": stage}


def list_registered_models() -> list:
    client = MlflowClient()
    out = []
    for rm in client.search_registered_models():
        versions = [
            {
                "version":            mv.version,
                "stage":              mv.current_stage,
                "run_id":             mv.run_id,
                "creation_timestamp": mv.creation_timestamp,
            }
            for mv in client.search_model_versions(f"name='{rm.name}'")
        ]
        versions.sort(key=lambda v: int(v["version"]), reverse=True)
        out.append({"name": rm.name, "versions": versions})
    return out
