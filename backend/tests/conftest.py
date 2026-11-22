"""Fixtures globales de la suite de backend."""
import pytest


@pytest.fixture(autouse=True)
def isolated_git_workspace(monkeypatch, tmp_path):
    """El workspace git nunca apunta al real: el escaneo de arranque (lifespan)
    no debe registrar en GIT clones reales de E2Es anteriores durante los tests."""
    monkeypatch.setattr("app.git_projects.WORKSPACE", tmp_path / "workspace")
