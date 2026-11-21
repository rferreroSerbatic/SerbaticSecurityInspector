module.exports = function cors(app) {
  // A05: CORS abierto con credenciales
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    next();
  });
};
