from fastapi import FastAPI

app = FastAPI(title="Serbatic Security Inspector API")


@app.get("/api/health")
def health():
    return {"status": "ok"}
