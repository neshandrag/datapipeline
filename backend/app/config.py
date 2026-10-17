import os
from pathlib import Path

# ── Base paths (always relative to this file, not CWD) ───────────────────────
# MLOPS_TEST_ROOT redirects everything below into an isolated scratch directory
# (set by tests/conftest.py) so pytest runs never touch the real uploads,
# datasets, models, or mlflow/monitoring databases that a live server is using.
_test_root = os.environ.get("MLOPS_TEST_ROOT")
if _test_root:
    REPO_ROOT = Path(_test_root)
    BASE_DIR  = REPO_ROOT / "backend"
else:
    BASE_DIR  = Path(__file__).resolve().parent.parent   # backend/
    REPO_ROOT = BASE_DIR.parent                           # mlops repo root

UPLOAD_DIR  = str(BASE_DIR / "uploads")
REPORTS_DIR = str(BASE_DIR / "reports")
DATASETS_DIR = str(REPO_ROOT / "datasets")

os.makedirs(UPLOAD_DIR,  exist_ok=True)
os.makedirs(REPORTS_DIR, exist_ok=True)

# ── MLflow ────────────────────────────────────────────────────────────────────
MLFLOW_DB_PATH       = str(BASE_DIR / "mlflow.db")
MLFLOW_TRACKING_URI  = f"sqlite:///{MLFLOW_DB_PATH}"
MLFLOW_EXPERIMENT    = "Dataset-Repair-Pipeline"

# ── Validation ────────────────────────────────────────────────────────────────
MIN_ROWS        = 10
MIN_COLUMNS     = 2
MAX_FILE_SIZE_MB = 50
