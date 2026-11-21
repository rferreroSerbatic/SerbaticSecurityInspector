const router = require('express').Router();
const db = require('../utils/db');
router.post('/api/orders', (req, res) => {
  const sql = `INSERT INTO orders (item, qty) VALUES ('${req.body.item}', ${req.body.qty})`; // A03: SQL concatenada
  db.query(sql);
  res.json({ ok: true });
});
module.exports = router;
