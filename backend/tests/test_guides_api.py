"""API POST /api/guides: guía bajo demanda de un hallazgo (Fase 2d.1)."""

import pytest
from fastapi.testclient import TestClient

from app.llm import ChatResult, LLMError
from app.main import app

FINDING = {
    "id": "A03-1", "vulnId": "A03", "severity": "critical",
    "title": "SQL Injection en /api/users", "file": "app.js", "line": 14,
    "snippet": "var sql = 'SELECT * FROM users WHERE user = ' + req.query.user",
    "exploit": "e", "consequences": "c", "solution": "s",
}


class FakeGuideAPI:
    """Guía canned para los tests del endpoint (close async: la API lo llama en finally)."""

    def __init__(self, canned="## RESUMEN\nguía api", fail=False):
        self.canned = canned
        self.fail = fail
        self.calls = 0
        self.users = []

    async def chat(self, system, user, max_tokens=8000, on_progress=None):
        self.calls += 1
        self.users.append(user)
        if self.fail:
            raise LLMError("boom")
        return ChatResult(content=self.canned, prompt_tokens=10, completion_tokens=7,
                          elapsed_s=0.1)

    async def close(self):
        pass


@pytest.fixture
def samples_dir(tmp_path):
    """Proyecto de ejemplo con un solo archivo .js (mismo patrón que test_runs_api.py)."""
    demo = tmp_path / "miniapp"
    demo.mkdir()
    (demo / "app.js").write_text("var sql = 'x';\n", encoding="utf-8")
    return tmp_path


def test_guides_endpoint_devuelve_guia(monkeypatch, samples_dir):
    monkeypatch.setenv("SAMPLES_DIR", str(samples_dir))
    fake = FakeGuideAPI()
    monkeypatch.setattr("app.main.build_llm", lambda: fake)
    client = TestClient(app)
    r = client.post("/api/guides", json={"projectId": "miniapp", "finding": FINDING})
    assert r.status_code == 200
    assert r.json() == {"guide": "## RESUMEN\nguía api"}
    assert fake.calls == 1


def test_guides_endpoint_proyecto_inexistente_404(monkeypatch, samples_dir):
    monkeypatch.setenv("SAMPLES_DIR", str(samples_dir))
    monkeypatch.setattr("app.main.build_llm", lambda: FakeGuideAPI())
    client = TestClient(app)
    r = client.post("/api/guides", json={"projectId": "no-existe", "finding": FINDING})
    assert r.status_code == 404
    assert r.json()["detail"] == "Proyecto no encontrado"


def test_guides_endpoint_llm_falla_502(monkeypatch, samples_dir):
    monkeypatch.setenv("SAMPLES_DIR", str(samples_dir))
    monkeypatch.setattr("app.main.build_llm", lambda: FakeGuideAPI(fail=True))
    client = TestClient(app)
    r = client.post("/api/guides", json={"projectId": "miniapp", "finding": FINDING})
    assert r.status_code == 502
    assert r.json()["detail"] == "No se pudo generar la guía"


def test_guides_endpoint_archivo_borrado_dada_guia_con_snippet(monkeypatch, samples_dir):
    """RF1: el archivo del hallazgo ya no está en el proyecto -> guía anclada al snippet."""
    monkeypatch.setenv("SAMPLES_DIR", str(samples_dir))
    fake = FakeGuideAPI()
    monkeypatch.setattr("app.main.build_llm", lambda: fake)
    client = TestClient(app)
    r = client.post("/api/guides", json={"projectId": "miniapp",
                                         "finding": {**FINDING, "file": "borrado.js"}})
    assert r.status_code == 200
    assert "Código completo del archivo" not in fake.users[0]


def test_guides_endpoint_profile_incompleto_no_crasha(monkeypatch, samples_dir):
    """RF2: profile dict parcial (cliente antiguo) -> guía sin perfil, sin crash."""
    monkeypatch.setenv("SAMPLES_DIR", str(samples_dir))
    fake = FakeGuideAPI()
    monkeypatch.setattr("app.main.build_llm", lambda: fake)
    client = TestClient(app)
    r = client.post("/api/guides", json={"projectId": "miniapp", "finding": FINDING,
                                         "profile": {"language": "Python"}})
    assert r.status_code == 200
    assert "Perfil:" not in fake.users[0]
