const router = require('express').Router();
const db = require('../utils/db');
// A01: no se comprueba autorización ni rol
router.get('/api/admin/users', (req, res) => { res.json(db.users) });
module.exports = router;
