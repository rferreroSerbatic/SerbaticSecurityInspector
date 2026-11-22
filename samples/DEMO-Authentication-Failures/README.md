# DEMO - Authentication Failures (A07:2021)

Login con credenciales hardcodeadas en el cliente.

## Cómo explotarla
1. Mira `app.js` (o "Ver fuente" en el navegador): la contraseña es `admin123`.
2. Inicia sesión con `admin` / `admin123`.
3. Se muestra la zona privada.
4. No hay límite de intentos ni bloqueo por fallos.

## Test para el scanner
- Credenciales por defecto: `admin` / `admin123`.
- La contraseña está en texto plano en el JS servido al cliente.

## Ejecución
Abrir el archivo o servir la carpeta (p. ej. `python -m http.server` o `npx serve`).
