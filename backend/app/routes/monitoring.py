from fastapi import APIRouter

from app.services.monitoring import get_stats

router = APIRouter()


@router.get("/monitoring/stats")
def monitoring_stats():
    return get_stats()
