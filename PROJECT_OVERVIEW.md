# DataPrep — Project Overview

---

## The Problem

Raw CSV datasets are almost never clean enough to feed directly into a machine learning
pipeline. They arrive with:

- **Missing values** in critical columns
- **Duplicate rows** inflating training data
- **Outliers** skewing model weights
- **Wrong data types** (numbers stored as strings, booleans as yes/no text)
- **Constant or near-constant columns** that add noise with no signal
- **Label errors** — rows where the ground-truth label is likely mislabelled
- **No version history** — no way to compare this run against the last one
- **No visibility** — once cleaned, there's no record of what was done or how quality changed

Beyond cleaning, once a model is deployed, the incoming data can **drift** — its
statistical distribution silently shifts, degrading model performance with no alert.

---

## Our Solution

**DataPrep** is a full-stack MLOps platform that takes a raw CSV through a
complete, auditable pipeline and hands back a production-ready dataset —
profiled, cleaned, quality-scored, versioned, tracked, and monitored, end to end.

Every run is:
- Logged as an **MLflow experiment** (parameters, metrics, artifacts)
- Versioned with **DVC** (content-hash per pipeline stage)
- Scored with a **weighted quality metric** (before vs after)
- Summarised in a **downloadable PDF report**
- Monitored in a **live dashboard**

Incoming re-uploads of the same file are automatically **drift-checked** against the
previous version, and detected drift **triggers automatic retraining and redeployment**
of the fitted models — all without any manual intervention.

---

## Full Workflow (End-to-End)

```
User uploads CSV
      │
      ▼
[1] VALIDATION          — Is the file safe and structurally valid?
      │
      ▼
[2] DRIFT CHECK         — Has this file been uploaded before? Compare new vs old.
      │   (if drift detected)
      ▼
[2b] AUTO-RETRAIN       — Re-fit models, re-score, register & promote if quality ≥ 75%
      │
      ▼
[3] DVC VERSIONING      — Content-hash the raw file → datasets/raw/
      │
      ▼
[4] STATISTICAL PROFILE — Describe the dataset: shape, types, missing, duplicates, stats
      │
      ▼
[5] DVC VERSIONING      — Content-hash the profile JSON → datasets/profiled/
      │
      ▼
[6] REPAIR PIPELINE     — 8-step data-driven cleaning (details below)
      │
      ▼
[7] QUALITY SCORING     — Weighted score before and after repair
      │
      ▼
[8] REPORT GENERATION   — PDF + JSON report, downloadable cleaned CSV
      │
      ▼
[9] DVC VERSIONING      — Content-hash the cleaned CSV → datasets/repaired/
      │
      ▼
[10] MLFLOW TRACKING    — Log all params, metrics, artifacts to an experiment run
      │
      ▼
[11] MODEL REGISTRY     — Register fitted KNNImputer & IsolationForest; land in Staging
      │
      ▼
[12] MONITORING         — All events (upload, repair, failure) written to monitoring.db
      │
      ▼
[13] AI TRAINER         — (Optional) LLM analyzes dataset → trains & evaluates ML models
```

---

## Step-by-Step: What Is Used, How It's Implemented, How It Works

---

### Step 1 — File Upload & Validation

**Route:** `POST /upload`
**File:** `routes/upload.py` → `services/validation.py`

**What it does:**
Accepts a CSV file from the React frontend, saves it to `backend/uploads/`, and runs
three layers of validation before anything else happens.

**Validation layers:**
| Check | Tool | Detail |
|---|---|---|
| File extension | Python `str.endswith` | Rejects anything that isn't `.csv` |
| File size | `os.path.getsize` | Rejects files over 50 MB |
| Readability | `open()` + `read(1)` | Confirms the file can actually be opened |
| Minimum shape | pandas `read_csv` | Requires at least 10 rows and 2 columns |
| Column names | pandas | Flags duplicate or blank column names |
| Schema types | **Pandera** | Auto-infers a schema from the DataFrame; checks each column has a consistent, non-empty dtype |

**Models/Libraries used:** `Pandera`, `pandas`, Python stdlib `os`

**How it works:**
`validate_file()` checks disk properties. `validate_dataset_structure()` loads the CSV
into pandas and checks shape and column names. `validate_schema()` uses Pandera's
`DataFrameSchema` — generated dynamically from the actual DataFrame, so it works on
any CSV without hardcoded rules — to verify type consistency.

---

### Step 2 — Drift Detection

**Route:** Runs automatically inside `POST /upload`
**File:** `services/drift_detection.py`

**What it does:**
On every upload, checks whether `datasets/raw/<filename>` already exists (previous
version). If so, compares the new upload against the old one across three statistical
checks. The previous file is read *before* DVC overwrites it.

**Three drift checks:**

| Check | Method | Threshold | What it catches |
|---|---|---|---|
| Feature distribution | **Kolmogorov-Smirnov (KS) test** — `scipy.stats.ks_2samp` | p-value < 0.05 | The distribution of a numeric column has significantly shifted |
| Missing value rate | Absolute delta in per-column `isnull().mean()` | > 10 percentage points | A column that was mostly complete is now mostly empty, or vice versa |
| Outlier rate | Fraction of values outside the reference IQR bounds | > 10 percentage points | The new data has far more (or fewer) extreme values than the old version |

**Models/Libraries used:** `scipy.stats.ks_2samp`, `pandas`, Python stdlib `json`

**How it works:**
For each numeric column present in both datasets, `ks_2samp` returns a statistic and
p-value. A p-value below 0.05 means the two samples are unlikely to come from the
same distribution — drift flagged. Missing and outlier rates are simple arithmetic
deltas against the *reference dataset's* IQR bounds (not the new dataset's), so the
comparison is always fair to the original data shape.

Results are written to `datasets/drift/<base>_drift.json` and an event is logged to
`monitoring.db`.

---

### Step 2b — Auto-Retraining (triggered by drift)

**File:** `services/auto_retrain.py`

**What it does:**
When drift is detected, the platform automatically re-runs the full repair pipeline on
the new data to produce freshly fitted models, scores the output, registers the new
model versions, and promotes them to Production if the quality score is ≥ 75.

**How it works:**
1. Calls `preprocess_dataset()` with `outlier_strategy="flag"` (keeps all rows, still
   fits IsolationForest — good for retraining without data loss)
2. Scores quality before and after with `score_dataset()`
3. Calls `track_repair_run()` to log everything to MLflow and register models
4. Calls `promote_model()` for each registered model if score ≥ 75

**Models/Libraries used:** Full preprocessing pipeline (KNNImputer, IsolationForest),
MLflow, scikit-learn

---

### Step 3 — DVC Versioning (Raw Stage)

**File:** `services/dvc_tracker.py`

**What it does:**
Copies the uploaded file to `datasets/raw/` and runs `dvc add` on it, producing a
`.dvc` pointer file that content-hashes the CSV. Every re-upload of the same filename
produces a new hash → a new tracked version.

**Models/Libraries used:** **DVC** (`dvc add` via `subprocess`), Python `shutil`

**How it works:**
`track_raw()` copies the file then calls `subprocess.run(["python", "-m", "dvc", "add",
<relative_path>])` from the repo root. DVC writes a `<file>.dvc` sidecar file
containing the MD5 hash and size. A subsequent `git commit` snapshots the pointer; the
actual data lives in `dvc-storage/` (the local remote). DVC failures are caught and
returned as a warning — they never break the API response.

---

### Step 4 — Statistical Profiling

**Route:** `GET /profile/{filename}`
**File:** `services/profiling.py`

**What it does:**
Produces a complete statistical portrait of the dataset. No models — purely
descriptive analytics.

**Five report sections:**

| Section | What's computed |
|---|---|
| Basic info | Row/column count, memory usage, dtype map, lists of numerical vs categorical columns |
| Missing values | Total missing cells, % missing overall, per-column missing count + % |
| Duplicates | Duplicate row count and % of total rows |
| Numerical stats | Mean, median, std, min, max, Q1, Q2, Q3 — per numeric column |
| Categorical stats | Unique value count, most frequent value + count + %, top-10 value counts |
| Correlation matrix | Pearson correlation between every pair of numeric columns |

**Models/Libraries used:** `pandas`, `numpy`

**How it works:**
All stats are computed with native pandas aggregations (`.describe()`, `.corr()`,
`.value_counts()`, `.isnull().sum()`, etc.). A `safe()` helper scrubs `NaN` and `Inf`
before serialisation so the JSON response is always valid.

Profile JSON is also written to `datasets/profiled/` and DVC-tracked.

---

### Step 5 — Repair Pipeline (8 Steps)

**Route:** `POST /repair/{filename}`
**File:** `services/preprocessing.py`

This is the core engine. Each step is data-driven — no hardcoded column names or
domain-specific rules. Works on any CSV.

---

#### 5.1 — Structural Fixes

**What:** Strip whitespace from column names and string values. Drop fully empty
columns. Drop fully empty rows.

**Model/Library:** `pandas`

**How it works:**
`df.columns.str.strip()`, `df.dropna(how="all")`, column-wise `str.strip()` on all
object columns. An audit log records every renamed column and every dropped row/column.

---

#### 5.2 — Type Inference & Casting

**What:** Detect columns that should be numeric but are stored as strings. Detect
boolean columns (yes/no, true/false, 0/1). Downcast integers and floats to the
smallest type that fits (saves memory).

**Model/Library:** `pandas.to_numeric`, `pandas.api.types`

**How it works:**
For each object column, `pd.to_numeric(..., errors='coerce')` is attempted. If ≥ 80%
of values convert successfully, the column is cast to numeric. Boolean columns are
detected by checking whether all unique non-null values are a subset of
`{true, false, yes, no, 0, 1}`. Integers and floats are downcasted with
`pd.to_numeric(..., downcast=...)`. All type changes are recorded.

---

#### 5.3 — Duplicate Row Removal

**What:** Remove exact duplicate rows.

**Model/Library:** `pandas.DataFrame.drop_duplicates`

**How it works:** `df.drop_duplicates()` — straightforward. Before/after row counts
are logged.

---

#### 5.4 — Missing Value Imputation

**What:** Fill in missing values without discarding rows.

**Model/Library:**
- **KNNImputer** (scikit-learn) — for numerical columns
- **SimpleImputer(strategy="most_frequent")** (scikit-learn) — for categorical columns
- Columns with > 60% missing are **dropped** first — too sparse to impute reliably

**How it works:**
KNN imputation works by finding the k nearest neighbours (k = min(5, n_rows − 1)) in
feature space and averaging their values for the missing cell. This captures
relationships between features rather than blindly inserting the mean. The fitted
`KNNImputer` object is kept in memory and later saved to the Model Registry (so the
same imputation logic can be applied at inference time). Categorical columns get
their most common value inserted.

---

#### 5.5 — Outlier Handling

**What:** Detect and handle extreme values. Three selectable strategies:

| Strategy | Method | Effect |
|---|---|---|
| `clip` *(default)* | IQR — clip to `[Q1 − 3×IQR, Q3 + 3×IQR]` | Preserves row count; extreme values pulled to boundary |
| `remove` | **IsolationForest** (scikit-learn) — `contamination=0.05` | Removes rows flagged as anomalous; reduces dataset size |
| `flag` | **IsolationForest** — adds `is_outlier` column | Keeps all rows; marks outliers for inspection |

**Models/Libraries used:** `sklearn.ensemble.IsolationForest`, `pandas` quantiles

**How it works (IsolationForest):**
An Isolation Forest isolates anomalies by randomly partitioning the feature space.
Points that require fewer splits to isolate are anomalies. With `contamination=0.05`
it flags the 5% most isolated points. Binary columns (0/1 flags and labels) are
excluded from outlier detection. The fitted `IsolationForest` is kept and registered
in the Model Registry alongside the KNNImputer.

---

#### 5.6 — Low-Variance Column Removal

**What:** Drop columns that carry no information.

**Model/Library:** `pandas.Series.nunique`, `value_counts`

**How it works:**
- **Constant columns** — `nunique() ≤ 1` → dropped
- **Near-constant columns** — top value accounts for ≥ 98% of all values → dropped

---

#### 5.7 — Duplicate Column Removal

**What:** Drop columns whose entire value sequence is identical to another column.

**Model/Library:** `pandas`

**How it works:**
Each column's values (after NaN → sentinel string conversion) are hashed as a tuple
and stored in a dictionary. A second column with the same hash is a duplicate and gets
dropped. The log records which column duplicated which.

---

#### 5.8 — Label Error Detection

**What:** Find rows where the ground-truth label is likely wrong.

**Model/Library:**
- **CleanLab** (`cleanlab.classification.CleanLearning`)
- **LogisticRegression** (scikit-learn) — used as the base classifier inside CleanLab
- **LabelEncoder** (scikit-learn) — encodes categorical features before CleanLab runs

**How it works:**
CleanLab uses a technique called *confident learning*. It trains a classifier
(LogisticRegression here) with cross-validation to get out-of-sample predicted
probabilities for every row, then compares those probabilities against the given labels
to find rows that look mislabelled (the model is confident it should be class A, but
the label says class B). Detected rows get a `label_issue = 1` flag — they are *not*
automatically removed (the user decides). CleanLab only runs when a binary target
column is auto-detected (exactly 2 unique values from {0, 1}).

---

### Step 6 — Quality Scoring

**Route:** Called inside `POST /repair` and `GET /quality`
**File:** `services/quality.py`

**What it does:**
Assigns a weighted 0–100 score and a letter grade (Excellent / Good / Fair / Poor)
based on four dimensions, measured before and after repair.

| Dimension | Weight | How it's measured |
|---|---|---|
| Completeness | 30% | `(total cells − missing cells) / total cells × 100` |
| Uniqueness | 25% | `(total rows − duplicate rows) / total rows × 100` |
| Validity | 25% | Fraction of rows with no column values outside `[Q1 − 3×IQR, Q99 + 3×IQR]` bounds |
| Consistency | 20% | Fraction of columns with no mixed types (object columns checked for type uniformity) |

**Models/Libraries used:** `pandas`, `numpy`

**How it works:**
All four sub-scores are pure pandas computations. The overall score is a weighted sum.
`grade()` maps the overall score to a label. The before/after comparison is always
against the original raw file vs the cleaned file — so the improvement delta is always
meaningful.

---

### Step 7 — Report Generation

**Route:** `GET /report/{filename}` / `GET /quality/{filename}/download`
**File:** `services/report_generator.py`

**What it does:**
Produces three downloadable artifacts:
1. **PDF report** — human-readable, formatted with tables and section headings
2. **JSON summary** — machine-readable version of the same data
3. **Cleaned CSV** — the repaired dataset itself

**Models/Libraries used:** **ReportLab** (PDF layout engine), `pandas`, `datetime`

**How it works:**
`build_pdf()` uses ReportLab's `SimpleDocTemplate` + `Platypus` flowables (Paragraph,
Table, Spacer, HRFlowable). Tables are styled with alternating row backgrounds and a
dark header. Five sections are always present: Dataset Summary, Issues Found, Issues
Fixed (repair log), Quality Score (before/after), and Recommendations. Recommendations
are generated programmatically from the profile and quality delta — no hardcoded text.

---

### Step 8 — DVC Versioning (Repaired Stage)

**File:** `services/dvc_tracker.py` → `track_repaired()`

Same mechanism as Step 3. The cleaned CSV is copied to `datasets/repaired/` and
`dvc add`-ed. The profile JSON is written to `datasets/profiled/` and tracked too.
All three stages (raw, profiled, repaired) form a versioned lineage for every dataset.

---

### Step 9 — MLflow Experiment Tracking

**File:** `services/mlflow_tracker.py`

**What it does:**
Logs every repair run as a named MLflow experiment run inside the
`Dataset-Repair-Pipeline` experiment, stored in `backend/mlflow.db` (SQLite).

**What is logged:**

| Category | Examples |
|---|---|
| Parameters | Dataset name, imputation methods, outlier strategy |
| Metrics (repair) | Missing numerical imputed, duplicates removed, outliers detected, redundant columns removed, label errors found |
| Metrics (quality before) | Completeness, uniqueness, validity, consistency, overall score |
| Metrics (quality after) | Same four dimensions + overall score |
| Derived metric | `quality_improvement` (after − before) |
| Metric | `execution_time_seconds` |
| Artifacts | Cleaned CSV, PDF report |

**Models/Libraries used:** **MLflow** (`mlflow.start_run`, `mlflow.log_param`,
`mlflow.log_metric`, `mlflow.log_artifact`)

**How it works:**
All logging happens inside a `with mlflow.start_run(...) as run:` context. The run ID
is returned to the route handler and included in the API response. The MLflow UI
(`mlflow ui --backend-store-uri sqlite:///mlflow.db`) can browse all experiments,
compare runs, and view artifacts.

---

### Step 10 — Model Registry

**File:** `services/model_registry.py`

**What it does:**
Versions the two ML models fitted during repair (KNNImputer and IsolationForest) in
the MLflow Model Registry, and saves a local `.joblib` copy under `models/`.

**Registered models:**
| Internal key | Registry name |
|---|---|
| `knn_imputer` | `knn-missing-value-imputer` |
| `isolation_forest` | `isolation-forest-outlier-detector` |

**Stage lifecycle:** `Staging` → `Production` (auto-promoted by auto_retrain if quality ≥ 75) → `Archived`

**Models/Libraries used:** **MLflow** (`mlflow.sklearn.log_model`,
`mlflow.register_model`, `MlflowClient`), **joblib**

**How it works:**
`mlflow.sklearn.log_model()` serialises the scikit-learn object and attaches it to the
active run. `mlflow.register_model()` creates a new version in the registry.
`client.transition_model_version_stage()` sets the stage. A local `.joblib` copy is
also written so the model can be loaded offline without an MLflow server.

---

### Step 11 — Platform Monitoring

**File:** `services/monitoring.py`

**What it does:**
Maintains an independent event log in `backend/monitoring.db` (SQLite). Independent of
MLflow — so events that never reach MLflow (bad uploads, mid-pipeline failures) are
still counted.

**Events tracked:** `upload`, `profile`, `repair`, `drift_check`, `drift_alert`

**Metrics surfaced:**
- Total uploads (success)
- Total failures (any event type)
- Average quality score after repair
- Average repair time (seconds)
- Average processing time across all events
- Recent activity feed (last 20 events)

**Models/Libraries used:** Python `sqlite3`, `time`

**How it works:**
A `timed_event(event_type, filename)` context manager wraps every route handler. On
normal exit it inserts a `success` row; on exception it inserts a `failed` row with
the error message (truncated to 500 chars) and re-raises. The monitoring dashboard
polls `GET /monitoring/stats` which runs aggregate SQL queries against the `events`
table.

---

### Step 12 — AI Trainer (Optional)

**Route:** `POST /ai/analyze` → `POST /ai/train`
**Files:** `services/gemini_analyzer.py`, `services/model_trainer.py`

**What it does:**
The developer describes what they want to predict in plain English. The LLM analyses
the dataset and returns a complete training configuration. The trainer then runs the
configured models, evaluates them, picks the best, and saves a `.pkl` bundle.

#### Sub-step 12a — LLM Analysis (`gemini_analyzer.py`)

**Model used:** **Llama 3.3 70B Versatile** via **Groq API**

**What it returns:**
| Field | Purpose |
|---|---|
| `suitable` | Whether the dataset matches the developer's request |
| `suitability_summary` | One-sentence verdict |
| `problem_type` | `binary_classification / multiclass_classification / regression / clustering` |
| `target_column` | Exact column name to predict |
| `feature_columns` | Columns to use as input features |
| `models_to_train` | 2–3 model class names recommended for the problem |
| `handle_imbalance` | Whether to apply SMOTE |
| `evaluation_metric` | Primary metric to rank models |
| `reasoning` | 3–5 sentence explanation of the config |

**How it works:**
The route profiles the uploaded CSV (column names, dtypes, 5 sample rows) and sends
everything to the Groq API in a structured prompt. The system prompt instructs the LLM
to return *only* raw JSON — no markdown. The response is parsed, validated (target
column existence is checked against the actual columns, with case-insensitive
fallback), and returned to the frontend for user review before training begins.

---

#### Sub-step 12b — Model Training (`model_trainer.py`)

**Models available:**

| Problem type | Available models |
|---|---|
| Binary / Multiclass Classification | RandomForestClassifier, LogisticRegression, SVC, XGBClassifier |
| Regression | RandomForestRegressor, LinearRegression, Ridge, XGBRegressor |
| Clustering | KMeans, DBSCAN |

**Libraries used:** `scikit-learn`, `xgboost` (optional), `imbalanced-learn / SMOTE` (optional)

**Pipeline per model:**
1. Encode categorical features with `LabelEncoder`
2. Fill remaining NaN with column median
3. Scale all features with `StandardScaler`
4. Apply SMOTE if `handle_imbalance=true` and problem is classification
5. 80/20 train/test split (stratified for classification)
6. Fit model, predict on test set
7. Compute metrics: Accuracy, F1, Precision, Recall (classification) or RMSE, R² (regression) or Silhouette Score (clustering)

**Best model selection:** Ranked by F1 (classification), R² (regression), or Silhouette
Score (clustering). The winning model is saved as a `.pkl` bundle containing the
model, scaler, encoders, and feature/target column names. Feature importance (from
`feature_importances_` or `coef_`) is extracted and returned. Inference code is
auto-generated and returned to the user.

---

## Technology Stack Summary

| Layer | Technology | Version |
|---|---|---|
| Backend API | FastAPI + Uvicorn | 0.139 / 0.51 |
| Data processing | pandas, NumPy | 2.3 / 2.5 |
| ML — imputation | scikit-learn KNNImputer | 1.9 |
| ML — outliers | scikit-learn IsolationForest | 1.9 |
| ML — label errors | CleanLab + LogisticRegression | 2.9 |
| ML — training | scikit-learn, XGBoost | 1.9 / latest |
| Schema validation | Pandera | 0.32 |
| Experiment tracking | MLflow | 3.14 |
| Data versioning | DVC | 3.67 |
| Model registry | MLflow Model Registry | 3.14 |
| Drift detection | SciPy (KS test) | 1.18 |
| Report generation | ReportLab | 5.0 |
| LLM | Llama 3.3 70B via Groq API | — |
| Monitoring store | SQLite (independent) | stdlib |
| Frontend | React 19 + Vite 8 | — |
| Frontend HTTP | Axios | 1.18 |
| Frontend animation | Framer Motion | 12 |
| CI | GitHub Actions | — |

---

## Data Flow Diagram

```
CSV Upload (browser)
        │
        │  multipart/form-data
        ▼
POST /upload  ──► validate (Pandera + pandas)
        │
        ├──► drift check (SciPy KS test) ──► auto_retrain (if drift)
        │                                         └──► MLflow + Model Registry
        │
        ├──► DVC track raw  (dvc add → datasets/raw/)
        │
        ▼
POST /profile ──► profiling.py (pandas stats)
        │
        ├──► DVC track profiled (dvc add → datasets/profiled/)
        │
        ▼
POST /repair
        │
        ├── [1] Structural fixes (pandas)
        ├── [2] Type inference (pandas.to_numeric)
        ├── [3] Duplicate removal (drop_duplicates)
        ├── [4] Missing imputation (KNNImputer + SimpleImputer)
        ├── [5] Outlier handling (IQR clip OR IsolationForest)
        ├── [6] Low-variance removal (nunique / value_counts)
        ├── [7] Duplicate column removal (hash comparison)
        └── [8] Label error detection (CleanLab + LogisticRegression)
                │
                ▼
         quality score (before vs after)
                │
                ▼
         generate PDF + JSON report (ReportLab)
                │
                ▼
         DVC track repaired (dvc add → datasets/repaired/)
                │
                ▼
         MLflow log run (params + metrics + artifacts)
                │
                ▼
         Model Registry (KNNImputer + IsolationForest → Staging)

(Optional)
POST /ai/analyze ──► Groq LLM (Llama 3.3 70B) ──► training config
POST /ai/train   ──► train/evaluate multiple models ──► save best .pkl
```

---

*Generated from source — `backend/app/services/` and `backend/app/routes/`*
