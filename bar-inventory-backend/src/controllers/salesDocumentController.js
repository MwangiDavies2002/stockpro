const { query, getClient } = require('../config/db');
const JournalEngine = require('../models/JournalEngine');
const { sendLowStockAlert } = require('../utils/notifications');
const { calculateSalesLine, calculateTotals, badRequest } = require('../utils/salesMath');
const { getBusinessId } = require('../utils/tenant');
const { once } = require('../utils/idempotency');

const policy=require('../utils/salesDocumentPolicy');
const TYPES=policy.types;
const NON_POSTING = ['quotation', 'sales_order', 'proforma'];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDate(value){return policy.date(value,today());}
const json=value=>typeof value==='string'?JSON.parse(value):value;
function seller(row={}){return{name:row.name||'Business',currency:row.currency||'KES',timezone:row.timezone||'Africa/Nairobi',phone:row.contact_number||'',address:[row.city,row.state,row.country].filter(Boolean).join(', ')};}
async function activity(client,id,businessId,userId,action,details={}){await client.query('INSERT INTO sales_document_events(business_id,document_id,user_id,action,details_json) VALUES (?,?,?,?,?)',[businessId,id,userId,action,JSON.stringify(details)]);}
async function loadDocument(client,id,businessId=1){
 const {rows}=await client.query(`SELECT d.*,c.name customer_name,c.phone customer_phone,l.name location_name,u.name created_by_name FROM sales_documents d LEFT JOIN customers c ON c.id=d.customer_id AND c.business_id=d.business_id LEFT JOIN locations l ON l.id=d.location_id AND l.business_id=d.business_id LEFT JOIN users u ON u.id=d.created_by AND u.business_id=d.business_id WHERE d.id=? AND d.business_id=?`,[id,businessId]);
 if(!rows.length)return null;
 const doc=rows[0];
 const {rows:items}=await client.query('SELECT i.* FROM sales_document_items i JOIN sales_documents d ON d.id=i.document_id WHERE i.document_id=? AND d.business_id=? ORDER BY i.id',[id,businessId]);
 const {rows:payments}=await client.query('SELECT p.*,u.name added_by FROM sales_document_payments p JOIN sales_documents d ON d.id=p.document_id LEFT JOIN users u ON u.id=p.created_by AND u.business_id=d.business_id WHERE p.document_id=? AND d.business_id=? ORDER BY p.created_at DESC,p.id DESC',[id,businessId]);
 const {rows:events}=await client.query('SELECT e.*,u.name added_by FROM sales_document_events e LEFT JOIN users u ON u.id=e.user_id AND u.business_id=e.business_id WHERE e.document_id=? AND e.business_id=? ORDER BY e.id DESC',[id,businessId]);
 const {rows:links}=await client.query('SELECT id,type,status,converted_from_id FROM sales_documents WHERE business_id=? AND (id=? OR converted_from_id=?) ORDER BY id',[businessId,doc.converted_from_id||0,doc.id]);
 const business=doc.seller_snapshot?json(doc.seller_snapshot):seller((await client.query('SELECT * FROM businesses WHERE id=?',[businessId])).rows[0]);
 const customer=doc.customer_snapshot?json(doc.customer_snapshot):{name:doc.customer_name||'Walk-in customer',phone:doc.customer_phone||''};
 return{...doc,customer_name:customer.name,customer_phone:customer.phone,customer,seller:business,items,payments,activity:events.map(e=>({...e,details:json(e.details_json)||{}})),related:links};
}
function validateHeader(body){
 const type=String(body.type||'').trim();if(!TYPES.includes(type))throw badRequest('Invalid sales document type');
 const locationId=Number(body.locationId??body.location_id);if(!Number.isInteger(locationId)||locationId<1)throw badRequest('Business location is required');
 const customerId=body.customerId||body.customer_id?Number(body.customerId??body.customer_id):null;
 if(customerId&&(!Number.isInteger(customerId)||customerId<1))throw badRequest('Customer is invalid');
 const referenceInvoiceId=body.referenceInvoiceId||body.reference_invoice_id?Number(body.referenceInvoiceId??body.reference_invoice_id):null;
 if(type==='credit_note'&&!referenceInvoiceId)throw badRequest('Credit notes must reference an invoice');
 const documentDate=normalizeDate(body.date??body.document_date),dueDate=policy.date(body.dueDate??body.due_date),validUntil=policy.date(body.validUntil??body.valid_until);
 if(dueDate&&dueDate<documentDate||validUntil&&validUntil<documentDate)throw badRequest('Due and validity dates must be on or after the document date');
 const text=(value,max)=>{const v=String(value||'').trim();if(v.length>max)throw badRequest('Document text is too long');return v||null;};
 const payments=Array.isArray(body.payments)?body.payments:body.payment?[body.payment]:[];
 if(payments.length>10)throw badRequest('A sale can have at most 10 payment rows');
 if(payments.some(row=>!row||typeof row!=='object'||Array.isArray(row)))throw badRequest('Each payment row must include a payment method and amount');
 return{type,customerId,locationId,documentDate,dueDate,validUntil,referenceNo:text(body.referenceNo??body.reference_no,100),status:policy.status(type,body.status),convertedFromId:Number(body.convertedFromId??body.converted_from_id)||null,referenceInvoiceId,notes:text(body.notes,4000),staffNotes:text(body.staffNotes??body.staff_notes,4000),terms:text(body.terms,4000),payments,payment:payments[0]||null};
}

async function validateAndLoadItems(client, header, bodyItems, businessId = 1) {
  if (!Array.isArray(bodyItems) || !bodyItems.length) throw badRequest('Document must include at least one line item');
  const seen = new Set();
  const lines = [];
  for (const raw of [...bodyItems].sort((a,b)=>Number(a.itemId??a.item_id)-Number(b.itemId??b.item_id))) {
    const itemId = Number(raw.itemId ?? raw.item_id);
    if (!Number.isInteger(itemId) || itemId <= 0 || seen.has(itemId)) throw badRequest('Each product must appear once with a valid ID');
    seen.add(itemId);
    const { rows: products } = await client.query('SELECT * FROM inventory_items WHERE id=? AND business_id=? FOR UPDATE', [itemId, businessId]);
    if (!products.length) throw badRequest('Product no longer exists');
    const product = products[0];
    if (header.type !== 'credit_note' && product.not_for_selling) throw badRequest(`${product.name} is marked not for selling`);
    if (Number(product.location_id) !== Number(header.locationId)) throw badRequest(`${product.name} belongs to another business location`);
    const unitPrice=Number(raw.unitPrice??product.price);
    let discountPercent=raw.discountPercent;
    if(header.type==='pos'&&discountPercent===undefined){
      const {rows:rules}=await client.query(`SELECT * FROM discounts WHERE business_id=? AND location_id=? AND active=TRUE AND ((applies_to='product' AND product_id=?) OR (applies_to='category' AND category_id=?) OR (applies_to='customer' AND customer_id=?))`,[businessId,header.locationId,itemId,product.category_id||null,header.customerId]);
      discountPercent=Math.max(0,...rules.map(rule=>rule.discount_type==='percent'?Number(rule.value):Math.min(100,unitPrice>0?Number(rule.value)/unitPrice*100:0)));
    }
    const calc = calculateSalesLine({ ...raw, unitPrice, discountPercent:discountPercent??raw.discount_percent??0 });
    if (policy.posting(header) && Number(product.stock) < calc.quantity) {
      throw badRequest(`Insufficient stock for ${product.name}: have ${product.stock}, need ${calc.quantity}`);
    }
    const original=header.lineSnapshots?.find(l=>Number(l.item_id)===itemId);
    lines.push({ ...calc, itemId, itemName:original?.item_name||product.name,sku:original?.sku??product.sku,unit:original?.unit??product.unit,product });
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
    sql += ' ORDER BY d.created_at DESC,d.id DESC';
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
    if(header.convertedFromId)throw badRequest('Use the document conversion action to link documents');
    client = await getClient();
    await client.query('BEGIN');
    const doc = await once(client,getBusinessId(req),'sales-document',req.body.requestId,async()=>{
      await createDocument(client, header, req.body.items, req.user?.id || null, getBusinessId(req));
      return loadDocument(client, client.lastDocumentId, getBusinessId(req));
    });
    await client.query('COMMIT');
    res.status(201).json(doc);
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    next(err);
  } finally { client?.release(); }
}

async function createDocument(client,header,rawItems,userId,businessId=1,updateId=null){
 if(userId)await client.query('SELECT id FROM users WHERE id=? AND business_id=? FOR UPDATE',[userId,businessId]);
 if(!(await client.query('SELECT id FROM locations WHERE id=? AND business_id=?',[header.locationId,businessId])).rows.length)throw badRequest('Business location does not exist');
 let customer=null;
 if(header.customerId){customer=(await client.query('SELECT * FROM customers WHERE id=? AND business_id=? FOR UPDATE',[header.customerId,businessId])).rows[0];if(!customer||!customer.active)throw badRequest('Choose an active customer');}
 if(header.referenceInvoiceId&&!(await client.query("SELECT id FROM sales_documents WHERE id=? AND business_id=? AND type IN ('invoice','pos') AND status<>'draft'",[header.referenceInvoiceId,businessId])).rows.length)throw badRequest('Credit note must reference an issued invoice');
 const lines=await validateAndLoadItems(client,header,rawItems,businessId);
 if(header.type==='credit_note')await validateCreditNoteQuantities(client,header.referenceInvoiceId,lines);
 const totals=calculateTotals(lines),posting=policy.posting(header),payments=(header.payments||[]).map(row=>({amount:policy.payment(row.amount,totals.total),method:policy.method(row.method),referenceNo:String(row.referenceNo||'').trim().slice(0,100)||null}));
 const paid=policy.payment(payments.reduce((sum,row)=>sum+row.amount,0),totals.total);
 if(payments.length>1&&paid!==totals.total)throw badRequest('Split payments must add up to the full sale total');
 if(!posting&&paid>0)throw badRequest('Record payments after issuing the invoice');
 if(paid>0&&!payments.length)policy.method(header.payment?.method);
 header.payments=payments;
 header.payment=payments[0]||header.payment;
 const due=posting?Number((totals.total-paid).toFixed(2)):0;
 if(due>0&&(!customer||Number(customer.balance)+due>Number(customer.credit_limit)))throw badRequest('Customer credit limit would be exceeded. Record payment or update the customer credit limit.');
 const status=posting?(due<=0?'paid':paid>0?'partial':'issued'):header.status;
 const business=(await client.query('SELECT * FROM businesses WHERE id=?',[businessId])).rows[0];
 const snapshots=header.snapshots||{customer:{name:customer?.name||'Walk-in customer',phone:customer?.phone||'',address:customer?.address||''},seller:seller(business)};
 const values=[header.type,status,header.customerId,header.referenceNo,header.documentDate,header.locationId,header.convertedFromId,header.referenceInvoiceId,totals.subtotal,totals.discountTotal,totals.taxTotal,totals.total,posting?paid:0,due,header.notes,header.dueDate,header.validUntil,header.terms,header.staffNotes,JSON.stringify(snapshots.customer),JSON.stringify(snapshots.seller)];
 const fields=['type','status','customer_id','reference_no','document_date','location_id','converted_from_id','reference_invoice_id','subtotal','discount_total','tax_total','total','paid_amount','balance_due','notes','due_date','valid_until','terms','staff_notes','customer_snapshot','seller_snapshot'];
 let documentId=updateId;
 if(updateId){await client.query(`UPDATE sales_documents SET ${fields.map(k=>k+'=?').join(',')} WHERE id=? AND business_id=?`,[...values,updateId,businessId]);await client.query('DELETE FROM sales_document_items WHERE document_id=?',[updateId]);}
 else{documentId=(await client.query(`INSERT INTO sales_documents(business_id,created_by,${fields.join(',')}) VALUES (${Array(values.length+2).fill('?').join(',')})`,[businessId,userId,...values])).insertId;}
 client.lastDocumentId=documentId;
 for(const line of lines)await client.query('INSERT INTO sales_document_items(document_id,item_id,item_name,quantity,unit_price,discount_percent,discount_amount,tax_percent,tax_amount,subtotal,line_total,unit_cost,sku,unit) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[documentId,line.itemId,line.itemName,line.quantity,line.unitPrice,line.discountPercent,line.discountAmount,line.taxPercent,line.taxAmount,line.subtotal,line.lineTotal,header.type==='credit_note'?line.originalCost:Number(line.product.cost),line.sku||null,line.unit||null]);
 if(posting)await postInvoice(client,documentId,header,lines,totals,paid,userId,businessId);
 if(header.type==='credit_note')await postCreditNote(client,documentId,header,lines,totals,userId,businessId);
 if(posting||header.type==='credit_note')await require('../services/etims').queueDocument(client,documentId,businessId);
 await activity(client,documentId,businessId,userId,updateId?'updated':posting?'issued':'created',{status,total:totals.total});
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
    const { rows: [cost] } = await client.query('SELECT CASE WHEN COUNT(unit_cost)=COUNT(*) THEN SUM(unit_cost*quantity)/SUM(quantity) ELSE NULL END AS original_cost FROM sales_document_items WHERE document_id=? AND item_id=?', [invoiceId, line.itemId]);
    line.originalCost = cost.original_cost;
  }
}

async function postInvoice(client, documentId, header, lines, totals, paidAmount, userId, businessId = 1) {
  await require('../utils/accountingDefaults').ensureSalesAccountingMappings(client,totals.taxTotal>0);
  const methods=[...new Set((header.payments||[]).map(payment=>payment.method))];
  const paymentMethod = paidAmount >= totals.total ? (methods.length>1?'mixed':String(header.payment?.method||'cash')) : 'credit';
  const { insertId: saleId } = await client.query(
    'INSERT INTO sales (business_id,total,created_by,notes,payment_method,location_id,customer_id) VALUES (?,?,?,?,?,?,?)',
    [businessId, totals.total, userId, header.notes || `${header.type === 'pos' ? 'POS' : 'Invoice'} #${documentId}`, paymentMethod, header.locationId, header.customerId]
  );
  let totalCogs = 0;
  const updatedItems = [];
  for (const line of lines) {
    await client.query('INSERT INTO sale_items (sale_id,item_id,item_name,quantity,unit_price,unit_cost,net_revenue) VALUES (?,?,?,?,?,?,?)', [saleId, line.itemId, line.itemName, line.quantity, line.unitPrice, line.product.cost, line.subtotal]);
    await client.query('UPDATE inventory_items SET stock=stock-?,sold=sold+?,updated_at=NOW() WHERE id=? AND business_id=?', [line.quantity, line.quantity, line.itemId, businessId]);
    totalCogs += Number(line.product.cost || 0) * line.quantity;
    const { rows: [updated] } = await client.query('SELECT * FROM inventory_items WHERE id=? AND business_id=?', [line.itemId, businessId]);
    updatedItems.push(updated);
    await client.query(
      'INSERT INTO inventory_stock_log (item_id, change_type, qty_change, before_stock, after_stock, user_id, note) VALUES (?,?,?,?,?,?,?)',
      [line.itemId, 'sale', -line.quantity, line.product.stock, updated.stock, userId, `Sales document #${documentId}`]
    );
  }
  if (header.customerId && totals.total > paidAmount) await client.query('UPDATE customers SET balance=balance+? WHERE id=? AND business_id=?', [Number((totals.total - paidAmount).toFixed(2)), header.customerId, businessId]);
  if (paidAmount > 0) for(const payment of (header.payments?.length?header.payments:[{amount:paidAmount,method:header.payment?.method||'cash',referenceNo:header.payment?.referenceNo||null}])) await client.query('INSERT INTO sales_document_payments (document_id,amount,method,reference_no,notes,created_by) VALUES (?,?,?,?,?,?)', [documentId,payment.amount,payment.method,payment.referenceNo||null,'POS payment',userId]);
  const journalType = paymentMethod === 'credit' ? 'CREDIT_SALE' : paymentMethod === 'mpesa' ? 'MPESA_SALE' : paymentMethod === 'bank' ? 'BANK_SALE' : 'CASH_SALE';
  if(methods.length>1)await JournalEngine.generate('SPLIT_SALE',totals.total,`Sales document #${documentId}`,header.notes||'POS split payment',client,{paymentLines:header.payments,cogsAmount:totalCogs,taxAmount:totals.taxTotal,postingDate:header.documentDate});
  else await JournalEngine.generate(journalType, totals.total, `Sales document #${documentId}`, header.notes || 'Sales invoice', client, { cogsAmount: totalCogs, taxAmount:totals.taxTotal, postingDate: header.documentDate });
  if(paidAmount>0&&paidAmount<totals.total)await JournalEngine.generate('DEBT_PAYMENT',paidAmount,`INVOICE-${documentId}-INITIAL-PAYMENT`, 'Initial invoice payment',client,{settingKey:header.payment.method==='mpesa'?'payment_mobile':header.payment.method==='bank'?'payment_bank':'payment_cash',postingDate:header.documentDate});
  await client.query('UPDATE sales_documents SET sale_id=? WHERE id=? AND business_id=?', [saleId, documentId, businessId]);
  client.updatedItems = updatedItems;
}

async function postCreditNote(client, documentId, header, lines, totals, userId, businessId = 1) {
  for (const line of lines) {
    await client.query('UPDATE inventory_items SET stock=stock+?,sold=GREATEST(sold-?,0),updated_at=NOW() WHERE id=? AND business_id=?', [line.quantity, line.quantity, line.itemId, businessId]);
    const { rows: [updated] } = await client.query('SELECT * FROM inventory_items WHERE id=? AND business_id=?', [line.itemId, businessId]);
    await client.query(
      'INSERT INTO inventory_stock_log (item_id, change_type, qty_change, before_stock, after_stock, user_id, note) VALUES (?,?,?,?,?,?,?)',
      [line.itemId, 'adjustment', line.quantity, line.product.stock, updated.stock, userId, `Credit note #${documentId} for invoice #${header.referenceInvoiceId}`]
    );
  }
  const invoice = await client.query('SELECT customer_id FROM sales_documents WHERE id=? AND business_id=?', [header.referenceInvoiceId, businessId]);
  const customerId = invoice.rows[0]?.customer_id;
  if (customerId) await client.query('UPDATE customers SET balance=GREATEST(balance-?,0) WHERE id=? AND business_id=?', [totals.total, customerId, businessId]);
  await client.query('UPDATE sales_documents SET status=? WHERE id=? AND business_id=?', ['issued', documentId, businessId]);
}

async function update(req,res,next){
 const client=await getClient(),bid=getBusinessId(req);
 try{await client.query('BEGIN');await client.query('SELECT id FROM sales_documents WHERE id=? AND business_id=? FOR UPDATE',[req.params.id,bid]);const old=await loadDocument(client,req.params.id,bid);if(!old)throw badRequest('Document not found');if(!policy.editable(old))throw badRequest('Issued or converted documents cannot be edited');
 const header=validateHeader({...req.body,type:old.type,convertedFromId:old.converted_from_id,referenceInvoiceId:old.reference_invoice_id,status:old.type==='invoice'?'draft':req.body.status||old.status});
 await createDocument(client,header,req.body.items,req.user.id,bid,old.id);const fresh=await loadDocument(client,old.id,bid);await client.query('COMMIT');res.json(fresh);
 }catch(e){await client.query('ROLLBACK');next(e);}finally{client.release();}
}
async function issue(req,res,next){
 const client=await getClient(),bid=getBusinessId(req);
 try{await client.query('BEGIN');await client.query('SELECT id FROM users WHERE id=? AND business_id=? FOR UPDATE',[req.user.id,bid]);await client.query('SELECT id FROM sales_documents WHERE id=? AND business_id=? FOR UPDATE',[req.params.id,bid]);const doc=await loadDocument(client,req.params.id,bid);if(!doc||doc.type!=='invoice')throw badRequest('Choose a draft invoice');
 if(doc.status!=='draft'){await client.query('COMMIT');return res.json({...doc,replayed:true});}
 const header=validateHeader({...doc,status:'issued',payments:req.body.payment?[req.body.payment]:[]});header.snapshots={customer:doc.customer,seller:doc.seller};header.lineSnapshots=doc.items;
 await createDocument(client,header,doc.items.map(l=>({itemId:l.item_id,quantity:l.quantity,unitPrice:l.unit_price,discountPercent:l.discount_percent,taxPercent:l.tax_percent})),req.user.id,bid,doc.id);await activity(client,doc.id,bid,req.user.id,'issued',{total:doc.total});const fresh=await loadDocument(client,doc.id,bid);await client.query('COMMIT');res.json(fresh);
 }catch(e){await client.query('ROLLBACK');next(e);}finally{client.release();}
}
async function convert(req,res,next){
 const client=await getClient(),bid=getBusinessId(req),target=String(req.body.targetType||'');
 try{await client.query('BEGIN');await client.query('SELECT id FROM users WHERE id=? AND business_id=? FOR UPDATE',[req.user.id,bid]);await client.query('SELECT id FROM sales_documents WHERE id=? AND business_id=? FOR UPDATE',[req.params.id,bid]);const source=await loadDocument(client,req.params.id,bid);if(!source)throw badRequest('Source document not found');policy.convert(source,target);
 const previous=(await client.query('SELECT id,type FROM sales_documents WHERE converted_from_id=? AND business_id=? ORDER BY id LIMIT 1',[source.id,bid])).rows[0];
 if(previous){if(previous.type!==target)throw badRequest('Already converted. Continue from the resulting document.');const existing=await loadDocument(client,previous.id,bid);await client.query('COMMIT');return res.status(201).json({...existing,replayed:true});}
 const header=validateHeader({...source,type:target,date:today(),due_date:null,valid_until:null,convertedFromId:source.id,status:target==='invoice'?(req.body.status||'issued'):'draft'});header.snapshots={customer:source.customer,seller:source.seller};header.lineSnapshots=source.items;
 await createDocument(client,header,source.items.map(l=>({itemId:l.item_id,quantity:l.quantity,unitPrice:l.unit_price,discountPercent:l.discount_percent,taxPercent:l.tax_percent})),req.user.id,bid);
 await client.query('UPDATE sales_documents SET status=? WHERE id=? AND business_id=?',[`converted_to_${target}`,source.id,bid]);await activity(client,source.id,bid,req.user.id,'converted',{targetId:client.lastDocumentId,targetType:target});await activity(client,client.lastDocumentId,bid,req.user.id,'converted_from',{sourceId:source.id,sourceType:source.type});
 const created=await loadDocument(client,client.lastDocumentId,bid);await client.query('COMMIT');res.status(201).json(created);
 }catch(e){await client.query('ROLLBACK');next(e);}finally{client.release();}
}
async function addPayment(req,res,next){
 const client=await getClient(),bid=getBusinessId(req);
 try{await client.query('BEGIN');const fresh=await once(client,bid,`invoice-payment-${req.params.id}`,req.body.requestId,async()=>{
 const doc=(await client.query("SELECT * FROM sales_documents WHERE id=? AND business_id=? AND type IN ('invoice','pos') FOR UPDATE",[req.params.id,bid])).rows[0];if(!doc||doc.status==='draft')throw badRequest('Issue the invoice before recording payment');
 const amount=policy.payment(req.body.amount,Number(doc.balance_due));if(amount<=0)throw badRequest('Payment must be greater than zero');const method=policy.method(req.body.method);
 const paymentResult=await client.query('INSERT INTO sales_document_payments(document_id,amount,method,reference_no,notes,created_by) VALUES (?,?,?,?,?,?)',[doc.id,amount,method,req.body.referenceNo||null,req.body.notes||null,req.user.id]);
 if(doc.customer_id)await client.query('UPDATE customers SET balance=balance-? WHERE id=? AND business_id=?',[amount,doc.customer_id,bid]);
 const paid=Number((Number(doc.paid_amount)+amount).toFixed(2)),due=Number((Number(doc.balance_due)-amount).toFixed(2));await client.query('UPDATE sales_documents SET paid_amount=?,balance_due=?,status=? WHERE id=? AND business_id=?',[paid,due,due<=0?'paid':'partial',doc.id,bid]);
 await JournalEngine.generate('DEBT_PAYMENT',amount,`INVOICE-${doc.id}-PAYMENT-${paymentResult.insertId}`,req.body.notes||'Invoice payment',client,{settingKey:method==='mpesa'?'payment_mobile':method==='bank'?'payment_bank':'payment_cash'});
 await activity(client,doc.id,bid,req.user.id,'payment',{amount,method,reference:req.body.referenceNo||null,status:due<=0?'paid':'partial'});return loadDocument(client,doc.id,bid);
 });await client.query('COMMIT');res.status(201).json(fresh);
 }catch(e){await client.query('ROLLBACK');next(e);}finally{client.release();}
}
module.exports={list,getOne,create,update,issue,convert,addPayment};
