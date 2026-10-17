import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Redirect all app data (uploads, datasets, models, mlflow.db, monitoring.db)
# into an isolated scratch directory BEFORE the app (and its config-derived
# module-level paths) get imported — otherwise pytest runs would read/write
# the same files a live dev server is using.
_scratch_dir = tempfile.mkdtemp(prefix="mlops_pytest_")
(Path(_scratch_dir) / "backend").mkdir(parents=True, exist_ok=True)
os.environ["MLOPS_TEST_ROOT"] = _scratch_dir

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="session")
def client():
    return TestClient(app)


@pytest.fixture
def sample_csv(tmp_path):
    """A small, valid, generic dataset — enough rows/columns to pass validation."""
    df = pd.DataFrame({
        "age":          [25, 30, 35, 40, 45, 28, 33, 38, 42, 27, 31, 36, 41, 26, 29],
        "salary":       [40000, 55000, 60000, 75000, 90000, 42000, 58000, 62000, 80000, 41000,
                          57000, 61000, 78000, 43000, 59000],
        "department":   ["Eng", "Sales", "Eng", "HR", "Eng", "Sales", "HR", "Eng", "Sales", "Eng",
                          "HR", "Eng", "Sales", "HR", "Eng"],
        "left_company": [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    })
    path = tmp_path / "sample.csv"
    df.to_csv(path, index=False)
    return path
