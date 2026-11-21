const https = require('https');
const router = require('express').Router();
router.get('/api/report', (req, res) => {
  // A10: la URL la controla el cliente, sin allowlist
  https.get(req.query.url, (up) => {
    let d = '';
    up.on('data', (c) => { d += c; });
    up.on('end', () => res.send(d));
  });
});
module.exports = router;
