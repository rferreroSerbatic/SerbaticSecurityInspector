module.exports = function audit(app) {
  app.use('/api/login', (req, res, next) => {
    const orig = res.json.bind(res);
    res.json = (body) => {
      if (body && body.ok) console.log('LOGIN OK user=' + body.user); // A09: solo se loguea el éxito
      return orig(body);
    };
    next();
  });
};
