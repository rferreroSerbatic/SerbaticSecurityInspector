import asyncio
import json
from pathlib import Path

import pytest

from app.config import load_settings
from app.llm import LLMClient
from app.pipeline import run_pipeline, ALL_VULN_IDS
from app.projects import get_project
from app.runs import RunRegistry

SAMPLES = Path(__file__).resolve().parents[2] / "samples"


@pytest.mark.llm
def test_miniapp_ground_truth():
    settings = load_settings()
    info, scan = get_project(SAMPLES, "miniapp")
    assert info is not None
    expected = json.loads((SAMPLES / "miniapp" / "expected-findings.json").read_text(encoding="utf-8"))

    llm = LLMClient(settings.llm_base_url, settings.llm_api_key, settings.llm_model)
    reg = RunRegistry()
    run = reg.start("miniapp", list(ALL_VULN_IDS))

    async def go():
        try:
            await run_pipeline(llm, scan, info.name, list(ALL_VULN_IDS), run, settings.llm_concurrency)
        finally:
            await llm.close()

    asyncio.run(go())
    assert run.status in ("done", "error"), f"run terminó en {run.status}: {run.events[-1]}"

    found = {(f["vulnId"], f["file"]) for f in run.findings}
    matched = [e for e in expected if (e["vulnId"], e["file"]) in found]
    missing = [e for e in expected if e not in matched]
    assert len(matched) >= 8, f"ground truth {len(matched)}/10; sin detectar: {missing}"
    print(f"\nGROUND TRUTH: {len(matched)}/10 · fallos: {[e['vulnId'] for e in missing]}")
