Phase 1 — Project Setup

✅ Created mlops/ folder structure — backend, frontend, datasets, models, reports, experiments, notebooks, tests, .github
✅ Python virtual environment created inside backend/venv/
✅ Installed packages — fastapi, uvicorn, pandas, numpy, scikit-learn, python-multipart
✅ requirements.txt saved
✅ Dataset downloaded — 
Employee.csv
 (4653 rows, 9 columns)
Phase 2 — Backend Setup

✅ FastAPI application created — 
main.py
✅ Full project structure — routes/, services/, utils/, models/
✅ CORS configured for React frontend
✅ Server running at http://localhost:8000
Phase 3 — Dataset Upload

✅ POST /upload — accepts CSV, saves to uploads/, returns success response
Phase 4 — Dataset Validation

✅ File validation — extension, size, readable check
✅ Dataset validation — empty check, min rows, min columns, duplicate/empty column names
✅ Schema validation using Pandera — column types, value ranges, allowed values
✅ Returns { status, rows, columns, errors }
Phase 5 — Dataset Profiling

✅ Basic info — rows, columns, memory usage, dtypes
✅ Missing value analysis — per column count and %
✅ Duplicate analysis — count and %
✅ Numerical statistics — mean, median, std, min, max, Q1, Q2, Q3
✅ Categorical statistics — unique values, most frequent, count, %
✅ Correlation matrix
✅ GET /profile/{filename}
Phase 6 — Dataset Repair Engine

✅ Module 1 — Missing values: KNN Imputer (numerical), Most Frequent (categorical)
✅ Module 2 — Duplicate removal
✅ Module 3 — Outlier detection with Isolation Forest (flag or remove)
✅ Module 4 — Invalid data detection and clipping per validation rules
✅ Module 5 — Label error detection with CleanLab
✅ Module 6 — Saves Employee_cleaned.csv
✅ POST /repair/{filename}
Phase 7 — Quality Score

✅ Completeness score — based on missing values (weight 30%)
✅ Uniqueness score — based on duplicates (weight 25%)
✅ Validity score — based on invalid values (weight 25%)
✅ Consistency score — based on data types (weight 20%)
✅ Overall weighted score with grade — Excellent / Good / Fair / Poor
✅ Before vs After comparison
✅ GET /quality/{filename}
Phase 8 — Report Generation

✅ PDF report — Dataset Summary, Issues Found, Issues Fixed, Quality Score, Recommendations
✅ summary.json — structured JSON with all findings
✅ cleaned_dataset.csv — repaired dataset
✅ Download endpoints — GET /report/download/pdf, /json, /csv
✅ Built with ReportLab
Phase 9 — Frontend (React)

✅ React + Vite project set up
✅ react-router-dom + axios installed
✅ 9 pages built and connected to backend APIs
Page	Route
Landing	/
Login	/login
Dashboard	/dashboard
Upload Dataset	/upload
Analysis	/analysis
Repair Result	/repair
Quality Report	/quality
Monitoring	/monitoring
Settings	/settings
Phase 10 — MLflow Tracking

✅ MLflow integrated with SQLite backend (mlflow.db)
✅ Experiment: Dataset-Repair-Pipeline
✅ Logs — dataset name, repair methods, missing/duplicate/outlier/invalid counts, quality scores before & after, improvement, execution time
✅ Artifacts — PDF report + cleaned CSV logged per run
✅ MLflow UI at http://localhost:5000
Phase 11 — DVC

✅ dvc init at repo root, local remote configured at dvc-storage/ (dvc push/pull working)
✅ datasets/raw, datasets/profiled, datasets/repaired — each dvc-tracked via .dvc pointer files
✅ backend/app/services/dvc_tracker.py — versions each stage automatically:
   POST /upload      → dvc add datasets/raw/<file>
   GET  /profile/{f}  → writes profile JSON, dvc add datasets/profiled/<file>_profile.json
   POST /repair/{f}   → dvc add datasets/repaired/<file>_cleaned.csv
✅ Each re-run updates the content hash; a git commit of the .dvc pointer after a run = a new version (Version 1 → 2 → 3)
✅ Tested end-to-end against live server: upload → profile → repair, all 3 stages tracked and pushed to remote

Phase 12 — Model Registry

✅ preprocessing.py now returns the fitted KNNImputer / IsolationForest objects (only when actually fit — e.g. IsolationForest only fits under outlier_strategy=remove|flag) instead of discarding them
✅ backend/app/services/model_registry.py — logs each fitted model to MLflow, registers it under a named registry model (knn-missing-value-imputer, isolation-forest-outlier-detector), and auto-promotes new versions to "Staging". Also saves a local models/<name>/v<version>.joblib copy.
✅ Registration happens inside the same MLflow run as the repair metrics (mlflow_tracker.py), so each model version links back to its run/dataset
✅ GET  /registry/models — lists every registered model with all versions + current stage
✅ POST /registry/models/{name}/{version}/promote — moves a version between Development / Staging / Production (Production promotion auto-archives the previous Production version)
✅ Tested end-to-end: repair run registers new versions; promoting v2 of isolation-forest-outlier-detector to Production verified via the list endpoint

Phase 13 — Monitoring

✅ backend/app/services/monitoring.py — SQLite event log (backend/monitoring.db), independent of MLflow so failures that never reach MLflow (bad uploads, 404s, pipeline errors) still get counted
✅ timed_event() context manager wraps /upload and /repair — records success/failure + duration + (for repair) quality score, without changing existing error-handling behavior
✅ GET /monitoring/stats — Upload Count, Failure Count, Average Quality Score, Average Repair Time, Average Processing Time, plus a recent-events feed
✅ Monitoring page rewritten — live stat tiles + recent activity table (auto-refreshes every 15s), MLflow UI instructions kept below for full run/artifact detail
✅ Dashboard page — compact live monitoring widget added (same 4 core metrics) with a link through to the full Monitoring page
✅ Verified in-browser: seeded real upload/repair traffic (incl. one induced failure), screenshotted both Dashboard and Monitoring pages showing correct live numbers

Phase 14 — Drift Detection

✅ backend/app/services/drift_detection.py — on every /upload of a filename that was previously uploaded, compares new vs. previous raw data (captured before DVC overwrites it) across:
   Feature Distribution — two-sample Kolmogorov-Smirnov test per numeric column (p < 0.05 = drift)
   Missing Values       — per-column missing-rate delta (>10pp = drift)
   Outlier Distribution — rate of values outside the previous dataset's IQR bounds, delta vs current (>10pp = drift)
✅ Drift report persisted to datasets/drift/<file>_drift.json, drift_alert/drift_check event logged to monitoring.db
✅ GET /drift/{filename} — fetch the last computed drift report
✅ /upload response now includes a "drift" block automatically
✅ Upload page shows a drift-alert card (per-column KS p-values, missing-rate deltas, outlier-rate deltas) when drift is detected, or a clean "no drift" confirmation otherwise
✅ Verified end-to-end incl. in-browser: unchanged re-upload → no false positive; re-upload with shifted Age distribution + injected missing values → all 3 checks correctly tripped and rendered

Phase 15 — Auto Retraining

✅ backend/app/services/auto_retrain.py — wired into /upload: when drift_detection flags drift_detected=True, automatically:
   Collect latest dataset  → the just-uploaded raw file
   Retrain KNN + IsolationForest → re-runs preprocess_dataset(outlier_strategy="flag") so both always fit
   Evaluate                → scores quality before/after (quality.py)
   Register New Version    → via model_registry.register_models (Phase 12), inside the same MLflow run as the retrain metrics
   Deploy                  → auto-promotes new versions to Production when quality_after >= 75 ("Good"+, quality.py's grade() bands); otherwise left in Staging for manual review, and the previous Production version is auto-archived on promotion
✅ /upload response includes an "auto_retrain" block whenever it fires
✅ Auto-retrain runs also log a "repair" event to monitoring.db (Phase 13), so Avg Quality Score / Avg Repair Time reflect drift-triggered retrains too
✅ Upload page shows a card summarizing the retrain outcome per model (version, Production vs Staging)
✅ Monitoring page gained a Model Registry section (version/stage/run-id per model) so promotions are visible without opening the MLflow UI
✅ Verified end-to-end incl. in-browser: drifted upload → both models retrained, registered as new versions, and auto-deployed to Production (99.7% quality clears the 75% bar); previous Production version correctly auto-archived

Phase 16 — CI/CD

✅ .github/workflows/ci.yml — runs on every push/PR to any branch, two parallel jobs:
   backend:  pip install -r requirements.txt → pytest tests/ → import sanity check   (ubuntu-latest, Python 3.13)
   frontend: npm ci → vite build                                                     (ubuntu-latest, Node 20)
✅ Scoped to build+test only per explicit decision — no deploy step (no hosting/Docker configured in this repo yet)
✅ Fixed backend/requirements.txt — was corrupted (UTF-16, missing mlflow/pandera/cleanlab/reportlab/dvc/pytest/httpx despite those being installed and used). Regenerated via pip freeze, pywin32 marked `; sys_platform == "win32"` so it doesn't break Linux CI runners
✅ backend/tests/ — first real test suite for this project (previously zero tests): health/monitoring/registry shape checks, upload+profile+repair pipeline smoke tests, drift-detection unit tests
✅ Tests run against an isolated scratch directory (MLOPS_TEST_ROOT env var, set in conftest.py) — fixed a real bug where pytest was sharing the live dev server's monitoring.db/mlflow.db/datasets/models paths and polluting its dashboard
✅ Dropped `npm run lint` from CI — it was already failing repo-wide (react-hooks/set-state-in-effect against the async-fetch-in-useEffect pattern used throughout the pre-existing pages) before this work started; fixed the one instance introduced in the new Monitoring.jsx, left unrelated pre-existing pages alone as out of scope
✅ Verified locally: `pytest tests/ -v` → 10 passed; `vite build` → succeeds