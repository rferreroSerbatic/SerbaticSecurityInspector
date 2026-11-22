# DEMO - Broken Access Control (A01:2021)

Control de acceso inexistente: la página "privada" es pública.

## Cómo explotarla
1. Abre `admin.html` directamente en la URL, sin iniciar sesión.
2. El panel privado (API key, credenciales de BD, listado de usuarios) se ve sin ninguna autenticación.
3. El login de `index.html` es decorativo: no valida nada y solo escribe un flag en `localStorage`.

## Test para el scanner
- `GET /admin.html` sin credenciales → 200 con datos sensibles.
- Los secretos están en `admin.js` (escaneable; los `.html` no se escanean).
- El análisis debe reportar hallazgos en `admin.js` (A02 claves hardcoded,
  A01 panel sin autenticación).

## Ejecución
Abrir los archivos o servir la carpeta (p. ej. `python -m http.server` o `npx serve`).
