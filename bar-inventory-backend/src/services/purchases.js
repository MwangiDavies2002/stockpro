const policy=require('../utils/purchasePolicy');
const Journal=require('../models/Journal');
const defaults=require('../utils/accountingDefaults');
const event=(c,bid,id,user,action,details={})=>c.query('INSERT INTO purchase_events(business_id,order_id,user_id,action,details_json) VALUES (?,?,?,?,?)',[bid,id,user,action,JSON.stringify(details)]);
const json=v=>typeof v==='string'?JSON.parse(v):v;
function decorate(row){return{...row,balance_due:row.status==='delivered'&&row.transaction_type!=='opening_stock'?policy.money(Number(row.total)-Number(row.paid_amount||0)):0,payment_status:policy.paymentStatus(row)};}
async function load(c,id,bid){
 const {rows}=await c.query('SELECT o.*,s.name supplier_name,s.phone supplier_phone,s.address supplier_address,l.name location_name,u.name created_by_name FROM orders o LEFT JOIN suppliers s ON s.id=o.supplier_id AND s.business_id=o.business_id LEFT JOIN locations l ON l.id=o.location_id AND l.business_id=o.business_id LEFT JOIN users u ON u.id=o.created_by AND u.business_id=o.business_id WHERE o.id=? AND o.business_id=?',[id,bid]);if(!rows.length)return null;
 const items=(await c.query('SELECT * FROM order_items WHERE order_id=? ORDER BY item_id,id',[id])).rows;
 const payments=(await c.query('SELECT p.*,u.name added_by,a.account_name cash_account_name,t.name treasury_name FROM purchase_payments p LEFT JOIN users u ON u.id=p.created_by AND u.business_id=p.business_id LEFT JOIN chart_of_accounts a ON a.id=p.cash_account_id AND a.business_id=p.business_id LEFT JOIN treasury t ON t.id=p.treasury_id AND t.business_id=p.business_id WHERE p.order_id=? AND p.business_id=? ORDER BY p.id DESC',[id,bid])).rows;
 const activity=(await c.query('SELECT e.*,u.name added_by FROM purchase_events e LEFT JOIN users u ON u.id=e.user_id AND u.business_id=e.business_id WHERE e.order_id=? AND e.business_id=? ORDER BY e.id DESC',[id,bid])).rows.map(e=>({...e,details:json(e.details_json)||{}}));
 const row=rows[0],supplier=row.supplier_snapshot?json(row.supplier_snapshot):{name:row.supplier_name,phone:row.supplier_phone,address:row.supplier_address};
 return{...decorate(row),supplier,supplier_name:supplier?.name||row.supplier_name,items,payments,activity};
}
async function receive(c,order,user,bid){
 const items=(await c.query('SELECT * FROM order_items WHERE order_id=? ORDER BY item_id,id',[order.id])).rows,posting=policy.posting(order,items);
 for(const line of items){if(line.account_type==='expense')continue;
  const item=(await c.query('SELECT * FROM inventory_items WHERE id=? AND business_id=? FOR UPDATE',[line.item_id,bid])).rows[0];if(!item)policy.fail('Product no longer exists');if(order.location_id&&Number(item.location_id)!==Number(order.location_id))policy.fail('Product location changed; cannot receive this purchase');
  const before=Number(item.stock),qty=Number(line.quantity),cost=posting.costs[line.item_id];if(order.transaction_type==='opening_stock'&&before!==0)policy.fail('Opening stock requires zero existing quantity');
  const next=(before*Number(item.cost||0)+qty*cost)/(before+qty);
  await c.query('UPDATE inventory_items SET stock=stock+?,cost=?,price=COALESCE(?,price),previous_unit_price=?,previous_discount=?,updated_at=NOW() WHERE id=? AND business_id=?',[qty,next,line.selling_price,line.cost_before_discount??line.unit_price,line.discount_percent||0,item.id,bid]);
  await c.query('INSERT INTO inventory_stock_log(item_id,change_type,qty_change,before_stock,after_stock,user_id,note) VALUES (?,?,?,?,?,?,?)',[item.id,order.transaction_type==='opening_stock'?'opening_stock':'restock',qty,before,before+qty,user,`Purchase #${order.id} received`]);
 }
 if(Number(order.total)>0){
  const maps=await defaults.ensurePurchaseAccountingMappings(c),lines=[];
  if(posting.asset>0)lines.push({account_id:maps.inventory_asset,debit:posting.asset});if(posting.expense>0)lines.push({account_id:maps.purchases_expense,debit:posting.expense});
  if(posting.tax>0){const tax=await defaults.ensureMappings([{key:'purchases_vat_input',code:'1400',name:'VAT Input',type:'Assets',normal:'Debit'}],c);lines.push({account_id:tax.purchases_vat_input,debit:posting.tax});}
  const offset=order.transaction_type==='opening_stock'?(await defaults.openingEquity(c,bid)).id:maps.purchases_payable;
  lines.push({account_id:offset,credit:Number(order.total)});
  await c.query('UPDATE orders SET payable_account_id=? WHERE id=? AND business_id=?',[offset,order.id,bid]);
  await Journal.create({posting_date:order.purchase_date||new Date().toISOString().slice(0,10),description:order.transaction_type==='opening_stock'?'Opening stock':`Purchase #${order.id} received`,reference:`PURCHASE-${order.id}`,created_by:user},lines,c);
 }
 await c.query("UPDATE orders SET status='delivered',updated_at=NOW() WHERE id=? AND business_id=?",[order.id,bid]);await event(c,bid,order.id,user,'received',{total:Number(order.total)});
}
async function pay(c,id,body,user,bid){
 const order=(await c.query('SELECT * FROM orders WHERE id=? AND business_id=? FOR UPDATE',[id,bid])).rows[0];if(!order||order.status!=='delivered'||order.transaction_type==='opening_stock')policy.fail('Payments require a received supplier purchase');
 const due=policy.money(Number(order.total)-Number(order.paid_amount||0)),amount=policy.payment(body.amount,due);if(amount<=0)policy.fail('Payment must be greater than zero');const method=policy.method(body.method);
 const key=method==='bank'?'payment_bank':method==='mpesa'?'payment_mobile':'payment_cash';
 const setting=(await c.query('SELECT account_id,treasury_id FROM accounting_settings WHERE business_id=? AND setting_key=? FOR UPDATE',[bid,key])).rows[0];
 let treasuryId=Number(body.treasuryId||setting?.treasury_id)||null,cashId=Number(setting?.account_id)||null;
 if(treasuryId){const treasury=(await c.query('SELECT * FROM treasury WHERE id=? AND business_id=? FOR UPDATE',[treasuryId,bid])).rows[0];if(!treasury||treasury.status!=='active')policy.fail('Choose an active Treasury account');cashId=treasury.linked_gl_account;}
 const account=(await c.query('SELECT * FROM chart_of_accounts WHERE id=? AND business_id=? AND active=TRUE FOR UPDATE',[cashId,bid])).rows[0];if(!account||account.account_type!=='Assets')policy.fail('Choose an active cash account or configure the payment method in Posting settings');
 // Locking reads include committed movements even if earlier queries established a snapshot.
 const ledger=(await c.query('SELECT l.debit,l.credit FROM journal_entry_lines l JOIN journal_entries j ON j.id=l.journal_entry_id WHERE l.account_id=? AND j.business_id=? FOR UPDATE',[cashId,bid])).rows;
 const balance=policy.money(ledger.reduce((n,l)=>n+Number(l.debit)-Number(l.credit),0));if(balance<amount)policy.fail('Insufficient funds in the selected payment account');
 const payableId=order.payable_account_id||(await defaults.ensurePurchaseAccountingMappings(c)).purchases_payable,reference=policy.text(body.referenceNo,100,'Payment reference'),notes=policy.text(body.notes,1000,'Payment note');
 const paymentId=(await c.query('INSERT INTO purchase_payments(business_id,order_id,amount,method,treasury_id,cash_account_id,reference_no,notes,created_by) VALUES (?,?,?,?,?,?,?,?,?)',[bid,id,amount,method,treasuryId,cashId,reference,notes,user])).insertId;
 await Journal.create({posting_date:new Date().toISOString().slice(0,10),description:`Supplier payment for purchase #${id}${reference?' / '+reference:''}`,reference:`PURCHASE-${id}-PAYMENT-${paymentId}`,created_by:user},[{account_id:payableId,debit:amount},{account_id:cashId,credit:amount}],c);
 await c.query('UPDATE orders SET paid_amount=paid_amount+?,updated_at=NOW() WHERE id=? AND business_id=?',[amount,id,bid]);
 if(treasuryId){await c.query('UPDATE treasury SET current_balance=? WHERE id=? AND business_id=?',[policy.money(balance-amount),treasuryId,bid]);await c.query("INSERT INTO treasury_transactions(treasury_id,transaction_type,amount,reference,description,created_by) VALUES (?,'Withdrawal',?,?,?,?)",[treasuryId,amount,reference,`Supplier payment for purchase #${id}`,user]);}
 await event(c,bid,id,user,'payment',{amount,method,reference});return load(c,id,bid);
}
async function save(c,body,user,bid,existingId=null){
 const h=policy.header(body),lines=policy.lines(body.items);if(h.transaction_type==='opening_stock'&&lines.some(l=>l.accountType!=='asset'))policy.fail('Opening stock lines must be inventory assets');
 if(h.supplier_id&&!(await c.query('SELECT id FROM suppliers WHERE id=? AND business_id=?',[h.supplier_id,bid])).rows.length)policy.fail('Supplier does not exist');
 const products={};for(const line of lines){const item=(await c.query('SELECT * FROM inventory_items WHERE id=? AND business_id=? FOR UPDATE',[line.itemId,bid])).rows[0];if(!item)policy.fail('Product no longer exists');if(!h.location_id)h.location_id=item.location_id;if(Number(item.location_id)!==Number(h.location_id))policy.fail('Products must belong to the selected location');products[item.id]=item;}
 if(!(await c.query('SELECT id FROM locations WHERE id=? AND business_id=?',[h.location_id,bid])).rows.length)policy.fail('Business location does not exist');
 if(h.reference_no&&h.transaction_type==='purchase'){const duplicate=(await c.query("SELECT id FROM orders WHERE business_id=? AND supplier_id=? AND reference_no=? AND status<>'cancelled' AND id<>? LIMIT 1",[bid,h.supplier_id,h.reference_no,existingId||0])).rows[0];if(duplicate)throw Object.assign(new Error(`Supplier reference already exists on purchase #${duplicate.id}`),{status:409});}
 const total=policy.posting(h,lines).total;if(total>9999999999.99)policy.fail('Purchase total exceeds the supported amount');const initial=policy.payment(body.payment?.amount,total);if(initial>0&&(h.status!=='delivered'||h.transaction_type!=='purchase'))policy.fail('Receive the supplier purchase before recording payment');
 const supplier=h.supplier_id?(await c.query('SELECT * FROM suppliers WHERE id=? AND business_id=?',[h.supplier_id,bid])).rows[0]:null;
 const record={...h,total,supplier_snapshot:supplier?JSON.stringify({name:supplier.name,phone:supplier.phone||'',email:supplier.email||'',address:supplier.address||''}):null};let id=existingId;const fields=Object.keys(record);
 if(id){await c.query(`UPDATE orders SET ${fields.map(k=>k+'=?').join(',')},updated_at=NOW() WHERE id=? AND business_id=?`,[...fields.map(k=>record[k]),id,bid]);await c.query('DELETE FROM order_items WHERE order_id=?',[id]);}
 else id=(await c.query(`INSERT INTO orders(business_id,created_by,${fields.join(',')}) VALUES (${Array(fields.length+2).fill('?').join(',')})`,[bid,user,...fields.map(k=>record[k])])).insertId;
 for(const line of lines)await c.query('INSERT INTO order_items(order_id,item_id,item_name,quantity,unit_price,cost_before_discount,discount_percent,tax_percent,subtotal,net_cost,profit_margin,selling_price,account_type,lot_number) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[id,line.itemId,products[line.itemId].name,line.quantity,line.unitPrice,line.before,line.discount,line.tax,line.subtotal,line.netCost,line.margin,body.purchaseDate!==undefined?line.sellingPrice:null,line.accountType,line.lotNumber]);
 await event(c,bid,id,user,existingId?'updated':'created',{status:h.status,total});if(h.status==='delivered')await receive(c,{...record,id},user,bid);if(initial>0)await pay(c,id,{...body.payment,amount:initial},user,bid);return load(c,id,bid);
}
module.exports={save,receive,pay,load,decorate,event};
