"""
Versions each stage of the dataset lifecycle (raw -> profiled -> repaired)
with DVC. Every call copies/writes the stage artifact into datasets/<stage>/
and runs `dvc add` on it, so re-running the pipeline on updated data produces
a new content hash the next `git commit` snapshots as a new version.

DVC failures never break the API response — tracking is best-effort.
"""
import json
import os
import shutil
import subprocess
import sys

from app.config import DATASETS_DIR, REPO_ROOT

RAW_DIR      = os.path.join(DATASETS_DIR, "raw")
PROFILED_DIR = os.path.join(DATASETS_DIR, "profiled")
REPAIRED_DIR = os.path.join(DATASETS_DIR, "repaired")

for _d in (RAW_DIR, PROFILED_DIR, REPAIRED_DIR):
    os.makedirs(_d, exist_ok=True)


def _dvc_add(path: str) -> dict:
    rel_path = os.path.relpath(path, REPO_ROOT)
    try:
        result = subprocess.run(
            [sys.executable, "-m", "dvc", "add", rel_path],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.returncode != 0:
            return {"tracked": False, "error": result.stderr.strip()[:500]}
        return {"tracked": True, "dvc_file": f"{rel_path}.dvc"}
    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        return {"tracked": False, "error": str(exc)}


def track_raw(filepath: str) -> dict:
    dest = os.path.join(RAW_DIR, os.path.basename(filepath))
    if os.path.abspath(dest) != os.path.abspath(filepath):
        shutil.copyfile(filepath, dest)
    return _dvc_add(dest)


def track_profiled(filename: str, profile: dict) -> dict:
    base = os.path.splitext(filename)[0]
    dest = os.path.join(PROFILED_DIR, f"{base}_profile.json")
    with open(dest, "w") as f:
        json.dump(profile, f, indent=2, default=str)
    return _dvc_add(dest)


def track_repaired(cleaned_path: str) -> dict:
    dest = os.path.join(REPAIRED_DIR, os.path.basename(cleaned_path))
    shutil.copyfile(cleaned_path, dest)
    return _dvc_add(dest)
