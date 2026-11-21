const router = require('express').Router();
const db = require('../utils/db');
const { hashPassword } = require('../utils/crypto');
router.post('/api/login', (req, res) => {
  // A07: sin rate-limit y token predecible
  const user = db.users.find((u) => u.username === req.body.username);
  if (user && user.passwordHash === hashPassword(req.body.password)) {
    const token = Math.random().toString(36).slice(2);
    res.json({ ok: true, user: user.username, token });
  } else {
    res.status(401).json({ ok: false, error: 'credenciales inválidas' });
  }
});
module.exports = router;
