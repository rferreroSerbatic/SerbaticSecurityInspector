from fastapi import FastAPI

from app.config import load_settings
from app.projects import list_projects

app = FastAPI(title="Serbatic Security Inspector API")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/projects")
def get_projects():
    return list_projects(load_settings().samples_dir)
