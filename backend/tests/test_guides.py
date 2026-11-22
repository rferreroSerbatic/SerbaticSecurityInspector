"""Agente de guías de explotación (Fase 2d): prompt anti-alucinación y parseo tolerante."""
import re

from app.agents.guides import GUIDE_MAX_TOKENS, build_guide_prompt, extract_guide
from app.agents.profile import Profile

FINDING = {
    "id": "A03-1", "vulnId": "A03", "severity": "high", "title": "SQLi en get_orders",
    "file": "routes/orders.js", "line": 4, "snippet": "q = 'SELECT * FROM orders WHERE user = ' + user",
    "exploit": "user=1 OR 1=1--", "consequences": "lectura de la tabla completa",
    "solution": "consulta parametrizada",
}
PROFILE = Profile(name="miniapp", language="JavaScript",
                  frameworks=[{"name": "Express", "version": "4.19"}],
                  entry_points=["routes/orders.js"], description="API Express de ejemplo", notes="")


def test_guide_max_tokens():
    assert GUIDE_MAX_TOKENS == 1600


def test_build_guide_prompt_system_anti_alucion_y_estructura():
    system, _ = build_guide_prompt(FINDING, "x = 1", PROFILE, "miniapp")
    assert system.startswith("Eres el agente de guías de explotación")
    assert "prohibido inventar" in system
    for h in ("## RESUMEN", "## PASOS", "## PAYLOAD DE EJEMPLO", "## IMPACTO EN ESTE PROYECTO"):
        assert h in system


def test_build_guide_prompt_user_ancla_datos_reales():
    _, user = build_guide_prompt(FINDING, "const a = 1;", PROFILE, "miniapp")
    assert "Proyecto: miniapp" in user
    assert "JavaScript" in user
    assert "A03" in user and "Inyección" in user
    assert "routes/orders.js:4" in user
    assert "SQLi en get_orders" in user
    assert FINDING["snippet"] in user
    assert "const a = 1;" in user  # archivo completo incluido


def test_build_guide_prompt_sin_archivo_ni_perfil():
    _, user = build_guide_prompt(FINDING, None, None, "miniapp")
    assert "Código completo" not in user
    assert FINDING["snippet"] in user  # el snippet sigue ahí


def test_build_guide_prompt_user_no_colision_con_despacho():
    """Review Focus 3: los fakes despachan por 'Categoría: A0X'; el prompt de guía
    no debe contener ese patrón (usar 'ID: {id} · {vulnId} (nombre)', no 'Categoría: A0X')."""
    _, user = build_guide_prompt(FINDING, "x", PROFILE, "miniapp")
    assert re.search(r"Categoría: A\d+", user) is None


def test_extract_guide_limpia_fences_y_espacios():
    assert extract_guide("```text\n## RESUMEN\nhola\n```") == "## RESUMEN\nhola"
    assert extract_guide("  guía sin fences  \n") == "guía sin fences"


def test_extract_guide_vacio():
    assert extract_guide("```") == ""
    assert extract_guide("   \n  ") == ""
