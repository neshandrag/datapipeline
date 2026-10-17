import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from app.config import UPLOAD_DIR, REPORTS_DIR
from app.services.quality import score_dataset
from app.services.report_generator import generate_report

router = APIRouter()


@router.get("/quality/{filename}")
def quality_score(filename: str):
    filepath = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail=f"File '{filename}' not found.")

    result   = score_dataset(filepath)
    base     = os.path.splitext(filename)[0]
    cleaned  = os.path.join(UPLOAD_DIR, f"{base}_cleaned.csv")
    response = {"message": "Quality score calculated", "filename": filename, "before": result}

    if os.path.exists(cleaned):
        after                  = score_dataset(cleaned)
        response["after"]      = after
        response["improvement"] = round(after["overall_score"] - result["overall_score"], 2)

    return response


@router.post("/report/{filename}")
def create_report(filename: str):
    filepath = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail=f"File '{filename}' not found.")
    return generate_report(filename)


@router.get("/report/download/pdf/{filename}")
def download_pdf(filename: str):
    base = os.path.splitext(filename)[0]
    path = os.path.join(REPORTS_DIR, f"{base}_report.pdf")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="PDF not found. Run POST /report/{filename} first.")
    return FileResponse(path, media_type="application/pdf", filename=f"{base}_report.pdf")


@router.get("/report/download/json/{filename}")
def download_json(filename: str):
    base = os.path.splitext(filename)[0]
    path = os.path.join(REPORTS_DIR, f"{base}_summary.json")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="JSON not found. Run POST /report/{filename} first.")
    return FileResponse(path, media_type="application/json", filename=f"{base}_summary.json")


@router.get("/report/download/csv/{filename}")
def download_cleaned_csv(filename: str):
    base = os.path.splitext(filename)[0]
    path = os.path.join(UPLOAD_DIR, f"{base}_cleaned.csv")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Cleaned CSV not found. Run POST /repair/{filename} first.")
    return FileResponse(path, media_type="text/csv", filename=f"{base}_cleaned.csv")
