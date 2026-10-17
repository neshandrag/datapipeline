import math
import pandas as pd
import numpy as np
from fastapi import HTTPException


# ── Sanitize any float that JSON can't handle (NaN, Inf, -Inf) ───────────────
def safe(val):
    if isinstance(val, float):
        if math.isnan(val) or math.isinf(val):
            return None
    if isinstance(val, (np.floating, np.integer)):
        v = float(val)
        if math.isnan(v) or math.isinf(v):
            return None
        return v
    if isinstance(val, np.integer):
        return int(val)
    return val


def safe_dict(d: dict) -> dict:
    return {k: safe(v) for k, v in d.items()}


# ─── Basic Info ───────────────────────────────────────────────────────────────
def get_basic_info(df: pd.DataFrame) -> dict:
    return {
        "rows":            int(len(df)),
        "columns":         int(len(df.columns)),
        "memory_usage_kb": round(float(df.memory_usage(deep=True).sum()) / 1024, 2),
        "dtypes":          {col: str(dtype) for col, dtype in df.dtypes.items()},
        "numerical_columns":   list(df.select_dtypes(include=[np.number]).columns),
        "categorical_columns": list(df.select_dtypes(exclude=[np.number]).columns),
    }


# ─── Missing Values ───────────────────────────────────────────────────────────
def get_missing_values(df: pd.DataFrame) -> dict:
    missing = df.isnull().sum()
    total   = len(df) * len(df.columns)
    return {
        "total_missing":         int(missing.sum()),
        "total_missing_percent": round(float(missing.sum()) / total * 100, 2) if total else 0.0,
        "per_column": {
            col: {
                "missing_count":   int(missing[col]),
                "missing_percent": round(float(missing[col]) / len(df) * 100, 2) if len(df) else 0.0,
            }
            for col in df.columns
        },
    }


# ─── Duplicates ───────────────────────────────────────────────────────────────
def get_duplicate_info(df: pd.DataFrame) -> dict:
    dup = int(df.duplicated().sum())
    return {
        "duplicate_rows":    dup,
        "duplicate_percent": round(dup / len(df) * 100, 2) if len(df) else 0.0,
    }


# ─── Numerical Stats ──────────────────────────────────────────────────────────
def get_numerical_stats(df: pd.DataFrame) -> dict:
    num_df = df.select_dtypes(include=[np.number])
    if num_df.empty:
        return {}

    stats = {}
    for col in num_df.columns:
        s = num_df[col].dropna()
        if s.empty:
            stats[col] = {k: None for k in ["mean","median","std","min","max","q1","q2","q3"]}
            continue
        desc = s.describe()
        stats[col] = safe_dict({
            "mean":   round(float(s.mean()), 4),
            "median": round(float(s.median()), 4),
            "std":    round(float(s.std()), 4),
            "min":    round(float(s.min()), 4),
            "max":    round(float(s.max()), 4),
            "q1":     round(float(s.quantile(0.25)), 4),
            "q2":     round(float(s.quantile(0.50)), 4),
            "q3":     round(float(s.quantile(0.75)), 4),
        })
    return stats


# ─── Categorical Stats ────────────────────────────────────────────────────────
def get_categorical_stats(df: pd.DataFrame) -> dict:
    cat_df = df.select_dtypes(exclude=[np.number])
    if cat_df.empty:
        return {}

    stats = {}
    for col in cat_df.columns:
        vc = df[col].value_counts(dropna=True)
        if vc.empty:
            stats[col] = {
                "unique_values": 0,
                "most_frequent": None,
                "most_frequent_count": 0,
                "most_frequent_percent": 0.0,
                "value_counts": {},
            }
            continue
        stats[col] = {
            "unique_values":          int(df[col].nunique()),
            "most_frequent":          str(vc.idxmax()),
            "most_frequent_count":    int(vc.max()),
            "most_frequent_percent":  round(float(vc.max()) / len(df) * 100, 2),
            "value_counts":           {str(k): int(v) for k, v in vc.head(10).items()},
        }
    return stats


# ─── Correlation Matrix ───────────────────────────────────────────────────────
def get_correlation_matrix(df: pd.DataFrame) -> dict:
    num_df = df.select_dtypes(include=[np.number])
    if num_df.shape[1] < 2:
        return {}

    corr = num_df.corr()
    result = {}
    for col in corr.index:
        result[col] = {}
        for other in corr.columns:
            v = corr.loc[col, other]
            result[col][other] = None if (math.isnan(v) or math.isinf(v)) else round(float(v), 4)
    return result


# ─── Master Profile ───────────────────────────────────────────────────────────
def profile_dataset(filepath: str) -> dict:
    try:
        df = pd.read_csv(filepath)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Cannot read file: {str(e)}")

    if df.empty:
        raise HTTPException(status_code=400, detail="Dataset is empty.")

    return {
        "basic_info":         get_basic_info(df),
        "missing_values":     get_missing_values(df),
        "duplicates":         get_duplicate_info(df),
        "numerical_stats":    get_numerical_stats(df),
        "categorical_stats":  get_categorical_stats(df),
        "correlation_matrix": get_correlation_matrix(df),
    }
