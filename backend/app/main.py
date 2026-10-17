from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import upload, profile, repair, report, registry, monitoring, drift, ai_trainer

app = FastAPI(title="Dataset Repair Platform", version="1.0.0")

# Allow React frontend to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(upload.router)
app.include_router(profile.router)
app.include_router(repair.router)
app.include_router(report.router)
app.include_router(registry.router)
app.include_router(monitoring.router)
app.include_router(drift.router)
app.include_router(ai_trainer.router)


@app.get("/")
def read_root():
    return {"message": "Dataset Repair Platform API Running"}
