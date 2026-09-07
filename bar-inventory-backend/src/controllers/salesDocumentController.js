const { query, getClient } = require('../config/db');
const JournalEngine = require('../models/JournalEngine');
const { sendLowStockAlert } = require('../utils/notifications');
const { calculateSalesLine, calculateTotals, badRequest } = require('../utils/salesMath');
const { getBusinessId } = require('../utils/tenant');

const TYPES = ['quotation', 'sales_order', 'proforma', 'invoice', 'pos', 'credit_note'];
const NON_POSTING = ['quotation', 'sales_order', 'proforma'];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDate(value) {
  const date = String(value || today()).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date).toISOString().slice(0, 10) !== date) {
    throw badRequest('A valid document date is required');
  }
  return date;
}

async function loadDocument(client, id, businessId = 1) {
  const { rows } = await client.query(
    `SELECT d.*, c.name AS customer_name, l.name AS location_name
     FROM sales_documents d
     LEFT JOIN customers c ON c.id=d.customer_id
     LEFT JOIN locations l ON l.id=d.location_id
     WHERE d.id=? AND d.business_id=?`,
    [id, businessId]
  );
  if (!rows.length) return null;
  const { rows: items } = await client.query('SELECT i.* FROM sales_document_items i JOIN sales_documents d ON d.id=i.document_id WHERE i.document_id=? AND d.business_id=? ORDER BY i.id', [id, businessId]);
  const { rows: payments } = await client.query('SELECT p.* FROM sales_document_payments p JOIN sales_documents d ON d.id=p.document_id WHERE p.document_id=? AND d.business_id=? ORDER BY p.created_at DESC', [id, businessId]);
  return { ...rows[0], items, payments };
}

function validateHeader(body) {
  const type = String(body.type || '').trim();
  if (!TYPES.includes(type)) throw badRequest('Invalid sales document type');
  const locationId = Number(body.locationId ?? body.location_id);
  if (!Number.isInteger(locationId) || locationId <= 0) throw badRequest('Business location is required');
  const customerId = body.customerId || body.customer_id ? Number(body.customerId ?? body.customer_id) : null;
  if (customerId && (!Number.isInteger(customerId) || customerId <= 0)) throw badRequest('Customer is invalid');
  if (type !== 'pos' && type !== 'credit_note' && !customerId) throw badRequest('Customer is required');
  const referenceInvoiceId = body.referenceInvoiceId || body.reference_invoice_id ? Number(body.referenceInvoiceId ?? body.reference_invoice_id) : null;
  if (type === 'credit_note' && !referenceInvoiceId) throw badRequest('Credit notes must reference an invoice');
  return {
    type,
    customerId,
    referenceNo: String(body.referenceNo ?? body.reference_no ?? '').trim() || null,
    documentDate: normalizeDate(body.date ?? body.documentDate ?? body.document_date),
    locationId,
    status: String(body.status || (NON_POSTING.includes(type) ? 'draft' : 'issued')).trim(),
    convertedFromId: body.convertedFromId || body.converted_from_id ? Number(body.convertedFromId ?? body.converted_from_id) : null,
    referenceInvoiceId,
    notes: String(body.notes || '').trim() || null,
    payment: body.payment || null,
  };
}

async function validateAndLoadItems(client, header, bodyItems, businessId = 1) {
  if (!Array.isArray(bodyItems) || !bodyItems.length) throw badRequest('Document must include at least one line item');
  const seen = new Set();
  const lines = [];
  for (const raw of bodyItems) {
    const itemId = Number(raw.itemId ?? raw.item_id);
    if (!Number.isInteger(itemId) || itemId <= 0 || seen.has(itemId)) throw badRequest('Each product must appear once with a valid ID');
    seen.add(itemId);
    const { rows: products } = await client.query('SELECT * FROM inventory_items WHERE id=? AND business_id=? FOR UPDATE', [itemId, businessId]);
    if (!products.length) throw badRequest('Product no longer exists');
    const product = products[0];
    if (Number(product.location_id) !== Number(header.locationId)) throw badRequest(`${product.name} belongs to another business location`);
    const calc = calculateSalesLine({ ...raw, unitPrice: raw.unitPrice ?? product.price });
    if (!NON_POSTING.includes(header.type) && header.type !== 'credit_note' && Number(product.stock) < calc.quantity) {
      throw badRequest(`Insufficient stock for ${product.name}: have ${product.stock}, need ${calc.quantity}`);
    }
    lines.push({ ...calc, itemId, itemName: product.name, product });
  }
  return lines;
}

async function list(req, res, next) {
  try {
    const params = [getBusinessId(req)];
    let sql = `SELECT d.*, c.name AS customer_name, l.name AS location_name
               FROM sales_documents d
               LEFT JOIN customers c ON c.id=d.customer_id
               LEFT JOIN locations l ON l.id=d.location_id
               WHERE d.business_id=?`;
    if (req.query.type) { params.push(req.query.type); sql += ' AND d.type=?'; }
    if (req.query.locationId) { params.push(req.query.locationId); sql += ' AND d.location_id=?'; }
    sql += ' ORDER BY d.created_at DESC LIMIT 200';
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) { next(err); }
}

async function getOne(req, res, next) {
  const client = await getClient();
  try {
    const doc = await loadDocument(client, req.params.id, getBusinessId(req));
    if (!doc) return res.status(404).json({ message: 'Sales document not found' });
    res.json(doc);
  } catch (err) { next(err); }
  finally { client.release(); }
}

async function create(req, res, next) {
  let client;
  try {
    const header = validateHeader(req.body);
    client = await getClient();
    await client.query('BEGIN');
    await createDocument(client, header, req.body.items, req.user?.id || null, getBusinessId(req));
    const doc = await loadDocument(client, client.lastDocumentId, getBusinessId(req));
    await client.query('COMMIT');
    res.status(201).json(doc);
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    next(err);
  } finally { client?.release(); }
}

async function createDocument(client, header, rawItems, userId, businessId = 1) {
  const location = await client.query('SELECT id FROM locations WHERE id=? AND business_id=?', [header.locationId, businessId]);
  if (!location.rows.length) throw badRequest('Business location does not exist');
  if (header.customerId) {
    const customer = await client.query('SELECT id, active FROM customers WHERE id=? AND business_id=?', [header.customerId, businessId]);
    if (!customer.rows.length) throw badRequest('Customer does not exist');
    if (!customer.rows[0].active) throw badRequest('This customer account is inactive');
  }
  if (header.referenceInvoiceId) {
    const ref = await client.query("SELECT id, type, status FROM sales_documents WHERE id=? AND business_id=? AND type IN ('invoice','pos')", [header.referenceInvoiceId, businessId]);
    if (!ref.rows.length) throw badRequest('Credit note reference invoice does not exist');
  }
  const lines = await validateAndLoadItems(client, header, rawItems, businessId);
  if (header.type === 'credit_note') await validateCreditNoteQuantities(client, header.referenceInvoiceId, lines);
  const totals = calculateTotals(lines);
  const paidAmount = Number(header.payment?.amount || 0);
  const openingPaid = header.type === 'invoice' || header.type === 'pos' ? Math.min(paidAmount, totals.total) : 0;
  const balanceDue = header.type === 'invoice' || header.type === 'pos' ? Number((totals.total - openingPaid).toFixed(2)) : 0;
  const status = header.type === 'invoice' || header.type === 'pos'
    ? (balanceDue <= 0 ? 'paid' : openingPaid > 0 ? 'partial' : header.status)
    : header.status;

  const result = await client.query(
    `INSERT INTO sales_documents
     (business_id,type,status,customer_id,reference_no,document_date,location_id,converted_from_id,reference_invoice_id,subtotal,discount_total,tax_total,total,paid_amount,balance_due,notes,created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [businessId, header.type, status, header.customerId, header.referenceNo, header.documentDate, header.locationId, header.convertedFromId, header.referenceInvoiceId, totals.subtotal, totals.discountTotal, totals.taxTotal, totals.total, openingPaid, balanceDue, header.notes, userId]
  );
  const documentId = result.insertId;
  client.lastDocumentId = documentId;

  for (const line of lines) {
    await client.query(
      `INSERT INTO sales_document_items
       (document_id,item_id,item_name,quantity,unit_price,discount_percent,discount_amount,tax_percent,tax_amount,subtotal,line_total)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [documentId, line.itemId, line.itemName, line.quantity, line.unitPrice, line.discountPercent, line.discountAmount, line.taxPercent, line.taxAmount, line.subtotal, line.lineTotal]
    );
  }

  if (header.type === 'invoice' || header.type === 'pos') await postInvoice(client, documentId, header, lines, totals, openingPaid, userId, businessId);
  if (header.type === 'credit_note') await postCreditNote(client, documentId, header, lines, totals, userId, businessId);
}

async function validateCreditNoteQuantities(client, invoiceId, lines) {
  for (const line of lines) {
    const invoiced = await client.query(
      'SELECT COALESCE(SUM(quantity),0) AS qty FROM sales_document_items WHERE document_id=? AND item_id=?',
      [invoiceId, line.itemId]
    );
    if (Number(invoiced.rows[0].qty) <= 0) throw badRequest(`${line.itemName} is not on the referenced invoice`);
    const credited = await client.query(
      `SELECT COALESCE(SUM(ci.quantity),0) AS qty
       FROM sales_documents cn
       JOIN sales_document_items ci ON ci.document_id=cn.id
       WHERE cn.reference_invoice_id=? AND cn.type='credit_note' AND ci.item_id=?`,
      [invoiceId, line.itemId]
    );
    if (Number(credited.rows[0].qty) + line.quantity > Number(invoiced.rows[0].qty)) {
      throw badRequest(`${line.itemName} credit quantity exceeds the referenced invoice quantity`);
    }
  }
}

async function postInvoice(client, documentId, header, lines, totals, paidAmount, userId, businessId = 1) {
  const paymentMethod = paidAmount >= totals.total ? String(header.payment?.method || 'cash') : 'credit';
  const { insertId: saleId } = await client.query(
    'INSERT INTO sales (business_id,total,created_by,notes,payment_method,location_id,customer_id) VALUES (?,?,?,?,?,?,?)',
    [businessId, totals.total, userId, header.notes || `${header.type === 'pos' ? 'POS' : 'Invoice'} #${documentId}`, paymentMethod, header.locationId, header.customerId]
  );
  let totalCogs = 0;
  const updatedItems = [];
  for (const line of lines) {
    await client.query('INSERT INTO sale_items (sale_id,item_id,item_name,quantity,unit_price) VALUES (?,?,?,?,?)', [saleId, line.itemId, line.itemName, line.quantity, line.unitPrice]);
    await client.query('UPDATE inventory_items SET stock=stock-?,sold=sold+?,updated_at=NOW() WHERE id=?', [line.quantity, line.quantity, line.itemId]);
    totalCogs += Number(line.product.cost || 0) * line.quantity;
    const { rows: [updated] } = await client.query('SELECT * FROM inventory_items WHERE id=?', [line.itemId]);
    updatedItems.push(updated);
    await client.query(
      'INSERT INTO inventory_stock_log (item_id, change_type, qty_change, before_stock, after_stock, user_id, note) VALUES (?,?,?,?,?,?,?)',
      [line.itemId, 'sale', -line.quantity, line.product.stock, updated.stock, userId, `Sales document #${documentId}`]
    );
  }
  if (header.customerId && totals.total > paidAmount) await client.query('UPDATE customers SET balance=balance+? WHERE id=?', [Number((totals.total - paidAmount).toFixed(2)), header.customerId]);
  if (paidAmount > 0) {
    await client.query('INSERT INTO sales_document_payments (document_id,amount,method,reference_no,notes,created_by) VALUES (?,?,?,?,?,?)', [documentId, paidAmount, header.payment?.method || 'cash', header.payment?.referenceNo || null, 'Opening payment', userId]);
  }
  const journalType = paymentMethod === 'credit' ? 'CREDIT_SALE' : paymentMethod === 'mpesa' ? 'MPESA_SALE' : paymentMethod === 'bank' ? 'BANK_SALE' : 'CASH_SALE';
  await JournalEngine.generate(journalType, totals.total, `Sales document #${documentId}`, header.notes || 'Sales invoice', client, { cogsAmount: totalCogs, postingDate: header.documentDate });
  await client.query('UPDATE sales_documents SET sale_id=? WHERE id=?', [saleId, documentId]);
  client.updatedItems = updatedItems;
}

async function postCreditNote(client, documentId, header, lines, totals, userId, businessId = 1) {
  for (const line of lines) {
    await client.query('UPDATE inventory_items SET stock=stock+?,sold=GREATEST(sold-?,0),updated_at=NOW() WHERE id=?', [line.quantity, line.quantity, line.itemId]);
    const { rows: [updated] } = await client.query('SELECT * FROM inventory_items WHERE id=?', [line.itemId]);
    await client.query(
      'INSERT INTO inventory_stock_log (item_id, change_type, qty_change, before_stock, after_stock, user_id, note) VALUES (?,?,?,?,?,?,?)',
      [line.itemId, 'adjustment', line.quantity, line.product.stock, updated.stock, userId, `Credit note #${documentId} for invoice #${header.referenceInvoiceId}`]
    );
  }
  const invoice = await client.query('SELECT customer_id FROM sales_documents WHERE id=?', [header.referenceInvoiceId]);
  const customerId = invoice.rows[0]?.customer_id;
  if (customerId) await client.query('UPDATE customers SET balance=GREATEST(balance-?,0) WHERE id=?', [totals.total, customerId]);
  await client.query('UPDATE sales_documents SET status=? WHERE id=?', ['issued', documentId]);
}

async function convert(req, res, next) {
  const targetType = String(req.body.targetType || '');
  if (!['sales_order', 'proforma', 'invoice'].includes(targetType)) return res.status(400).json({ message: 'Invalid conversion target' });
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const source = await loadDocument(client, req.params.id, getBusinessId(req));
    if (!source) throw badRequest('Source document does not exist');
    const header = validateHeader({ ...source, type: targetType, convertedFromId: source.id, status: targetType === 'invoice' ? 'issued' : 'draft', date: today() });
    await createDocument(client, header, source.items.map(line => ({ itemId: line.item_id, quantity: line.quantity, unitPrice: line.unit_price, discountPercent: line.discount_percent, taxPercent: line.tax_percent })), req.user?.id || null, getBusinessId(req));
    await client.query('UPDATE sales_documents SET status=? WHERE id=?', [`converted_to_${targetType}`, source.id]);
    const created = await loadDocument(client, client.lastDocumentId, getBusinessId(req));
    await client.query('COMMIT');
    res.status(201).json(created);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
}

async function addPayment(req, res, next) {
  const client = await getClient();
  try {
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: 'Payment amount must be greater than zero' });
    await client.query('BEGIN');
    const { rows: docs } = await client.query("SELECT * FROM sales_documents WHERE id=? AND business_id=? AND type IN ('invoice','pos') FOR UPDATE", [req.params.id, getBusinessId(req)]);
    if (!docs.length) throw badRequest('Payments can only be recorded against invoices');
    const doc = docs[0];
    const applied = Math.min(amount, Number(doc.balance_due));
    await client.query('INSERT INTO sales_document_payments (document_id,amount,method,reference_no,notes,created_by) VALUES (?,?,?,?,?,?)', [doc.id, applied, req.body.method || 'cash', req.body.referenceNo || null, req.body.notes || null, req.user?.id || null]);
    if (doc.customer_id) await client.query('UPDATE customers SET balance=GREATEST(balance-?,0) WHERE id=?', [applied, doc.customer_id]);
    const paid = Number(doc.paid_amount) + applied;
    const due = Number((Number(doc.total) - paid).toFixed(2));
    await client.query('UPDATE sales_documents SET paid_amount=?, balance_due=?, status=? WHERE id=?', [paid, due, due <= 0 ? 'paid' : 'partial', doc.id]);
    await JournalEngine.generate('DEBT_PAYMENT', applied, `Invoice #${doc.id}`, req.body.notes || 'Invoice payment', client, { settingKey: req.body.method === 'mpesa' ? 'payment_mobile' : req.body.method === 'bank' ? 'payment_bank' : 'payment_cash' });
    const fresh = await loadDocument(client, doc.id, getBusinessId(req));
    await client.query('COMMIT');
    res.status(201).json(fresh);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
}

module.exports = { list, getOne, create, convert, addPayment };
