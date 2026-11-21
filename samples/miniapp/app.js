const express = require('express');
const cors = require('./middleware/cors');
const audit = require('./middleware/audit');

const app = express();

cors(app);
audit(app);

app.use(require('./routes/admin'));
app.use(require('./routes/orders'));
app.use(require('./routes/login'));
app.use(require('./routes/transfer'));
app.use(require('./routes/plugins'));
app.use(require('./routes/report'));

module.exports = app;
