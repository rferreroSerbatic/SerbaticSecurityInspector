const { hashPassword } = require('./crypto');

const users = [
  { username: 'admin', passwordHash: hashPassword('admin123') },
  { username: 'alice', passwordHash: hashPassword('alice2024') }
];

const orders = [];

function query(sql) {
  console.log('SQL:', sql);
  return { ok: true };
}

function transfer(from, to, amount) {
  /* mueve saldo en memoria */
}

module.exports = { users, orders, query, transfer };
