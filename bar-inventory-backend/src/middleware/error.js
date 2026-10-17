/**
 * Central Express error handler. Normalizes several common error shapes
 * (validation errors, PostgreSQL constraint codes) and returns a JSON response.
 */
function errorHandler(err, req, res, next) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

  // Validation errors from express-validator
  if (err.type === 'validation') {
    return res.status(422).json({ message: 'Validation failed', errors: err.errors });
  }

  // PostgreSQL unique constraint
  if (err.code === '23505') {
    return res.status(409).json({ message: 'Duplicate entry — record already exists' });
  }

  // PostgreSQL foreign key violation
  if (err.code === '23503') {
    return res.status(400).json({ message: 'Referenced record does not exist' });
  }

  const status = err.status || err.statusCode || 500;
  const message = status === 500 && process.env.NODE_ENV === 'production' 
    ? 'An unexpected error occurred. Please contact support.' 
    : err.message || 'Internal server error';

  res.status(status).json({
    message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}

module.exports = errorHandler;
