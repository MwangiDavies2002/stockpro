const jwt = require('jsonwebtoken');

/**
 * Express middleware to authenticate requests using `Authorization: Bearer <token>`.
 * On success, attaches `req.user` with the token payload.
 */
function authenticate(req, res, next) {
  // Allow CORS preflight requests to pass through without authentication
  if (req.method === 'OPTIONS') return next();
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }
  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    if (!Number.isInteger(Number(req.user.business_id)) || Number(req.user.business_id) < 1) {
      return res.status(401).json({ message: 'Account is not assigned to a shop' });
    }
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

/**
 * Middleware to allow only admin users to proceed.
 */
function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
}

module.exports = { authenticate, adminOnly };
