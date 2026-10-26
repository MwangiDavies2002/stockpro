const { query } = require('../config/db');
const { getBusinessId } = require('../utils/tenant');
const { validateSaleSizeGroups } = require('../utils/stockReport');

function parseSettings(value) {
  try { return typeof value === 'string' ? JSON.parse(value) : value || {}; } catch { return {}; }
}

function invalid(message) { const error = new Error(message); error.status = 400; throw error; }

function profileFrom(row, settings) {
  const rawDate = row.start_date;
  const startDate = rawDate instanceof Date ? rawDate.toISOString().slice(0, 10) : rawDate ? String(rawDate).slice(0, 10) : '';
  return {
    ...settings,
    businessName: row.name || '',
    startDate,
    currency: row.currency || 'KES',
    logoUrl: row.logo_url || '',
    timezone: row.timezone || 'Africa/Nairobi',
    stockAccountingMethod: row.stock_accounting_method || 'weighted_average',
    financialYearStartMonth: Number(row.financial_year_start_month || 1),
  };
}

exports.get = async (req, res, next) => {
  try {
    const { rows } = await query('SELECT name,start_date,currency,logo_url,timezone,stock_accounting_method,financial_year_start_month,settings_json FROM businesses WHERE id=?', [getBusinessId(req)]);
    if (!rows.length) return res.status(404).json({ message: 'Business not found' });
    res.json(profileFrom(rows[0], parseSettings(rows[0].settings_json)));
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const businessId = getBusinessId(req);
    const body = req.body || {};
    const { rows } = await query('SELECT name,start_date,currency,logo_url,timezone,stock_accounting_method,financial_year_start_month,settings_json FROM businesses WHERE id=?', [businessId]);
    if (!rows.length) return res.status(404).json({ message: 'Business not found' });
    const current = rows[0];
    const stored = parseSettings(current.settings_json);
    const name = String(body.businessName ?? current.name).trim();
    const currency = String(body.currency ?? current.currency).trim().toUpperCase();
    const timezone = String(body.timezone ?? current.timezone).trim();
    const stockMethod = String(body.stockAccountingMethod ?? current.stock_accounting_method);
    const month = Number(body.financialYearStartMonth ?? current.financial_year_start_month);
    const startDate = body.startDate === undefined ? current.start_date : String(body.startDate || '').trim() || null;
    const logoUrl = body.logoUrl === undefined ? current.logo_url : String(body.logoUrl || '');

    if (!name || name.length > 180) invalid('Business name is required and must be 180 characters or fewer');
    if (!/^[A-Z]{3}$/.test(currency)) invalid('Choose a valid three-letter currency code');
    if (!timezone || timezone.length > 80) invalid('Enter a valid time zone');
    if (!['fifo', 'lifo', 'weighted_average'].includes(stockMethod)) invalid('Choose a valid stock accounting method');
    if (!Number.isInteger(month) || month < 1 || month > 12) invalid('Financial year start month must be between 1 and 12');
    if (startDate && (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || Number.isNaN(Date.parse(`${startDate}T00:00:00Z`)))) invalid('Enter a valid business start date');
    const validLogo = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(logoUrl) || /^https?:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:\/[^\s]*)?$/.test(logoUrl) || /^\/(?!\/)[A-Za-z0-9_./-]*$/.test(logoUrl);
    if (logoUrl.length > 2800000 || (logoUrl && !validLogo)) invalid('Choose a PNG, JPG or WebP logo under 2MB');

    const editDays = Number(body.transactionEditDays ?? stored.transactionEditDays ?? 30);
    const profit = Number(body.defaultProfitPercent ?? stored.defaultProfitPercent ?? 0);
    const currencyPrecision = Number(body.currencyPrecision ?? stored.currencyPrecision ?? 2);
    const quantityPrecision = Number(body.quantityPrecision ?? stored.quantityPrecision ?? 2);
    if (!Number.isInteger(editDays) || editDays < 0 || editDays > 3650) invalid('Transaction edit days must be from 0 to 3650');
    if (!Number.isFinite(profit) || profit < 0 || profit > 1000) invalid('Default profit percent must be from 0 to 1000');
    if (!Number.isInteger(currencyPrecision) || currencyPrecision < 0 || currencyPrecision > 4) invalid('Currency precision must be from 0 to 4');
    if (!Number.isInteger(quantityPrecision) || quantityPrecision < 0 || quantityPrecision > 6) invalid('Quantity precision must be from 0 to 6');
    if (!['before', 'after'].includes(String(body.currencySymbolPlacement ?? stored.currencySymbolPlacement ?? 'before'))) invalid('Choose a valid currency symbol placement');
    if (!['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'].includes(String(body.dateFormat ?? stored.dateFormat ?? 'MM/DD/YYYY'))) invalid('Choose a supported date format');
    if (!['12', '24'].includes(String(body.timeFormat ?? stored.timeFormat ?? '24'))) invalid('Choose a supported time format');
    if (!['single', 'multi'].includes(String(body.currencySetup ?? stored.currencySetup ?? 'single'))) invalid('Choose a supported currency setup');
    const enableProductExpiry = body.enableProductExpiry ?? stored.enableProductExpiry ?? false;
    if (typeof enableProductExpiry !== 'boolean') invalid('Product expiry setting must be enabled or disabled');
    if ((body.skuPrefix ?? stored.skuPrefix) !== undefined && String(body.skuPrefix ?? stored.skuPrefix).length > 20) invalid('SKU prefix must be 20 characters or fewer');
    for (const key of ['enableBrands','enableCategories','enableSubCategories','enablePriceTaxInfo','enableSubUnits','enableRacks','enableRow','enablePosition','enableWarranty','requireProductImage']) {
      if (body[key] !== undefined && typeof body[key] !== 'boolean') invalid(`${key} must be enabled or disabled`);
    }
    const posBooleanKeys = ['disableMultiplePay','disableDraft','disableExpressCheckout','hideProductSuggestions','hideRecentTransactions','disableDiscount','disableOrderTax','subtotalEditable','disableSuspendSale','enableTransactionDate','enableServiceStaffInProductLine','requireServiceStaff','disableCreditSaleButton','enableWeighingScale','showInvoiceScheme','showInvoiceLayout','showPricingOnSuggestion','printInvoiceOnSuspend'];
    for (const key of posBooleanKeys) {
      if (body[key] !== undefined && typeof body[key] !== 'boolean') invalid(`${key} must be enabled or disabled`);
    }
    if (body.posShortcuts !== undefined) {
      if (!body.posShortcuts || typeof body.posShortcuts !== 'object' || Array.isArray(body.posShortcuts)) invalid('POS shortcuts must be an object');
      const validShortcutKeys = new Set(['expressCheckout','payCheckout','draft','cancel','quantity','weighingScale','editDiscount','editOrderTax','addPaymentRow','finalizePayment','addNewProduct']);
      const assignedShortcuts = new Set();
      for (const [key, shortcut] of Object.entries(body.posShortcuts)) {
        if (!validShortcutKeys.has(key)) invalid(`Unknown POS shortcut: ${key}`);
        if (typeof shortcut !== 'string' || shortcut.length > 40 || (shortcut && !/^(?:(?:ctrl|alt|shift|meta)\+)*(?:[a-z0-9]|f(?:[1-9]|1[0-2])|enter|esc|space|up|down|left|right|home|end|pageup|pagedown|backspace|tab)$/i.test(shortcut))) invalid(`Invalid keyboard shortcut for ${key}`);
        const normalized = shortcut.toLowerCase();
        if (normalized && assignedShortcuts.has(normalized)) invalid('Each POS keyboard shortcut must be unique');
        if (normalized) assignedShortcuts.add(normalized);
      }
    }

    const config = { ...body };
    for (const key of ['businessName','startDate','currency','logoUrl','timezone','stockAccountingMethod','financialYearStartMonth']) delete config[key];
    if (body.saleSizeGroups !== undefined) config.saleSizeGroups = validateSaleSizeGroups(body.saleSizeGroups);
    config.transactionEditDays = editDays;
    config.defaultProfitPercent = profit;
    config.currencyPrecision = currencyPrecision;
    config.quantityPrecision = quantityPrecision;
    config.enableProductExpiry = enableProductExpiry;
    const nextSettings = { ...stored, ...config };
    await query(
      'UPDATE businesses SET name=?,start_date=?,currency=?,logo_url=?,timezone=?,stock_accounting_method=?,financial_year_start_month=?,settings_json=? WHERE id=?',
      [name, startDate, currency, logoUrl || null, timezone, stockMethod, month, JSON.stringify(nextSettings), businessId]
    );
    const saved = profileFrom({ name, start_date: startDate, currency, logo_url: logoUrl, timezone, stock_accounting_method: stockMethod, financial_year_start_month: month }, nextSettings);
    res.json({ message: 'Business settings saved', settings: saved });
  } catch (err) { next(err); }
};
