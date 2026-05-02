require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');

const { testConnection, initializeDatabase } = require('./src/config/db');
const errorHandler       = require('./src/middleware/error');

// Routes
const authRoutes      = require('./src/routes/auth');
const inventoryRoutes = require('./src/routes/inventory');
const orderRoutes     = require('./src/routes/orders');
const reportRoutes    = require('./src/routes/reports');
const supplierRoutes  = require('./src/routes/suppliers');
const mpesaRoutes     = require('./src/routes/mpesa');
const devRoutes       = require('./src/routes/dev');

const app  = express();
const PORT = process.env.PORT || 5000;

/* ── Security & Middleware ─────────────────────────── */
app.use(helmet());
app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));

// Global rate limiter
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max:      200,
  message:  { error: 'Too many requests, please try again later.' },
}));

/* ── Routes ────────────────────────────────────────── */
app.use('/api/auth',      authRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/orders',    orderRoutes);
app.use('/api/reports',   reportRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/mpesa',     mpesaRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// Development-only routes
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/dev', devRoutes);
}

/* ── Error handler ─────────────────────────────────── */
app.use(errorHandler);

/* ── Start ─────────────────────────────────────────── */
(async () => {
  initializeDatabase();
  await testConnection();
  app.listen(PORT, () => {
    console.log(`✅  BarStock API running on http://localhost:${PORT}`);
  });
})();
