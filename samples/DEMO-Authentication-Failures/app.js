// Vulnerabilidad: credenciales hardcodeadas en el cliente, en texto
// plano y visibles para cualquiera que mire el fuente. Sin límite de
// intentos ni bloqueo.
var CREDENCIALES = {
  admin: 'admin123'
};

document.getElementById('login-form').addEventListener('submit', function (e) {
  e.preventDefault();
  var user = document.getElementById('user').value;
  var pass = document.getElementById('pass').value;
  if (CREDENCIALES[user] === pass) {
    document.getElementById('msg').textContent = 'Acceso concedido.';
    document.getElementById('secret').style.display = 'block';
  } else {
    document.getElementById('msg').textContent = 'Usuario o contraseña incorrectos.';
  }
});
