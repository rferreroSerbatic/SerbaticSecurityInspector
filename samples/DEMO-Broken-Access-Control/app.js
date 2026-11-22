// Vulnerabilidad: el "control de acceso" solo existe en el cliente.
// El login no valida nada: cualquier usuario y contraseña funciona
// y solo escribe un flag en localStorage. admin.html no comprueba
// autenticación alguna.
document.getElementById('login-form').addEventListener('submit', function (e) {
  e.preventDefault();
  var user = document.getElementById('user').value;
  localStorage.setItem('logged_in', '1');
  document.getElementById('login-msg').textContent = 'Hola, ' + user + '. Ya estás "autenticado".';
});
