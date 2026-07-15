const { query } = require('../config/db');

/**
 * Data access helpers for `users` table.
 */
const User = {
  /** Find a user by ID (limited fields). */
  findById:    (id)    => query('SELECT id,name,email,role,phone,active,created_at FROM users WHERE id=$1', [id]),
  /** Find a user by email (full row). */
  findByEmail: (email) => query('SELECT * FROM users WHERE email=$1', [email]),
  /** List all users. */
  findAll:     ()      => query('SELECT id,name,email,role,phone,active,created_at FROM users ORDER BY name'),
  /** Create a new user returning minimal fields. */
  create:      (data)  => query(
    'INSERT INTO users (name,email,password,role,phone) VALUES ($1,$2,$3,$4,$5) RETURNING id,name,email,role',
    [data.name, data.email, data.password, data.role, data.phone||null]
  ),
  /** Update user metadata (not password). */
  update: (id, data) => query(
    'UPDATE users SET name=$1,email=$2,role=$3,phone=$4,active=$5,updated_at=NOW() WHERE id=$6 RETURNING id,name,email,role,phone,active',
    [data.name, data.email, data.role, data.phone, data.active, id]
  ),
  /** Update a user's password (hash must be provided). */
  updatePassword: (id, hash) => query('UPDATE users SET password=$1 WHERE id=$2', [hash, id]),
  /** Delete a user by ID. */
  delete: (id) => query('DELETE FROM users WHERE id=$1', [id]),
};

module.exports = User;
