const bcrypt = require('bcryptjs');
const { query } = require('../config/db');

/* GET /api/users */
/**
 * List all users (admin only). Password hash is never returned.
 */
async function getAll(req, res, next) {
  try {
    const { rows } = await query(
      'SELECT id, name, email, role, phone, active, created_at FROM users ORDER BY created_at ASC'
    );
    res.json(rows);
  } catch (err) { next(err); }
}

/* GET /api/users/:id */
/**
 * Get a single user by ID (admin only).
 */
async function getOne(req, res, next) {
  try {
    const { rows } = await query(
      'SELECT id, name, email, role, phone, active, created_at FROM users WHERE id=?',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'User not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

/* POST /api/users */
/**
 * Create a new staff user (admin only). Requires name, email, password.
 */
async function create(req, res, next) {
  try {
    const { name, email, password, role, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'name, email and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const existing = await query('SELECT id FROM users WHERE email=?', [email]);
    if (existing.rows.length) return res.status(409).json({ message: 'Email already registered' });

    const hash = await bcrypt.hash(password, 12);
    const { insertId } = await query(
      'INSERT INTO users (name,email,password,role,phone) VALUES (?,?,?,?,?)',
      [name, email, hash, role || 'employee', phone || null]
    );

    const { rows } = await query(
      'SELECT id, name, email, role, phone, active, created_at FROM users WHERE id=?',
      [insertId]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

/* PUT /api/users/:id */
/**
 * Update a user's details (admin only). Password only updated if provided.
 */
async function update(req, res, next) {
  try {
    const { name, email, password, role, phone, active } = req.body;
    const check = await query('SELECT id FROM users WHERE id=?', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ message: 'User not found' });

    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ message: 'Password must be at least 8 characters' });
      }
      const hash = await bcrypt.hash(password, 12);
      await query(
        'UPDATE users SET name=?,email=?,password=?,role=?,phone=?,active=?,updated_at=NOW() WHERE id=?',
        [name, email, hash, role, phone || null, active ?? true, req.params.id]
      );
    } else {
      await query(
        'UPDATE users SET name=?,email=?,role=?,phone=?,active=?,updated_at=NOW() WHERE id=?',
        [name, email, role, phone || null, active ?? true, req.params.id]
      );
    }

    const { rows } = await query(
      'SELECT id, name, email, role, phone, active, created_at FROM users WHERE id=?',
      [req.params.id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
}

/* PATCH /api/users/:id/toggle-active */
/**
 * Toggle a user's active status (admin only).
 */
async function toggleActive(req, res, next) {
  try {
    const { rows } = await query('SELECT active FROM users WHERE id=?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'User not found' });
    const newActive = !rows[0].active;
    await query('UPDATE users SET active=?,updated_at=NOW() WHERE id=?', [newActive, req.params.id]);
    const { rows: updated } = await query(
      'SELECT id, name, email, role, phone, active, created_at FROM users WHERE id=?',
      [req.params.id]
    );
    res.json(updated[0]);
  } catch (err) { next(err); }
}

/* DELETE /api/users/:id */
/**
 * Delete a user (admin only). Cannot delete yourself, and cannot delete
 * the last remaining admin account.
 */
async function remove(req, res, next) {
  try {
    if (Number(req.params.id) === req.user.id) {
      return res.status(400).json({ message: "You can't delete your own account" });
    }

    const target = await query('SELECT role FROM users WHERE id=?', [req.params.id]);
    if (!target.rows.length) return res.status(404).json({ message: 'User not found' });

    if (target.rows[0].role === 'admin') {
      const admins = await query("SELECT COUNT(*) AS count FROM users WHERE role='admin'");
      if (admins.rows[0].count <= 1) {
        return res.status(400).json({ message: 'Cannot delete the last remaining admin' });
      }
    }

    await query('DELETE FROM users WHERE id=?', [req.params.id]);
    res.json({ message: 'User deleted' });
  } catch (err) { next(err); }
}

module.exports = { getAll, getOne, create, update, toggleActive, remove };