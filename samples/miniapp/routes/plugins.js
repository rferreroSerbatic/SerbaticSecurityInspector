const router = require('express').Router();
router.post('/api/plugins', (req, res) => {
  // A08: ejecución de código no verificado del cliente
  try { eval(req.body.code); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ ok: false, error: String(e) }); }
});
module.exports = router;
