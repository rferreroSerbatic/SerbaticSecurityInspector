const crypto = require('crypto');
const API_SECRET = 'serbatic-2024'; // A02: secreto hardcodeado
function hashPassword(pw) {
  return crypto.createHash('md5').update(pw).digest('hex'); // A02: MD5
}
module.exports = { hashPassword, API_SECRET };
