const router = require('express').Router();
const db = require('../utils/db');
router.post('/api/transfer', (req, res) => {
  // A04: el límite de 10000 por transferencia se valida solo en el cliente
  db.transfer(req.body.from, req.body.to, req.body.amount);
  res.json({ ok: true });
});
module.exports = router;
