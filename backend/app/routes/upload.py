import os
import shutil
from fastapi import APIRouter, UploadFile, File, HTTPException
from app.config import UPLOAD_DIR
from app.services.validation import validate_dataset
from app.services.dvc_tracker import track_raw, RAW_DIR
from app.services.monitoring import timed_event
from app.services.drift_detection import check_drift
from app.services.auto_retrain import trigger_retraining

router = APIRouter()
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    with timed_event("upload", file.filename):
        if not file.filename.endswith(".csv"):
            raise HTTPException(status_code=400, detail="Invalid file. Please upload a CSV.")

        save_path = os.path.join(UPLOAD_DIR, file.filename)

        with open(save_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        validation_result = validate_dataset(save_path)

        # Drift check — compare against the previous version of this filename
        # BEFORE dvc tracking overwrites it with the new upload.
        previous_raw_path = os.path.join(RAW_DIR, file.filename)
        drift_result = None
        if os.path.exists(previous_raw_path):
            try:
                drift_result = check_drift(file.filename, previous_raw_path, save_path)
            except Exception as e:
                drift_result = {"error": str(e)[:300]}

        dvc_result = track_raw(save_path)

        # Auto retraining — only kicks in when drift was actually detected
        auto_retrain_result = None
        if drift_result and not drift_result.get("error") and drift_result.get("drift_detected"):
            try:
                auto_retrain_result = trigger_retraining(file.filename, save_path)
            except Exception as e:
                auto_retrain_result = {"error": str(e)[:300]}

        return {
            "message":      "File uploaded successfully",
            "filename":     file.filename,
            "saved_at":     save_path,
            "validation":   validation_result,
            "dvc":          dvc_result,
            "drift":        drift_result,
            "auto_retrain": auto_retrain_result,
        }
