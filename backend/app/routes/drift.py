from fastapi import APIRouter, HTTPException

from app.services.drift_detection import get_last_drift_report

router = APIRouter()


@router.get("/drift/{filename}")
def drift_report(filename: str):
    report = get_last_drift_report(filename)
    if report is None:
        raise HTTPException(
            status_code=404,
            detail=f"No drift report for '{filename}' yet. Drift is checked on the second+ upload of the same filename.",
        )
    return report
