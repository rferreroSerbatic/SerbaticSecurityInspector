"""Agentes de vulnerabilidad A01–A10: prompts, parseo de hallazgos y validación contra el scan."""

from __future__ import annotations

import json

from app.agents.profile import Profile
from app.scanner import ScanResult

VULN_NAMES: dict[str, str] = {
    "A01": "Fallos de control de acceso",
    "A02": "Fallos criptográficos",
    "A03": "Inyección",
    "A04": "Diseño inseguro",
    "A05": "Configuración insegura",
    "A06": "Componentes vulnerables u obsoletos",
    "A07": "Identificación y autenticación",
    "A08": "Integridad del software",
    "A09": "Registro y monitorización",
    "A10": "Suplantición de servidor (SSRF)",
}

VULN_PROMPTS: dict[str, str] = {
    "A01": (
        "Busca fallos de control de acceso: rutas o handlers que expongan datos o funciones "
        "sin comprobar autenticación, autorización o rol; acceso a recursos de otros usuarios "
        "(IDOR) sin verificar que el usuario propietario coincide; endpoints administrativos "
        "accesibles sin permisos. Revisa routers, middlewares y handlers que usen "
        "`req.params`, IDs de sesión o rutas tipo `/admin` sin guardas."
    ),
    "A02": (
        "Busca fallos criptográficos: algoritmos débiles o obsoletos (MD5, SHA1, DES, RC4), "
        "claves o secretos hardcodeados en el código (API keys, tokens, passwords), cifrado "
        "con IV o nonce fijo o reutilizado, y datos sensibles almacenados o transmitidos en claro. "
        "Revisa `crypto`, funciones de hash/cifrado y constantes con nombre de secreto."
    ),
    "A03": (
        "Busca inyección: SQL (concatenación de entrada del usuario en consultas), comandos de "
        "sistema y evaluación de expresiones. Revisa rutas, handlers y utilidades que construyan "
        "queries, shell commands o eval a partir de `req.body`, `req.query`, `req.params` o "
        "variables de entrada."
    ),
    "A04": (
        "Busca diseño inseguro: lógica de negocio que se valida solo en el cliente y no se "
        "revalida en el servidor (límites de cantidad, permisos, flujos multi-paso), ausencia de "
        "controles de tasa, y suposiciones de que la entrada es confiable cuando no lo es. "
        "Revisa handlers donde la regla de negocio (límites, pasos, roles) no se comprueba en el backend."
    ),
    "A05": (
        "Busca configuración insegura: modo debug o stack traces en producción, CORS abierto "
        "(`Access-Control-Allow-Origin: *` con credenciales), headers de seguridad ausentes, "
        "puertos o servicios expuestos de más, y valores por defecto o de desarrollo aún activos. "
        "Revisa middlewares, `app.use` y la configuración del servidor."
    ),
    "A06": (
        "Busca componentes vulnerables u obsoletos: librerías de terceros con versiones afectadas "
        "por fallos públicos. Revisa las dependencias que el código usa (`require`/`import`) y, "
        "en particular, revisar los manifiestos de dependencias (package.json, etc.) en busca de "
        "versiones conocidas como vulnerables (CVE públicos); reporta la dependencia, la versión "
        "declarada y la línea del manifiesto donde aparece."
    ),
    "A07": (
        "Busca fallos de identificación y autenticación: login sin rate-limit, tokens de sesión "
        "predecibles o generados con `Math.random()`, comparación de contraseñas con hash débil, "
        "credenciales por defecto, y falta de expiración o revocación de sesión. Revisa los "
        "endpoints de login/logout y cómo se generan, almacenan y validan las sesiones."
    ),
    "A08": (
        "Busca fallos de integridad del software: ejecución o carga de código no verificado enviado "
        "por el cliente (`eval`, `Function`, `exec`, `require` dinámico), deserialización de datos "
        "no confiables, y carga de archivos o plugins sin validar su origen. Revisa cualquier "
        "ejecución dinámica, `eval`/`Function`/`exec` o deserialización sobre entrada externa."
    ),
    "A09": (
        "Busca fallos de registro y monitorización: eventos de seguridad relevantes que no se "
        "registran (falsos intentos de login, denegaciones de acceso, errores críticos), logs sin "
        "el contexto necesario para investigar, y ausencia de alertas ante actividad anómala. "
        "Revisa los puntos sensibles (auth, cambios de datos) y comprueba si dejan rastro auditable."
    ),
    "A10": (
        "Busca suplantación de servidor (SSRF): el servidor hace peticiones a URLs o hosts "
        "controlados por el usuario sin allowlist (red interna, metadatos de nube como "
        "`169.254.169.254`). Revisa `http.get`/`https.get`/`fetch`/`axios` y cualquier llamada "
        "saliente cuyo destino venga de `req.query`, `req.body` o `req.params`."
    ),
}

COMMON_RULES = (
    "Recuerda tus reglas comunes: eres un auditor de seguridad de Serbatic y SOLO reportas lo que "
    "ves explícitamente en el código proporcionado; está prohibido el «podría», el «probablemente» "
    "o cualquier hipótesis sobre código que no está delante. Usa rutas de archivo relativas "
    "(separador /) y números de línea reales del código proporcionado. Asigna la severidad por el "
    "impacto real observable: critical = explotación directa con impacto grave; high = explotación "
    "fácil con impacto notable; medium = requiere condiciones adicionales; low = riesgo menor o "
    "informativo. Si no hay hallazgos, devuelve un array vacío []. Tu respuesta debe ser SOLO el "
    "array JSON, sin markdown ni texto alrededor."
)

SEVERITIES = ("critical", "high", "medium", "low")


def build_vuln_prompt(vuln_id: str, profile: Profile, scan: ScanResult) -> tuple[str, str]:
    """Devuelve ``(system, user)`` para el agente de la categoría ``vuln_id``."""
    system = (
        f"Eres el agente {vuln_id} ({VULN_NAMES[vuln_id]}) de Serbatic Security Inspector. "
        f"{VULN_PROMPTS[vuln_id]} "
        f"{COMMON_RULES}"
        " Devuelve solo JSON válido: un array de objetos con las claves severity, title, file, line, "
        "snippet, exploit, consequences, solution. severity debe ser critical, high, medium o low."
    )
    parts = [
        f"Categoría: {vuln_id} · {VULN_NAMES[vuln_id]}",
        f"Perfil: {profile.language} — {len(profile.frameworks)} frameworks",
        "## Código:",
    ]
    for code in scan.files:
        parts.append(f"\n// ── {code.path} ──\n{code.content}")
    for manifest in scan.manifests:
        parts.append(f"\n// ── {manifest.path} (manifiesto) ──\n{manifest.content}")
    return system, "\n".join(parts)


def _first_json_array(raw: str) -> list | None:
    decoder = json.JSONDecoder()
    start = raw.find("[")
    while start != -1:
        try:
            obj, _ = decoder.raw_decode(raw[start:])
        except json.JSONDecodeError:
            start = raw.find("[", start + 1)
            continue
        if isinstance(obj, list):
            return obj
        start = raw.find("[", start + 1)
    return None


def parse_findings(raw: str, vuln_id: str) -> list[dict]:
    """Extrae el primer array JSON válido de ``raw`` (tolerante a fences ```json y prosa).

    ``vuln_id`` se conserva en la firma por la interfaz del pipeline (Task 5).
    """
    arr = _first_json_array(raw)
    if arr is None:
        return []
    return [item for item in arr if isinstance(item, dict)]


def validate_finding(f: dict, scan: ScanResult) -> bool:
    """Verifica que un hallazgo apunta a algo real del scan: file, línea, severidad y título."""
    if not isinstance(f, dict):
        return False
    file = f.get("file")
    if not isinstance(file, str) or file not in scan.all_paths:
        return False
    target = next((cf for cf in [*scan.files, *scan.manifests] if cf.path == file), None)
    if target is None:
        return False
    line = f.get("line")
    if not isinstance(line, int) or isinstance(line, bool):
        return False
    if not 1 <= line <= target.lines:
        return False
    if f.get("severity") not in SEVERITIES:
        return False
    title = f.get("title")
    return isinstance(title, str) and bool(title.strip())
