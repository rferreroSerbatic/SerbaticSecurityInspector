import asyncio

import pytest

from app.agents.profile import (
    Profile,
    build_profile_prompt,
    fallback_profile,
    parse_profile,
    run_profile,
)
from app.llm import ChatResult
from app.scanner import CodeFile, ScanResult


class FakeProfileLLM:
    def __init__(self, raw):
        self.raw = raw
        self.calls = 0
        self.model = "qwen3.8-fp8"

    async def chat(self, system, user, max_tokens=8000):
        self.calls += 1
        return ChatResult(content=self.raw)


@pytest.fixture
def scan_js():
    return ScanResult(
        files=[
            CodeFile(path="server.js", lines=10, content="app.listen(3000)\n"),
            CodeFile(path="routes.js", lines=5, content="module.exports = {}\n"),
        ],
        manifests=[CodeFile(path="package.json", lines=8, content='{"name": "miniapp"}\n')],
        all_paths={"server.js", "routes.js", "package.json"},
        total_chars=50,
    )


def test_parse_profile_clean():
    p = parse_profile('{"name":"m","language":"JavaScript","frameworks":[{"name":"Express","version":"4.19"}],"entry_points":["server.js"],"description":"d","notes":""}')
    assert p.language == "JavaScript" and p.frameworks[0]["name"] == "Express"


def test_parse_profile_fenced_and_prose():
    raw = 'Aquí tienes:\n```json\n{"name":"m","language":"Python","frameworks":[],"entry_points":[],"description":"","notes":""}\n```\nListo.'
    assert parse_profile(raw).language == "Python"


def test_parse_profile_junk():
    assert parse_profile("esto no es json") is None


def test_fallback_profile_by_extension(scan_js):
    p = fallback_profile(scan_js, "miniapp")
    assert p.language == "JavaScript" and p.notes == "perfil generado por reglas"


def test_run_profile_uses_fallback_on_junk(scan_js):
    prof, used = asyncio.run(run_profile(FakeProfileLLM("no json"), scan_js, "miniapp"))
    assert used is True and prof.language == "JavaScript"
