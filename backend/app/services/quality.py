import math
import numpy as np
import pandas as pd

WEIGHTS = {
    "completeness": 0.30,
    "uniqueness":   0.25,
    "validity":     0.25,
    "consistency":  0.20,
}


def _safe_round(val, n=2):
    try:
        v = float(val)
        if math.isnan(v) or math.isinf(v):
            return 0.0
        return round(v, n)
    except Exception:
        return 0.0


def completeness_score(df: pd.DataFrame) -> dict:
    total   = df.shape[0] * df.shape[1]
    missing = int(df.isnull().sum().sum())
    score   = _safe_round((total - missing) / total * 100) if total else 100.0
    return {"score": score, "total_cells": total, "missing_cells": missing}


def uniqueness_score(df: pd.DataFrame) -> dict:
    total  = len(df)
    dupes  = int(df.duplicated().sum())
    score  = _safe_round((total - dupes) / total * 100) if total else 100.0
    return {"score": score, "total_rows": total, "duplicate_rows": dupes}


def validity_score(df: pd.DataFrame) -> dict:
    """
    Dynamically compute validity: checks numerical columns for
    reasonable ranges (no negatives where unexpected, no extreme outliers)
    using IQR-based bounds rather than hardcoded rules.
    """
    total = len(df)
    invalid_detail = {}
    invalid_mask = pd.Series([False] * total, index=df.index)

    for col in df.select_dtypes(include=[np.number]).columns:
        series = df[col].dropna()
        if series.empty:
            continue
        q1  = series.quantile(0.01)
        q99 = series.quantile(0.99)
        iqr = q99 - q1
        lower = q1 - 3 * iqr
        upper = q99 + 3 * iqr
        col_mask = (df[col] < lower) | (df[col] > upper)
        count = int(col_mask.sum())
        if count > 0:
            invalid_detail[col] = count
            invalid_mask |= col_mask

    invalid_rows = int(invalid_mask.sum())
    score = _safe_round((total - invalid_rows) / total * 100) if total else 100.0
    return {
        "score":           score,
        "total_rows":      total,
        "invalid_entries": invalid_rows,
        "invalid_detail":  invalid_detail,
    }


def consistency_score(df: pd.DataFrame) -> dict:
    """
    Dynamically check type consistency: each column should have
    a consistent type with no mixed types.
    """
    total   = len(df.columns)
    passed  = 0
    issues  = {}

    for col in df.columns:
        dtype = str(df[col].dtype)
        # Check for mixed types in object columns
        if "object" in dtype or "str" in dtype:
            non_null = df[col].dropna()
            types = non_null.apply(type).nunique()
            if types <= 1:
                passed += 1
            else:
                issues[col] = f"Mixed types detected ({types} different types)"
        else:
            # Numeric / datetime columns — check for all-null
            if df[col].isnull().all():
                issues[col] = "Column is entirely null"
            else:
                passed += 1

    score = _safe_round(passed / total * 100) if total > 0 else 100.0
    return {
        "score":         score,
        "total_checks":  total,
        "passed_checks": passed,
        "failed_checks": total - passed,
        "type_issues":   issues,
    }


def grade(score: float) -> str:
    if score >= 90: return "Excellent"
    if score >= 75: return "Good"
    if score >= 60: return "Fair"
    return "Poor"


def score_dataset(filepath: str) -> dict:
    df = pd.read_csv(filepath)

    scores = {
        "completeness": completeness_score(df),
        "uniqueness":   uniqueness_score(df),
        "validity":     validity_score(df),
        "consistency":  consistency_score(df),
    }

    overall = round(
        scores["completeness"]["score"] * WEIGHTS["completeness"] +
        scores["uniqueness"]["score"]   * WEIGHTS["uniqueness"]   +
        scores["validity"]["score"]     * WEIGHTS["validity"]      +
        scores["consistency"]["score"]  * WEIGHTS["consistency"],
        2
    )

    return {
        "overall_score": overall,
        "grade":         grade(overall),
        "weights_used":  WEIGHTS,
        "individual_scores": {k: v["score"] for k, v in scores.items()},
        "details":       scores,
    }
