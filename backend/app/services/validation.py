import os
import pandas as pd
import pandera.pandas as pa
from pandera.pandas import Column, DataFrameSchema, Check
from fastapi import HTTPException
from app.config import MIN_ROWS, MIN_COLUMNS, MAX_FILE_SIZE_MB


# ─── Generic Schema (auto-inferred per upload) ────────────────────────────────
def infer_schema(df: pd.DataFrame) -> DataFrameSchema:
    """Build a pandera schema dynamically from the actual dataframe."""
    columns = {}
    for col in df.columns:
        dtype = str(df[col].dtype)
        if "int" in dtype or "float" in dtype:
            columns[col] = Column(float, nullable=True)
        else:
            columns[col] = Column(str, nullable=True)
    return DataFrameSchema(columns=columns, strict=False)


# ─── File Validation ──────────────────────────────────────────────────────────
def validate_file(filepath: str) -> list:
    errors = []
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found.")
    if not filepath.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Invalid file. Please upload a CSV.")
    size_mb = os.path.getsize(filepath) / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        errors.append(f"File size {size_mb:.2f}MB exceeds limit of {MAX_FILE_SIZE_MB}MB.")
    try:
        with open(filepath, "r") as f:
            f.read(1)
    except Exception:
        errors.append("File is not readable.")
    return errors


# ─── Dataset Structure Validation ────────────────────────────────────────────
def validate_dataset_structure(df: pd.DataFrame) -> list:
    errors = []
    if df.empty:
        errors.append("Dataset is empty.")
        return errors
    if len(df) < MIN_ROWS:
        errors.append(f"Dataset has {len(df)} rows. Minimum required is {MIN_ROWS}.")
    if len(df.columns) < MIN_COLUMNS:
        errors.append(f"Dataset has {len(df.columns)} columns. Minimum required is {MIN_COLUMNS}.")
    dupes = [col for col in df.columns if list(df.columns).count(col) > 1]
    if dupes:
        errors.append(f"Duplicate column names: {list(set(dupes))}")
    empty_names = [col for col in df.columns if str(col).strip() == ""]
    if empty_names:
        errors.append(f"Empty column names found.")
    return errors


# ─── Schema Validation (structural only — no value-level checks) ─────────────
def validate_schema(df: pd.DataFrame) -> list:
    """
    Only checks that each column has a consistent, non-empty dtype.
    No value-level rules — works with any CSV.
    """
    errors = []
    for col in df.columns:
        if df[col].dtype == object:
            non_null = df[col].dropna()
            if len(non_null) == 0:
                errors.append(f"Column '{col}' is entirely empty.")
    return errors


# ─── Master Validation ────────────────────────────────────────────────────────
def validate_dataset(filepath: str) -> dict:
    all_errors = []

    file_errors = validate_file(filepath)
    all_errors.extend(file_errors)

    try:
        df = pd.read_csv(filepath)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Cannot read file: {str(e)}")

    structure_errors = validate_dataset_structure(df)
    all_errors.extend(structure_errors)

    if not structure_errors:
        schema_errors = validate_schema(df)
        all_errors.extend(schema_errors)

    return {
        "status":  "Valid" if not all_errors else "Invalid",
        "rows":    len(df),
        "columns": len(df.columns),
        "column_names": list(df.columns),
        "errors":  all_errors
    }
