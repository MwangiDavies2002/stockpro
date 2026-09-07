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
const salesRoutes     = require('./src/routes/sales');
const devRoutes       = require('./src/routes/dev');
const userRoutes = require('./src/routes/users');
const shiftRoutes = require('./src/routes/shifts');
const locationRoutes = require('./src/routes/locations')
const customerRoutes = require('./src/routes/customers');
const accountRoutes = require('./src/routes/accountRoutes');
const treasuryRoutes = require('./src/routes/treasuryRoutes');
const settingRoutes = require('./src/routes/settingRoutes');
const journalEntryRoutes = require('./src/routes/journalEntryRoutes');
const referenceDataRoutes = require('./src/routes/referenceData');
const salesDocumentRoutes = require('./src/routes/salesDocuments');
const discountRoutes = require('./src/routes/discounts');

const app  = express();
const PORT = process.env.PORT || 5000;

/* ── Security & Middleware ─────────────────────────── */
app.use(helmet());
const corsOptions = {
  origin: (origin, callback) => {
    const whitelist = (process.env.FRONTEND_URL || 'http://localhost:3000,http://127.0.0.1:3000')
      .split(',').map((url) => url.trim()).filter(Boolean);
    const isVercelPreview = process.env.VERCEL_ENV === 'preview' && /^https:\/\/[^/]+\.vercel\.app$/.test(origin || '');
    if (!origin || whitelist.includes(origin) || isVercelPreview) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Authorization'],
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
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
app.use('/api/sales', salesRoutes);
app.use('/api/users', userRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/locations',locationRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/treasury', treasuryRoutes);
app.use('/api/accounting-settings', settingRoutes);
app.use('/api/journal-entries', journalEntryRoutes);
app.use('/api/reference-data', referenceDataRoutes);
app.use('/api/sales-documents', salesDocumentRoutes);
app.use('/api/discounts', discountRoutes);
app.get('/api/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// Development-only routes
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/dev', devRoutes);
}

/* ── Error handler ─────────────────────────────────── */
app.use(errorHandler);

/* ── Start ─────────────────────────────────────────── */
function listenAsync(port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      const boundPort = server.address()?.port;
      resolve({ server, port: boundPort });
    });
    server.once('error', reject);
  });
}

async function startServer(startPort, attempts = 5) {
  initializeDatabase();
  await testConnection();

  let port = startPort;
  for (let i = 0; i < attempts; i++) {
    try {
      const { port: boundPort } = await listenAsync(port);
      console.log(`✅  StockPro API running on http://localhost:${boundPort}`);
      return;
    } catch (err) {
      console.error(`Port ${port} unavailable: ${err.message}`);
      port += 1;
    }
  }

  console.warn('All configured ports were unavailable; attempting an ephemeral port.');
  try {
    const { port: boundPort } = await listenAsync(0);
    console.log(`✅  StockPro API running on http://localhost:${boundPort} (ephemeral port)`);
    return;
  } catch (err) {
    console.error('Unable to bind an ephemeral port:', err.message);
  }

  console.error('Failed to bind server after multiple attempts. Please set a free PORT in .env and retry.');
  process.exit(1);
}

// Vercel imports this Express instance as a serverless function. Only bind a
// local port when this file is run directly (npm start / npm run dev).
if (require.main === module) {
  startServer(Number(process.env.PORT || PORT)).catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}


module.exports = app;
