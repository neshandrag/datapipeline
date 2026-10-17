import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from app.config import UPLOAD_DIR
from app.services.gemini_analyzer import analyze_project
from app.services.model_trainer import train_and_evaluate
from app.services.profiling import profile_dataset

router = APIRouter()
MODELS_DIR = os.path.join(os.path.dirname(UPLOAD_DIR), "models")


class AnalyzeRequest(BaseModel):
    prompt:   str
    filename: str


class TrainRequest(BaseModel):
    filename: str
    config:   dict


@router.post("/ai/analyze")
def analyze(req: AnalyzeRequest):
    filepath = os.path.join(UPLOAD_DIR, req.filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail=f"File '{req.filename}' not found. Upload it first.")

    # Get dataset info to send to Gemini
    profile   = profile_dataset(filepath)
    columns   = list(profile["basic_info"]["dtypes"].keys())
    dtypes    = profile["basic_info"]["dtypes"]

    # Get sample rows
    import pandas as pd
    df          = pd.read_csv(filepath)
    sample_rows = df.head(5).to_dict(orient="records")

    result = analyze_project(req.prompt, columns, sample_rows, dtypes)

    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["error"])

    return {
        "message": "Analysis complete",
        "filename": req.filename,
        "analysis": result["config"],
    }


@router.post("/ai/train")
def train(req: TrainRequest):
    filepath = os.path.join(UPLOAD_DIR, req.filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail=f"File '{req.filename}' not found.")

    result = train_and_evaluate(filepath, req.config)

    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    return {
        "message": "Model training complete",
        "filename": req.filename,
        "result":  result,
    }


@router.get("/ai/download/model/{filename}")
def download_model(filename: str):
    path = os.path.join(MODELS_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Model file not found.")
    return FileResponse(path, media_type="application/octet-stream", filename=filename)
