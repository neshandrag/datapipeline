"""
Drift Detection — compares a newly uploaded dataset against the previous
version of the same filename (captured right before it gets overwritten in
datasets/raw/, see dvc_tracker.py) across three checks:
  1. Feature distribution  — two-sample Kolmogorov-Smirnov test per numeric column
  2. Missing values        — change in per-column missing rate
  3. Outlier distribution  — change in the rate of values outside the
                              reference dataset's IQR bounds

Any check tripping a threshold raises a drift alert, which is persisted to
datasets/drift/<file>_drift.json and logged to the monitoring event log.
"""
import json
import os

import pandas as pd
from scipy.stats import ks_2samp

from app.config import DATASETS_DIR
from app.services.monitoring import log_event

DRIFT_DIR = os.path.join(DATASETS_DIR, "drift")
os.makedirs(DRIFT_DIR, exist_ok=True)

KS_PVALUE_THRESHOLD     = 0.05  # below this — distribution likely shifted
MISSING_DELTA_THRESHOLD = 0.10  # 10 percentage points
OUTLIER_DELTA_THRESHOLD = 0.10  # 10 percentage points


def _missing_rate(df: pd.DataFrame, col: str) -> float:
    return float(df[col].isnull().mean())


def _iqr_bounds(series: pd.Series):
    q1, q3 = series.quantile(0.25), series.quantile(0.75)
    iqr = q3 - q1
    return q1 - 1.5 * iqr, q3 + 1.5 * iqr


def _outlier_rate(df: pd.DataFrame, col: str, lower: float, upper: float) -> float:
    s = df[col].dropna()
    if len(s) == 0:
        return 0.0
    return float(((s < lower) | (s > upper)).mean())


def compare_datasets(previous_path: str, current_path: str) -> dict:
    prev_df = pd.read_csv(previous_path)
    curr_df = pd.read_csv(current_path)

    common_cols  = [c for c in curr_df.columns if c in prev_df.columns]
    numeric_cols = [
        c for c in common_cols
        if pd.api.types.is_numeric_dtype(curr_df[c]) and pd.api.types.is_numeric_dtype(prev_df[c])
    ]

    feature_drift = []
    missing_drift = []
    outlier_drift = []

    for col in numeric_cols:
        prev_vals = prev_df[col].dropna()
        curr_vals = curr_df[col].dropna()
        if len(prev_vals) < 2 or len(curr_vals) < 2:
            continue

        stat, p_value = ks_2samp(prev_vals, curr_vals)
        if p_value < KS_PVALUE_THRESHOLD:
            feature_drift.append({
                "column":       col,
                "ks_statistic": round(float(stat), 4),
                "p_value":      round(float(p_value), 6),
            })

        prev_missing = _missing_rate(prev_df, col)
        curr_missing = _missing_rate(curr_df, col)
        m_delta = abs(curr_missing - prev_missing)
        if m_delta > MISSING_DELTA_THRESHOLD:
            missing_drift.append({
                "column":               col,
                "previous_missing_pct": round(prev_missing * 100, 2),
                "current_missing_pct":  round(curr_missing * 100, 2),
                "delta_pct":            round(m_delta * 100, 2),
            })

        lower, upper = _iqr_bounds(prev_vals)
        prev_outlier_rate = _outlier_rate(prev_df, col, lower, upper)
        curr_outlier_rate = _outlier_rate(curr_df, col, lower, upper)
        o_delta = abs(curr_outlier_rate - prev_outlier_rate)
        if o_delta > OUTLIER_DELTA_THRESHOLD:
            outlier_drift.append({
                "column":               col,
                "previous_outlier_pct": round(prev_outlier_rate * 100, 2),
                "current_outlier_pct":  round(curr_outlier_rate * 100, 2),
                "delta_pct":            round(o_delta * 100, 2),
            })

    drift_detected = bool(feature_drift or missing_drift or outlier_drift)

    return {
        "drift_detected":              drift_detected,
        "compared_columns":            numeric_cols,
        "feature_distribution_drift":  feature_drift,
        "missing_value_drift":         missing_drift,
        "outlier_distribution_drift":  outlier_drift,
        "thresholds": {
            "ks_p_value":    KS_PVALUE_THRESHOLD,
            "missing_delta": MISSING_DELTA_THRESHOLD,
            "outlier_delta": OUTLIER_DELTA_THRESHOLD,
        },
    }


def check_drift(filename: str, previous_path: str, current_path: str) -> dict:
    report = compare_datasets(previous_path, current_path)
    report["filename"] = filename

    base     = os.path.splitext(filename)[0]
    out_path = os.path.join(DRIFT_DIR, f"{base}_drift.json")
    with open(out_path, "w") as f:
        json.dump(report, f, indent=2)

    log_event(
        event_type="drift_alert" if report["drift_detected"] else "drift_check",
        filename=filename,
        status="success",
    )

    return report


def get_last_drift_report(filename: str):
    base = os.path.splitext(filename)[0]
    path = os.path.join(DRIFT_DIR, f"{base}_drift.json")
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)
