const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { query, db } = require('../config/db');

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

/* POST /api/auth/register */
async function register(req, res, next) {
  try {
    const { name, email, password, confirmPassword, role = 'employee', phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'name, email and password are required' });
    }
    if (confirmPassword && confirmPassword !== password) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }
    const exists = db.selectOne('users', { email });
    if (exists) return res.status(409).json({ message: 'Email already registered' });

    const hash = await bcrypt.hash(password, 12);
    const user = db.insert('users', { name, email, password: hash, role, phone: phone || null });

    const token = signToken({ id: user.id, email: user.email, role: user.role, name: user.name });
    res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) { next(err); }
}

/* POST /api/auth/login */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'email and password required' });

    const { rows } = query(
      'SELECT id,name,email,password,role,active FROM users WHERE email=?',
      [email]
    );
    if (!rows.length) return res.status(401).json({ message: 'Invalid credentials' });
    const user = rows[0];
    if (!user.active) return res.status(403).json({ message: 'Account is inactive' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });

    const token = signToken(user);
    res.json({ token, user: { id:user.id, name:user.name, email:user.email, role:user.role } });
  } catch (err) { next(err); }
}

/* POST /api/auth/logout */
function logout(_req, res) {
  // JWT is stateless; client deletes the cookie/token
  res.json({ message: 'Logged out successfully' });
}

/* GET /api/auth/me */
async function me(req, res, next) {
  try {
    const { rows } = query(
      'SELECT id,name,email,role,phone,created_at FROM users WHERE id=?',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'User not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

module.exports = { register, login, logout, me };
