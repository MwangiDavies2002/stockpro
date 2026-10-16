const {badRequest}=require('./salesMath');
const types=['quotation','sales_order','proforma','invoice','pos','credit_note'];
const transitions={quotation:['sales_order','proforma','invoice'],sales_order:['proforma','invoice'],proforma:['invoice']};
function date(value,fallback=null){if(value==null||value==='')return fallback;const s=(value instanceof Date?value.toISOString():String(value)).slice(0,10);const d=new Date(s);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==s)throw badRequest('Enter a valid document date');return s;}
function payment(value,total){const n=Number(value??0),cents=Math.round(n*100);if(!Number.isFinite(n)||n<0||Math.abs(n-cents/100)>0.0000001||n>total)throw badRequest('Payment must be within the amount due, with at most two decimal places');return cents/100;}
function method(value){const v=value||'cash';if(!['cash','bank','mpesa'].includes(v))throw badRequest('Choose cash, bank or mobile money');return v;}
function editable(doc){return ['quotation','sales_order','proforma'].includes(doc.type)&&!String(doc.status).startsWith('converted_to_')&&doc.status!=='cancelled'||doc.type==='invoice'&&doc.status==='draft';}
function convert(source,target){if(!transitions[source.type]?.includes(target)||source.status==='cancelled')throw badRequest('This document cannot be converted to that type');}
function posting(header){return ['invoice','pos'].includes(header.type)&&header.status!=='draft';}
function status(type,value){const v=value||(['quotation','sales_order','proforma'].includes(type)?'draft':'issued');const allowed=['quotation','sales_order','proforma'].includes(type)?['draft','sent','accepted','cancelled']:type==='invoice'?['draft','issued']:['issued'];if(!allowed.includes(v))throw badRequest('Invalid document status');return v;}
module.exports={types,transitions,date,payment,method,editable,convert,posting,status};
