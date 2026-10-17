"""
gemini_analyzer.py
Uses Groq to analyze the developer's project description and dataset
and return an ML training configuration.
"""

import json
import re
import os
from groq import Groq
from dotenv import load_dotenv

load_dotenv()
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
client = Groq(api_key=GROQ_API_KEY)
# llama-3.3-70b-versatile was removed from Groq on 2026-08-16.
MODEL  = "openai/gpt-oss-120b"


def analyze_project(prompt: str, columns: list, sample_rows: list, dtypes: dict) -> dict:
    """
    Send the developer's project description + actual dataset info to Groq LLM.
    Returns a structured config dict for ML model training.
    No hardcoded rules — fully LLM-driven decision making.
    """

    column_info = "\n".join([
        f"  - {col} | dtype: {dtypes.get(col, 'unknown')} | "
        f"sample values: {[str(r.get(col, '')) for r in sample_rows[:3]]}"
        for col in columns
    ])

    system_msg = """You are a senior ML engineer. You will receive:
1. A developer's project description (what they want to build / predict)
2. Dataset column names, data types, and sample values

First, judge whether this dataset can support the developer's request.
Then return a precise JSON configuration for training.
Return ONLY raw JSON — no markdown, no explanation, no code fences. Just the JSON object."""

    user_msg = f"""Developer's project description:
"{prompt}"

Dataset columns with dtypes and sample values:
{column_info}

Return a JSON object with exactly these fields:
{{
  "suitable": true or false,
  "suitability_summary": "1 short sentence: either confirm fit, or say clearly this dataset is not suitable for the request",
  "mismatch_reason": "if suitable=false, explain why in 1-2 sentences; otherwise empty string",
  "what_you_need": ["if suitable=false, list concrete fields/data the user needs e.g. 'glucose level', 'BMI', 'diabetes diagnosis label'; otherwise []"],
  "dataset_has": ["short labels for what this dataset actually contains, based on columns/samples"],
  "domain": "short domain label e.g. Healthcare / Fraud Detection / Real Estate / Employee Analytics",
  "problem_type": "one of: binary_classification | multiclass_classification | regression | clustering",
  "target_column": "exact column name to predict — must exactly match one column name above, or null for clustering",
  "drop_columns": ["list of column names that are IDs, primary keys, names, emails — useless for prediction"],
  "feature_columns": ["columns to use as input features — exclude target_column and drop_columns — must be from the list above"],
  "handle_imbalance": true or false,
  "evaluation_metric": "primary metric: f1_score | accuracy | rmse | r2 | silhouette",
  "models_to_train": ["2 to 3 model class names — choose from: RandomForestClassifier, XGBClassifier, LogisticRegression, SVC, RandomForestRegressor, XGBRegressor, LinearRegression, Ridge, KMeans, DBSCAN"],
  "reasoning": ["3 to 5 short sentences explaining the configuration based on the actual data"],
  "preprocessing_notes": "any domain-specific preprocessing advice based on the actual column values"
}}

Critical suitability rules:
- Set suitable=false when the dataset topic/columns clearly do NOT match the developer's request (e.g. employee HR data for diabetes prediction, housing prices for churn prediction)
- When suitable=false, still fill domain/problem_type/columns as best-effort for this dataset, but make suitability_summary and what_you_need very clear
- what_you_need must list the kinds of columns/labels the user should upload instead
- dataset_has must describe what is actually in THIS file

Critical training rules:
- target_column MUST exactly match one column name from the list provided, or null
- feature_columns MUST only contain column names from the list, excluding target and drop columns
- Look at the actual sample values to infer what each column contains
- For medical, fraud, or churn tasks, check if target is imbalanced (set handle_imbalance accordingly)
- Choose models appropriate for the problem type — do not mix classifier with regressor models"""

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user",   "content": user_msg},
            ],
            max_tokens=1400,
            temperature=0.1,
        )

        raw = response.choices[0].message.content.strip()

        # Strip markdown code fences if LLM added them
        raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
        raw = re.sub(r"\s*```\s*$",       "", raw, flags=re.MULTILINE)
        raw = raw.strip()

        config = json.loads(raw)

        # Validate target column exists in dataset (case-insensitive fallback)
        if config.get("target_column") and config["target_column"] not in columns:
            match = next(
                (c for c in columns if c.lower() == config["target_column"].lower()), None
            )
            config["target_column"] = match if match else columns[-1]

        # Validate feature columns — only keep ones that actually exist
        valid_features = [c for c in config.get("feature_columns", []) if c in columns]
        if not valid_features:
            target = config.get("target_column")
            valid_features = [c for c in columns if c != target]
        config["feature_columns"] = valid_features

        # Validate drop columns
        config["drop_columns"] = [c for c in config.get("drop_columns", []) if c in columns]

        # Normalize suitability fields
        config["suitable"] = bool(config.get("suitable", True))
        config["suitability_summary"] = config.get("suitability_summary") or (
            "This dataset appears suitable for your request."
            if config["suitable"]
            else "This dataset is not suitable for your request."
        )
        config["mismatch_reason"] = config.get("mismatch_reason") or ""
        config["what_you_need"] = config.get("what_you_need") or []
        config["dataset_has"] = config.get("dataset_has") or list(columns)[:12]

        return {"success": True, "config": config}

    except json.JSONDecodeError as e:
        return {
            "success": False,
            "error":   f"LLM returned invalid JSON: {str(e)}",
            "raw":     raw if "raw" in dir() else ""
        }
    except Exception as e:
        return {"success": False, "error": f"AI analysis error: {str(e)}"}
