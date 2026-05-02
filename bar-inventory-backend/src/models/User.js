const { query } = require('../config/db');

const User = {
  findById:    (id)    => query('SELECT id,name,email,role,phone,active,created_at FROM users WHERE id=$1', [id]),
  findByEmail: (email) => query('SELECT * FROM users WHERE email=$1', [email]),
  findAll:     ()      => query('SELECT id,name,email,role,phone,active,created_at FROM users ORDER BY name'),
  create:      (data)  => query(
    'INSERT INTO users (name,email,password,role,phone) VALUES ($1,$2,$3,$4,$5) RETURNING id,name,email,role',
    [data.name, data.email, data.password, data.role, data.phone||null]
  ),
  update: (id, data) => query(
    'UPDATE users SET name=$1,email=$2,role=$3,phone=$4,active=$5,updated_at=NOW() WHERE id=$6 RETURNING id,name,email,role,phone,active',
    [data.name, data.email, data.role, data.phone, data.active, id]
  ),
  updatePassword: (id, hash) => query('UPDATE users SET password=$1 WHERE id=$2', [hash, id]),
  delete: (id) => query('DELETE FROM users WHERE id=$1', [id]),
};

module.exports = User;
