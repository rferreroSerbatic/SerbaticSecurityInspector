// Vulnerabilidad: el panel de administración (admin.html) se sirve sin
// comprobar autenticación alguna y expone los secretos del sistema en el
// código que cualquier visitante recibe.
var CONFIG = {
  API_KEY: 'sk-1234567890abcdef',
  DB_HOST: '10.0.0.5',
  DB_PASS: 'SuperSecret99',
}

function renderConfig() {
  document.getElementById('admin-config').textContent =
    'API_KEY=' + CONFIG.API_KEY + '\n' +
    'DB_HOST=' + CONFIG.DB_HOST + '\n' +
    'DB_PASS=' + CONFIG.DB_PASS
}

renderConfig()
