const {calculateLine}=require('./purchaseMath');
const {date,payment,method}=require('./salesDocumentPolicy');
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
const money=n=>Math.round(Number(n)*100)/100;
function text(value,max,label){const s=String(value??'').trim();if(s.length>max)fail(label+' is too long');return s||null;}
function header(body){
 const type=body.transactionType||'purchase',status=body.status||'pending';if(!['purchase','opening_stock'].includes(type)||!['pending','approved','delivered'].includes(status))fail('Invalid purchase type or status');
 const supplierId=Number(body.supplierId)||null,locationId=Number(body.locationId)||null;if(type==='purchase'&&!supplierId)fail('Choose a supplier');
 const purchaseDate=date(body.purchaseDate),dueDate=date(body.dueDate);if(body.purchaseDate!==undefined&&(!purchaseDate||!locationId))fail('A valid purchase date and business location are required');if(dueDate&&purchaseDate&&dueDate<purchaseDate)fail('Due date cannot be before purchase date');
 const taxTreatment=body.taxTreatment||'included';if(!['included','recoverable'].includes(taxTreatment))fail('Choose a valid purchase tax treatment');
 const shipping=payment(body.shippingCost,9999999999.99),other=payment(body.otherCost,9999999999.99);
 return{transaction_type:type,status,supplier_id:supplierId,location_id:locationId,purchase_date:purchaseDate,due_date:dueDate,tax_treatment:taxTreatment,shipping_cost:shipping,other_cost:other,shipping_details:text(body.shippingDetails,1000,'Shipping details'),other_cost_note:text(body.otherCostNote,1000,'Additional expense note'),reference_no:text(body.referenceNo,100,'Reference'),pay_term:text(body.payTerm,100,'Pay term'),notes:text(body.notes,4000,'Notes')};
}
function lines(raw){if(!Array.isArray(raw)||!raw.length)fail('Purchase must include at least one item');const seen=new Set();return raw.map(r=>{const id=Number(r.itemId);if(!Number.isInteger(id)||id<1||seen.has(id))fail('Each product must appear once with a valid ID');seen.add(id);const account=r.accountType||'asset';if(!['asset','expense'].includes(account))fail('Choose Asset or Expense for each line');return{...calculateLine({...r,costBeforeDiscount:r.costBeforeDiscount??r.unitPrice}),itemId:id,accountType:account,lotNumber:text(r.lotNumber,100,'Lot reference')};}).sort((a,b)=>a.itemId-b.itemId);}
function posting(order,items){
 const recoverable=order.tax_treatment==='recoverable',stock=items.filter(l=>(l.account_type||l.accountType||'asset')==='asset');
 const subtotal=l=>Number(l.subtotal??money(Number(l.quantity)*Number(l.unit_price??l.unitPrice)));
 const gross=l=>Number(l.net_cost??l.netCost??money(subtotal(l)+money(subtotal(l)*Number(l.tax_percent??l.tax??0)/100)));
 const base=l=>recoverable?subtotal(l):gross(l);
 const weights=stock.reduce((n,l)=>n+base(l),0),quantities=stock.reduce((n,l)=>n+Number(l.quantity),0),shipping=Number(order.shipping_cost||0),other=Number(order.other_cost||0),shippingCents=Math.round(shipping*100);
 const shares=stock.map((l,index)=>{const exact=shippingCents*(weights?base(l)/weights:Number(l.quantity)/quantities);return{l,index,cents:Math.floor(exact),fraction:exact-Math.floor(exact)};});
 let remaining=shippingCents-shares.reduce((n,s)=>n+s.cents,0);for(const share of [...shares].sort((a,b)=>b.fraction-a.fraction||a.index-b.index)){if(remaining<=0)break;share.cents++;remaining--;}
 const allocation=new Map(shares.map(s=>[s.l,s.cents/100]));let asset=0,expense=other+(stock.length?0:shipping),tax=0;const costs={};
 for(const l of items){const value=base(l),isStock=(l.account_type||l.accountType||'asset')==='asset';if(recoverable)tax+=money(gross(l)-subtotal(l));if(isStock){const valueWithShipping=money(value+(allocation.get(l)||0));asset+=valueWithShipping;costs[l.item_id??l.itemId]=valueWithShipping/Number(l.quantity);}else expense+=value;}
 return{asset:money(asset),expense:money(expense),tax:money(tax),costs,total:money(items.reduce((n,l)=>n+gross(l),0)+shipping+other)};
}
const paymentStatus=o=>o.transaction_type==='opening_stock'||o.status!=='delivered'?'not_due':Number(o.total)<=Number(o.paid_amount||0)?'paid':Number(o.paid_amount||0)>0?'partial':'due';
module.exports={header,lines,posting,paymentStatus,money,text,payment,method,fail};
