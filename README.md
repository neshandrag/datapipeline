<div align="center">

# DataPrep

**AI-Powered Dataset Repair & MLOps Platform**

Upload a messy CSV. Get back a clean, versioned, production-ready dataset — profiled, repaired, quality-scored, tracked, and monitored end to end.

[![Python](https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=white)](backend/requirements.txt)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.139-009688?logo=fastapi&logoColor=white)](backend/app/main.py)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](frontend/package.json)
[![MLflow](https://img.shields.io/badge/MLflow-3.14-0194E2?logo=mlflow&logoColor=white)](backend/requirements.txt)
[![DVC](https://img.shields.io/badge/DVC-3.67-945DD6?logo=dvc&logoColor=white)](backend/requirements.txt)
[![CI](https://img.shields.io/badge/CI-GitHub_Actions-2088FF?logo=githubactions&logoColor=white)](.github/workflows/ci.yml)

</div>

---

## What It Does

Raw datasets are almost never clean enough to train on. DataPrep puts a CSV through a complete, auditable pipeline:

1. **Validates** the file (size, schema, shape)
2. **Detects drift** if the file was uploaded before (KS test, missing-rate delta, outlier-rate delta)
3. **Profiles** the dataset statistically (missing values, duplicates, correlations, type breakdown)
4. **Repairs** it in 8 data-driven steps — no hardcoded rules, works on any CSV
5. **Scores quality** before and after (Completeness · Uniqueness · Validity · Consistency)
6. **Generates a PDF report** + JSON summary + cleaned CSV download
7. **Versions everything** with DVC (raw → profiled → repaired)
8. **Logs every run** to MLflow (params, metrics, artifacts)
9. **Registers the fitted models** (KNNImputer, IsolationForest) in the MLflow Model Registry
10. **Auto-retrains and promotes** models when drift is detected
11. **Monitors the platform** live — uploads, failures, quality trends, activity feed
12. **Trains ML models** from a plain-English description via LLM (Llama 3.3 70B / Groq)

---

## The Repair Pipeline (8 Steps)

| Step | What happens | Model / Method |
|---|---|---|
| 1 | Strip whitespace, drop empty rows/columns | pandas |
| 2 | Infer and cast types (strings → numeric, yes/no → bool) | `pandas.to_numeric` |
| 3 | Remove duplicate rows | `drop_duplicates` |
| 4 | Impute missing values | **KNNImputer** (numerical) · **SimpleImputer** (categorical) |
| 5 | Handle outliers — clip / remove / flag | **IsolationForest** · IQR bounds |
| 6 | Drop constant and near-constant columns | `nunique` / `value_counts` |
| 7 | Drop duplicate columns | Hash comparison |
| 8 | Detect label errors | **CleanLab** + **LogisticRegression** |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend API | FastAPI + Uvicorn (Python 3.13) |
| Data processing | pandas 2.3, NumPy 2.5 |
| ML | scikit-learn 1.9 (KNNImputer, IsolationForest, LogisticRegression) |
| Label error detection | CleanLab 2.9 |
| Schema validation | Pandera 0.32 |
| Drift detection | SciPy 1.18 (KS test) |
| Experiment tracking | MLflow 3.14 (SQLite backend) |
| Data versioning | DVC 3.67 (local filesystem remote) |
| Report generation | ReportLab 5.0 |
| LLM | Llama 3.3 70B via Groq API |
| Monitoring store | SQLite (independent of MLflow) |
| Frontend | React 19 + Vite 8 |
| CI | GitHub Actions |

---

## Getting Started

**Prerequisites:** Python 3.13, Node 20+, git

```bash
git clone <repo-url>
cd MLOps
```

### Backend

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

API → `http://localhost:8000`  
Swagger docs → `http://localhost:8000/docs`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App → `http://localhost:5173`

### Optional — MLflow UI

```bash
cd backend
mlflow ui --backend-store-uri sqlite:///mlflow.db --port 5000
```

MLflow UI → `http://localhost:5000`

### Optional — DVC

```bash
dvc pull   # fetch tracked dataset versions from dvc-storage/
```

### Tests

```bash
cd backend
pytest tests/ -v
```

---

## Configuration

All paths live in `backend/app/config.py`, resolved relative to the file itself.

| Setting | Default | Notes |
|---|---|---|
| `UPLOAD_DIR` | `backend/uploads/` | Raw uploads + cleaned CSVs |
| `REPORTS_DIR` | `backend/reports/` | Generated PDF / JSON reports |
| `DATASETS_DIR` | `datasets/` | DVC-tracked raw / profiled / repaired / drift |
| `MLFLOW_TRACKING_URI` | `sqlite:///backend/mlflow.db` | MLflow backend store |
| `MLFLOW_EXPERIMENT` | `Dataset-Repair-Pipeline` | MLflow experiment name |
| `MIN_ROWS` / `MIN_COLUMNS` | `10` / `2` | Minimum dataset size |
| `MAX_FILE_SIZE_MB` | `50` | Upload size limit |

Frontend API base URL defaults to `http://localhost:8000` and can be overridden from the **Settings** page (stored in `localStorage`).

---

## Pages

| Page | URL | Purpose |
|---|---|---|
| Landing | `/` | Entry point |
| Dashboard | `/dashboard` | Pipeline status, monitoring snapshot, quick actions |
| Upload | `/upload` | CSV upload, validation feedback, drift alert, auto-retrain summary |
| Analysis | `/analysis` | Full statistical profile |
| Repair | `/repair` | Runs the pipeline, shows full audit log |
| Quality | `/quality` | Before/after scores, PDF / JSON / CSV downloads |
| Monitoring | `/monitoring` | Live stats, activity feed, Model Registry state |
| Settings | `/settings` | API base URL override |

---

## Project Structure

```
MLOps/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, CORS, router registration
│   │   ├── config.py            # Paths, thresholds, MLflow config
│   │   ├── routes/              # upload · profile · repair · report
│   │   │                        # registry · monitoring · drift · ai_trainer
│   │   ├── services/
│   │   │   ├── validation.py        # File + schema validation (Pandera)
│   │   │   ├── profiling.py         # Statistical profiling
│   │   │   ├── preprocessing.py     # 8-step repair pipeline
│   │   │   ├── quality.py           # Weighted quality scoring
│   │   │   ├── report_generator.py  # PDF + JSON report
│   │   │   ├── drift_detection.py   # KS test + missing/outlier delta
│   │   │   ├── auto_retrain.py      # Drift-triggered retrain + promote
│   │   │   ├── mlflow_tracker.py    # MLflow experiment logging
│   │   │   ├── model_registry.py    # MLflow registry + stage promotion
│   │   │   ├── monitoring.py        # SQLite event log
│   │   │   ├── dvc_tracker.py       # Per-stage DVC versioning
│   │   │   ├── gemini_analyzer.py   # Groq LLM training config analysis
│   │   │   └── model_trainer.py     # Multi-model train + evaluate + save
│   │   └── utils/
│   ├── tests/                   # pytest suite
│   ├── requirements.txt
│   ├── mlflow.db                # MLflow SQLite store (gitignored)
│   └── monitoring.db            # Monitoring SQLite store (gitignored)
├── frontend/
│   └── src/
│       ├── pages/               # One file per page
│       ├── components/          # Sidebar, NavIcons, SplashScreen, etc.
│       ├── api.js               # Axios client
│       └── index.css            # Design tokens + component styles
├── datasets/
│   ├── raw/                     # DVC-tracked uploads
│   ├── profiled/                # DVC-tracked profile JSONs
│   ├── repaired/                # DVC-tracked cleaned CSVs
│   └── drift/                   # Drift reports
├── models/                      # Local .joblib copies of registered models
├── dvc-storage/                 # Local DVC remote
├── .github/workflows/ci.yml     # Backend pytest + frontend build on every push/PR
├── PROJECT_OVERVIEW.md          # Deep-dive: problem, solution, every step explained
└── plan.md                      # Phase-by-phase build log
```

---

## Roadmap

- [ ] Real authentication (login page is currently UI-only)
- [ ] Docker + docker-compose + CI deploy step
- [ ] Networked MLflow / monitoring backends for multi-replica deployments
- [ ] Batch / multi-file upload
- [ ] Broader test coverage

---

<div align="center">

For a full breakdown of the problem, solution, workflow, and how every step is implemented, see [`PROJECT_OVERVIEW.md`](PROJECT_OVERVIEW.md).

</div>
