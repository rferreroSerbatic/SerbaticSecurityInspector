// Vulnerabilidad: SQL Injection (A03:2021). La consulta se construye
// concatenando la entrada del usuario (req.query.user) sin parametrizar
// ni escapar. `db` es un stub: en un sistema real ejecutaría la query
// contra la base de datos.
var db = {
  exec: function (sql, cb) {
    console.log('SQL:', sql)
    cb(null, [{ user: 'maria' }, { user: 'jose' }])
  },
}

app.get('/api/users', function (req, res) {
  var sql = "SELECT * FROM users WHERE user = '" + req.query.user + "'"
  db.exec(sql, function (err, rows) {
    if (err) return res.status(500).send('Error de BD')
    res.json(rows)
  })
})
