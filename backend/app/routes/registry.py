from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.model_registry import list_registered_models, promote_model, VALID_STAGES

router = APIRouter()


class PromoteRequest(BaseModel):
    stage: str


@router.get("/registry/models")
def get_registered_models():
    return {"models": list_registered_models()}


@router.post("/registry/models/{name}/{version}/promote")
def promote_registered_model(name: str, version: int, body: PromoteRequest):
    if body.stage not in VALID_STAGES:
        raise HTTPException(status_code=400, detail=f"stage must be one of {sorted(VALID_STAGES)}")
    return promote_model(name, version, body.stage)
