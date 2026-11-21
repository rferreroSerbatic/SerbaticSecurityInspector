from app.agents.profile import Profile
from app.agents.vulns import (
    VULN_PROMPTS,
    build_vuln_prompt,
    parse_findings,
    validate_finding,
)
from app.scanner import CodeFile, ScanResult

scan = ScanResult(
    files=[
        CodeFile(path="routes/orders.js", lines=10, content="l1\n" * 9 + "l10"),
        CodeFile(path="routes/admin.js", lines=6, content="a\n" * 5 + "a"),
    ],
    manifests=[CodeFile(path="package.json", lines=3, content="{\n  \"name\": \"miniapp\"\n}\n")],
    all_paths={"routes/orders.js", "routes/admin.js", "package.json"},
    total_chars=0,
)

profile = Profile("miniapp", "JavaScript", [{"name": "Express", "version": "4.19"}], ["server.js"], "d", "")


def test_prompts_cover_the_ten():
    assert set(VULN_PROMPTS) == {f"A{i:02d}" for i in range(1, 11)}


def test_build_prompt_contains_category_code_and_manifests():
    system, user = build_vuln_prompt("A03", profile, scan)
    assert user.startswith("Categoría: A03 · Inyección")
    assert "// ── routes/orders.js ──" in user
    assert "// ── package.json (manifiesto) ──" in user
    assert "Inyección" in system


def test_parse_findings_clean():
    raw = '[{"severity":"high","title":"SQLi","file":"routes/orders.js","line":4,"snippet":"x","exploit":"e","consequences":"c","solution":"s"}]'
    assert len(parse_findings(raw, "A03")) == 1


def test_parse_findings_fenced_prose_and_junk():
    fenced = 'Claro:\n```json\n[{"severity":"low","title":"t","file":"a.js","line":1,"snippet":"","exploit":"","consequences":"","solution":""}]\n```'
    assert len(parse_findings(fenced, "A05")) == 1
    assert parse_findings("nada", "A05") == []


def test_validate_finding_rules():
    good = {"severity": "high", "title": "t", "file": "routes/orders.js", "line": 4,
            "snippet": "s", "exploit": "e", "consequences": "c", "solution": "sol"}
    assert validate_finding(good, scan) is True
    assert validate_finding({**good, "file": "nope.js"}, scan) is False
    assert validate_finding({**good, "line": 99999}, scan) is False
    assert validate_finding({**good, "severity": "urgent"}, scan) is False
    assert validate_finding({**good, "title": ""}, scan) is False
    # manifiestos son válidos como file (ruling R2)
    assert validate_finding({**good, "file": "package.json", "line": 2}, scan) is True
