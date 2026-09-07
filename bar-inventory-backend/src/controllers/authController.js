const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, getClient } = require('../config/db');

function publicBusiness(row = {}) {
  if (!row.business_id && !row.id) return null;
  return {
    id: row.business_id ?? row.id,
    name: row.business_name ?? row.name,
    currency: row.currency || 'KES',
    timezone: row.timezone || 'Africa/Nairobi',
    locale: row.locale || 'en-KE',
    businessType: row.business_type,
    defaultTaxRate: Number(row.default_tax_rate || 0),
    taxNumber: row.tax_number || null,
    sellingPriceTaxType: row.selling_price_tax_type || 'inclusive',
    stockAccountingMethod: row.stock_accounting_method || 'weighted_average',
    defaultLowStockThreshold: Number(row.default_low_stock_threshold || 5),
    features: {
      posOffline: !!row.feature_pos_offline,
      multiCurrencySales: !!row.feature_multi_currency_sales,
      barcodeScanning: row.feature_barcode_scanning !== 0,
      serviceRepair: !!row.feature_service_repair,
    },
    financialYearStartMonth: Number(row.financial_year_start_month || 1),
  };
}

function publicUser(user) {
  return {
    id: user.id,
    business_id: user.business_id,
    name: user.name,
    email: user.email,
    username: user.username || null,
    role: user.role,
    is_owner: !!user.is_owner,
    phone: user.phone || null,
    business: publicBusiness(user),
  };
}

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      business_id: user.business_id,
      is_owner: !!user.is_owner,
      currency: user.currency || 'KES',
      timezone: user.timezone || 'Africa/Nairobi',
      locale: user.locale || 'en-KE',
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

async function getDefaultBusinessId() {
  const { rows } = await query('SELECT id FROM businesses ORDER BY id LIMIT 1');
  if (rows.length) return rows[0].id;
  const { insertId } = await query(
    `INSERT INTO businesses (name,currency,country,state,city,zip_code,landmark,timezone,locale)
     VALUES ('Default Business','KES','Kenya','Nairobi','Nairobi','00100','Main Branch','Africa/Nairobi','en-KE')`
  );
  return insertId;
}

async function register(req, res, next) {
  try {
    const { name, email, password, confirmPassword, role = 'employee', phone } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'name, email and password are required' });
    if (confirmPassword && confirmPassword !== password) return res.status(400).json({ message: 'Passwords do not match' });
    const existing = await query('SELECT id FROM users WHERE email=?', [email]);
    if (existing.rows.length) return res.status(409).json({ message: 'Email already registered' });
    const businessId = req.body.businessId || await getDefaultBusinessId();
    const hash = await bcrypt.hash(password, 12);
    const { insertId } = await query(
      'INSERT INTO users (business_id,name,email,password,role,phone) VALUES (?,?,?,?,?,?)',
      [businessId, name, email, hash, role, phone || null]
    );
    const { rows } = await query(
      `SELECT u.*, b.name AS business_name, b.currency, b.timezone, b.locale, b.business_type, b.default_tax_rate, b.tax_number,
              b.selling_price_tax_type, b.stock_accounting_method, b.default_low_stock_threshold,
              b.feature_pos_offline, b.feature_multi_currency_sales, b.feature_barcode_scanning, b.feature_service_repair, b.financial_year_start_month
       FROM users u LEFT JOIN businesses b ON b.id=u.business_id WHERE u.id=?`,
      [insertId]
    );
    const user = rows[0];
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (err) { next(err); }
}

function requiredString(body, key, label = key) {
  const value = String(body[key] || '').trim();
  if (!value) throw Object.assign(new Error(`${label} is required`), { status: 400 });
  return value;
}

async function onboardBusiness(req, res, next) {
  const client = await getClient();
  try {
    const b = req.body.business || {};
    const s = req.body.settings || {};
    const o = req.body.owner || {};
    const businessName = requiredString(b, 'name', 'Business name');
    const currency = requiredString(b, 'currency', 'Currency').toUpperCase();
    const country = requiredString(b, 'country', 'Country');
    const state = requiredString(b, 'state', 'State');
    const city = requiredString(b, 'city', 'City');
    const zipCode = requiredString(b, 'zipCode', 'Zip code');
    const landmark = requiredString(b, 'landmark', 'Landmark');
    const timezone = requiredString(b, 'timezone', 'Time zone');
    const firstName = requiredString(o, 'firstName', 'First name');
    const username = requiredString(o, 'username', 'Username');
    const email = requiredString(o, 'email', 'Email');
    const password = requiredString(o, 'password', 'Password');
    if (password !== String(o.confirmPassword || '')) return res.status(400).json({ message: 'Passwords do not match' });
    if (!/^[A-Z]{3}$/.test(currency)) return res.status(400).json({ message: 'Currency must be a 3-letter ISO code' });
    const method = String(s.stockAccountingMethod || 'weighted_average');
    if (!['fifo','lifo','weighted_average'].includes(method)) return res.status(400).json({ message: 'Invalid stock accounting method' });
    const taxType = String(s.sellingPriceTaxType || 'inclusive');
    if (!['inclusive','exclusive'].includes(taxType)) return res.status(400).json({ message: 'Invalid selling price tax type' });
    const fyMonth = Number(s.financialYearStartMonth || 1);
    if (!Number.isInteger(fyMonth) || fyMonth < 1 || fyMonth > 12) return res.status(400).json({ message: 'Financial year start month is invalid' });

    const dupEmail = await client.query('SELECT id FROM users WHERE email=?', [email]);
    if (dupEmail.rows.length) return res.status(409).json({ message: 'Email already registered' });
    const dupUsername = await client.query('SELECT id FROM users WHERE username=?', [username]);
    if (dupUsername.rows.length) return res.status(409).json({ message: 'Username already registered' });

    await client.query('BEGIN');
    const { insertId: businessId } = await client.query(
      `INSERT INTO businesses
       (name,start_date,currency,logo_url,website,contact_number,alternate_contact_number,country,state,city,zip_code,landmark,timezone,locale,business_type,business_type_other,default_tax_rate,tax_number,selling_price_tax_type,stock_accounting_method,default_low_stock_threshold,feature_pos_offline,feature_multi_currency_sales,feature_barcode_scanning,feature_service_repair,financial_year_start_month)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [businessName, b.startDate || null, currency, b.logoUrl || null, b.website || null, b.contactNumber || null, b.alternateContactNumber || null, country, state, city, zipCode, landmark, timezone, b.locale || 'en-KE', s.businessType || 'Retail', s.businessTypeOther || null, Number(s.defaultTaxRate || 0), s.taxNumber || null, taxType, method, Number(s.defaultLowStockThreshold || 5), !!s.featurePosOffline, !!s.featureMultiCurrencySales, s.featureBarcodeScanning !== false, !!s.featureServiceRepair, fyMonth]
    );
    const { insertId: locationId } = await client.query(
      'INSERT INTO locations (business_id,name,address) VALUES (?,?,?)',
      [businessId, s.defaultBusinessLocation || 'Main Branch', `${city}, ${state}`]
    );
    const fullName = [firstName, String(o.lastName || '').trim()].filter(Boolean).join(' ');
    const hash = await bcrypt.hash(password, 12);
    const { insertId: userId } = await client.query(
      `INSERT INTO users (business_id,prefix,first_name,last_name,username,name,email,password,role,is_owner,phone)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [businessId, o.prefix || null, firstName, o.lastName || null, username, fullName, email, hash, 'admin', 1, b.contactNumber || null]
    );
    await client.query('COMMIT');
    const { rows } = await query(
      `SELECT u.*, b.name AS business_name, b.currency, b.timezone, b.locale, b.business_type, b.default_tax_rate, b.tax_number,
              b.selling_price_tax_type, b.stock_accounting_method, b.default_low_stock_threshold,
              b.feature_pos_offline, b.feature_multi_currency_sales, b.feature_barcode_scanning, b.feature_service_repair, b.financial_year_start_month
       FROM users u LEFT JOIN businesses b ON b.id=u.business_id WHERE u.id=?`,
      [userId]
    );
    res.status(201).json({ token: signToken(rows[0]), user: publicUser(rows[0]), businessId, locationId });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'email and password required' });
    const { rows } = await query(
      `SELECT u.*, b.name AS business_name, b.currency, b.timezone, b.locale, b.business_type, b.default_tax_rate, b.tax_number,
              b.selling_price_tax_type, b.stock_accounting_method, b.default_low_stock_threshold,
              b.feature_pos_offline, b.feature_multi_currency_sales, b.feature_barcode_scanning, b.feature_service_repair, b.financial_year_start_month
       FROM users u LEFT JOIN businesses b ON b.id=u.business_id WHERE u.email=?`,
      [email]
    );
    if (!rows.length) return res.status(401).json({ message: 'Invalid credentials' });
    const user = rows[0];
    if (!user.active) return res.status(403).json({ message: 'Account is inactive' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) { next(err); }
}

function logout(_req, res) { res.json({ message: 'Logged out successfully' }); }

async function me(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT u.id,u.business_id,u.name,u.email,u.username,u.role,u.is_owner,u.phone,u.created_at,
              b.name AS business_name, b.currency, b.timezone, b.locale, b.business_type, b.default_tax_rate, b.tax_number,
              b.selling_price_tax_type, b.stock_accounting_method, b.default_low_stock_threshold,
              b.feature_pos_offline, b.feature_multi_currency_sales, b.feature_barcode_scanning, b.feature_service_repair, b.financial_year_start_month
       FROM users u LEFT JOIN businesses b ON b.id=u.business_id WHERE u.id=?`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'User not found' });
    res.json(publicUser(rows[0]));
  } catch (err) { next(err); }
}

module.exports = { register, onboardBusiness, login, logout, me };
