// Página de demo: índice de las 10 vulnerabilidades sembradas y cómo probar cada una.
// Sirve en GET / para que la demo sea autoexplicativa al arrancar la miniapp.
const router = require('express').Router();

// endpoint: método + ruta (null = solo visible en el código/consola)
// href: solo para GET (clic directo desde la página)
// curl: para POST (snippet para copiar)
const VULNS = [
  {
    id: 'A01', name: 'Fallos de control de acceso', endpoint: 'GET /api/admin/users',
    href: '/api/admin/users',
    how: 'Ábrelo sin sesión: devuelve TODOS los usuarios (con sus hashes) porque no se comprueba autorización ni rol.',
    code: 'routes/admin.js:4',
  },
  {
    id: 'A02', name: 'Fallos criptográficos', endpoint: null,
    how: 'API_SECRET hardcodeado y contraseñas con MD5 (sin salt). Visible en el código, no en el navegador.',
    code: 'utils/crypto.js:2-4',
  },
  {
    id: 'A03', name: 'Inyección', endpoint: 'POST /api/orders',
    curl: 'curl -X POST http://localhost:3000/api/orders -H "Content-Type: application/json" -d \'{"item":"x\'); DROP TABLE users;--","qty":1}\'',
    how: 'La SQL se construye por concatenación: el parámetro item entra directo en la instrucción.',
    code: 'routes/orders.js:4',
  },
  {
    id: 'A04', name: 'Diseño inseguro por defecto', endpoint: 'POST /api/transfer',
    curl: 'curl -X POST http://localhost:3000/api/transfer -H "Content-Type: application/json" -d \'{"from":"u1","to":"u2","amount":999999}\'',
    how: 'El límite de 10.000 por transferencia se valida solo en el cliente: desde aquí se envía lo que sea.',
    code: 'routes/transfer.js:5',
  },
  {
    id: 'A05', name: 'Fallos de configuración de seguridad', endpoint: 'cualquier endpoint (cabeceras)',
    how: 'Todas las respuestas llevan Access-Control-Allow-Origin: * con credenciales. Visible en la pestaña Network de tus devtools.',
    code: 'middleware/cors.js:4-5',
  },
  {
    id: 'A06', name: 'Componentes con vulnerabilidades conocidas', endpoint: null,
    how: 'debug@2.6.9 y lodash@4.17.15 con CVEs publicados (loggers, prototype pollution). Visible en package.json.',
    code: 'package.json:9-10',
  },
  {
    id: 'A07', name: 'Fallos de identificación y autenticación', endpoint: 'POST /api/login',
    curl: 'curl -X POST http://localhost:3000/api/login -H "Content-Type: application/json" -d \'{"username":"ana","password":"ana123"}\'',
    how: 'Sin rate-limit (brute force libre) y el token es Math.random() predecible.',
    code: 'routes/login.js:5-9',
  },
  {
    id: 'A08', name: 'Ejecución de código no verificado', endpoint: 'POST /api/plugins',
    curl: 'curl -X POST http://localhost:3000/api/plugins -H "Content-Type: application/json" -d \'{"code":"1+1"}\'',
    how: 'eval() sobre el cuerpo de la petición: código de cliente ejecutado en el servidor tal cual.',
    code: 'routes/plugins.js:4',
  },
  {
    id: 'A09', name: 'Registro y monitoreo insuficientes', endpoint: 'POST /api/login (consola del servidor)',
    how: 'El middleware de auditoría solo loguea el login correcto: los fallos de credencial no dejan rastro.',
    code: 'middleware/audit.js:5',
  },
  {
    id: 'A10', name: 'Integración con aplicaciones de terceros (SSRF)', endpoint: 'GET /api/report?url=…',
    href: '/api/report?url=https://example.com',
    how: 'La URL la controla el cliente sin allowlist: puedes apuntar a servicios internos (p. ej. http://169.254.169.254/ en la nube).',
    code: 'routes/report.js:5',
  },
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const sections = VULNS.map((v) => `
  <section id="${v.id}" class="card">
    <h2>${v.id} · ${esc(v.name)}</h2>
    ${v.endpoint ? `<p class="ep">${esc(v.endpoint)}</p>` : '<p class="ep">solo visible en el código / consola</p>'}
    <p>${esc(v.how)}</p>
    ${v.href ? `<p><a class="btn" href="${esc(v.href)}">▶ probar ahora</a></p>` : ''}
    ${v.curl ? `<pre class="curl">${esc(v.curl)}</pre>` : ''}
    <p class="code">📍 ${esc(v.code)}</p>
  </section>`).join('\n');

router.get('/', (req, res) => {
  res.send(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>miniapp · demo vulnerable</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { background: #06060b; color: #f4f4f8; font-family: ui-monospace, monospace; margin: 0; padding: 24px; }
  .wrap { max-width: 760px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h1 span { color: #00e5ff; }
  .sub { color: #8b8b98; font-size: 13px; margin-bottom: 20px; }
  .warn { border: 1px solid #ff2d95; background: rgba(255,45,149,.08); color: #ff2d95; padding: 10px 12px; font-size: 12px; margin-bottom: 20px; }
  .card { border: 1px solid rgba(0,229,255,.25); background: #0a0a14; border-radius: 6px; padding: 14px 16px; margin-bottom: 12px; scroll-margin-top: 16px; }
  .card h2 { font-size: 14px; margin: 0 0 6px; color: #00e5ff; }
  .ep { color: #ff2d95; font-size: 12px; margin: 0 0 6px; }
  .card p { font-size: 13px; margin: 6px 0; color: #f4f4f8; }
  .btn { display: inline-block; color: #06060b; background: #00e5ff; text-decoration: none; padding: 6px 12px; border-radius: 4px; font-size: 12px; font-weight: bold; }
  .btn:hover { background: #ff2d95; color: #f4f4f8; }
  .curl { background: #000; border: 1px solid #2a2a38; padding: 10px; font-size: 11px; overflow-x: auto; color: #8b8b98; }
  .code { color: #5a5a68; font-size: 11px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>miniapp <span>· demo vulnerable</span></h1>
  <p class="sub">Proyecto de ejemplo de Serbatic Security Inspector — 10 vulnerabilidades OWASP Top 10 sembradas, una por categoría.</p>
  <div class="warn">⚠ APLICACIÓN INTENCIONALMENTE VULNERABLE. Solo para auditoría local: no la expongas a ninguna red real.</div>
  ${sections}
  <p class="sub">Análiza esta app desde Serbatic Security Inspector: la auditoría detecta (o no) cada una de estas 10 vulnerabilidades.</p>
</div>
</body>
</html>`);
});

module.exports = router;
