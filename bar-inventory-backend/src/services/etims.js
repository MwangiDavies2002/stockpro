const axios=require('axios');
const {query,getClient}=require('../config/db');
const {encrypt,decrypt}=require('../utils/secrets');
const transport={post:(...args)=>axios.post(...args)};
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
function apiUrl(config){
  if(!config.etims_api_url)fail('Set the KRA OSCU API URL in Business Settings');
  const url=new URL(config.etims_api_url);
  if(url.protocol!=='https:'||!['etims-api.kra.go.ke','etims-sbx.kra.go.ke','etims.kra.go.ke'].includes(url.hostname))fail('Use an official KRA HTTPS OSCU endpoint');
  return url.toString().replace(/\/$/,'');
}
async function config(businessId){const{rows:[row]}=await query('SELECT * FROM businesses WHERE id=?',[businessId]);if(!row)fail('Shop not found');return row;}
async function initialize(businessId){
  const settings=await config(businessId);
  if(!/^[A-Z]\d{9}[A-Z]$/.test(settings.kra_pin||'')||!/^\d{2}$/.test(settings.etims_branch_id||'')||!settings.etims_device_serial)fail('Set the KRA PIN, branch ID and registered device serial');
  const{data}=await transport.post(`${apiUrl(settings)}/selectInitOsdcInfo`,{tin:settings.kra_pin,bhfId:settings.etims_branch_id,dvcSrlNo:settings.etims_device_serial},{timeout:30000});
  const info=data?.data?.info;
  if(data?.resultCd!=='000'||!info?.cmcKey)fail(data?.resultMsg||'KRA initialization failed');
  await query('UPDATE businesses SET etims_password_encrypted=?,etims_initialized=TRUE WHERE id=?',[encrypt(info.cmcKey),businessId]);return{initialized:true,resultCd:data.resultCd};
}
function buildPayload(settings,document,items,invoiceNumber,originalInvoiceNumber=0){
  const key=decrypt(settings.etims_password_encrypted);if(!settings.etims_initialized||!key)fail('Initialize the KRA device before submitting invoices');
  const buckets={};for(const category of ['A','B','C','D','E'])buckets[category]={base:0,tax:0,rate:0};
  const itemList=items.map((item,index)=>{
    if(!item.etims_item_code||!item.etims_class_code||!buckets[item.etims_tax_category]||!item.etims_qty_unit||!item.etims_pkg_unit)fail(`Map KRA item, classification, tax and unit codes for ${item.item_name}`);
    const bucket=buckets[item.etims_tax_category];bucket.base+=Number(item.line_total);bucket.tax+=Number(item.tax_amount);bucket.rate=Number(item.tax_percent);
    const grossPrice=Number((Number(item.unit_price)*(1+Number(item.tax_percent)/100)).toFixed(2));
    return{itemSeq:index+1,itemCd:item.etims_item_code,itemClsCd:item.etims_class_code,itemNm:item.item_name,bcd:item.barcode||null,pkgUnitCd:item.etims_pkg_unit,pkg:Number(item.quantity),qtyUnitCd:item.etims_qty_unit,qty:Number(item.quantity),prc:grossPrice,splyAmt:Number((item.quantity*grossPrice).toFixed(2)),dcRt:Number(item.discount_percent),dcAmt:Number((Number(item.discount_amount)*(1+Number(item.tax_percent)/100)).toFixed(2)),taxTyCd:item.etims_tax_category,taxblAmt:Number(item.line_total),taxAmt:Number(item.tax_amount),totAmt:Number(item.line_total)};
  });
  const rawDate=document.document_date instanceof Date?`${document.document_date.getFullYear()}-${String(document.document_date.getMonth()+1).padStart(2,'0')}-${String(document.document_date.getDate()).padStart(2,'0')}`:String(document.document_date);
  const date=rawDate.slice(0,10).replace(/-/g,'');
  const paymentCode={cash:'01',credit:'02',card:'05',mpesa:'06',bank:'07'}[document.payment_method]||'01';
  const payload={tin:settings.kra_pin,bhfId:settings.etims_branch_id,cmcKey:key,trdInvcNo:String(document.reference_no||document.id),invcNo:invoiceNumber,orgInvcNo:originalInvoiceNumber,custTin:null,custNm:document.customer_name||null,salesTyCd:'N',rcptTyCd:document.type==='credit_note'?'R':'S',pmtTyCd:paymentCode,salesSttsCd:'02',cfmDt:date+'000000',salesDt:date,stockRlsDt:date+'000000',cnclReqDt:null,cnclDt:null,rfdDt:document.type==='credit_note'?date+'000000':null,rfdRsnCd:document.type==='credit_note'?'01':null,totItemCnt:items.length,totTaxblAmt:Number(document.subtotal),totTaxAmt:Number(document.tax_total),totAmt:Number(document.total),remark:document.notes||null,regrId:String(document.created_by||''),regrNm:'StockPro',modrId:String(document.created_by||''),modrNm:'StockPro',itemList};
  for(const[category,value]of Object.entries(buckets)){payload[`taxblAmt${category}`]=Number(value.base.toFixed(2));payload[`taxAmt${category}`]=Number(value.tax.toFixed(2));payload[`taxRt${category}`]=value.rate;}
  payload.totTaxblAmt=Number(document.total);payload.prchrAcptcYn='N';payload.receipt={custTin:null,custMblNo:null,rcptPbctDt:payload.cfmDt,trdeNm:settings.name?.slice(0,20)||null,adrs:null,topMsg:null,btmMsg:null,prchrAcptcYn:'N'};
  return payload;
}
async function queueDocument(client,documentId,businessId){
  const{rows:[settings]}=await client.query('SELECT etims_enabled FROM businesses WHERE id=?',[businessId]);
  if(settings?.etims_enabled)await client.query("INSERT INTO integration_jobs(business_id,provider,reference_id,payload,status) VALUES (?,'kra-etims',?,?,'pending')",[businessId,documentId,JSON.stringify({documentId})]);
}
async function submit(jobId,businessId){
  const settings=await config(businessId);
  if(!settings.etims_enabled||!settings.etims_initialized)fail('Enable and initialize the KRA device before submitting invoices');
  const client=await getClient();let job,number,sent=false;
  try{await client.query('BEGIN');const{rows}=await client.query("SELECT * FROM integration_jobs WHERE id=? AND business_id=? AND provider='kra-etims' FOR UPDATE",[jobId,businessId]);job=rows[0];if(!job)fail('Submission job not found');if(job.status==='completed'){await client.query('ROLLBACK');return{completed:true,replayed:true};}if(job.status==='processing')fail('This submission is already being processed');
    if(job.status==='unknown')fail('KRA acceptance is unknown. Reconcile this invoice with KRA before retrying.');
    const business=await client.query('SELECT etims_last_invoice_no FROM businesses WHERE id=? FOR UPDATE',[businessId]);
    const earlier=await client.query("SELECT id FROM integration_jobs WHERE business_id=? AND provider='kra-etims' AND id<? AND status<>'completed' LIMIT 1",[businessId,job.id]);
    if(earlier.rows.length)fail('Complete or reconcile earlier KRA invoices before submitting this invoice');
    const document=await client.query('SELECT etims_invoice_number FROM sales_documents WHERE id=? AND business_id=?',[job.reference_id,businessId]);number=document.rows[0]?.etims_invoice_number||Number(business.rows[0].etims_last_invoice_no)+1;
    if(!document.rows[0]?.etims_invoice_number){await client.query('UPDATE businesses SET etims_last_invoice_no=? WHERE id=?',[number,businessId]);await client.query('UPDATE sales_documents SET etims_invoice_number=? WHERE id=? AND business_id=?',[number,job.reference_id,businessId]);}
    await client.query("UPDATE integration_jobs SET status='processing',attempts=attempts+1 WHERE id=?",[job.id]);await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  try{
    const{rows:[document]}=await query('SELECT d.*,c.name customer_name,s.payment_method FROM sales_documents d LEFT JOIN customers c ON c.id=d.customer_id AND c.business_id=d.business_id LEFT JOIN sales s ON s.id=d.sale_id AND s.business_id=d.business_id WHERE d.id=? AND d.business_id=?',[job.reference_id,businessId]);
    const{rows:items}=await query('SELECT di.*,i.etims_item_code,i.etims_class_code,i.etims_tax_category,i.etims_qty_unit,i.etims_pkg_unit,i.barcode FROM sales_document_items di JOIN inventory_items i ON i.id=di.item_id AND i.business_id=? WHERE di.document_id=?',[businessId,document.id]);
    let original=0;if(document.type==='credit_note'){const{rows:[invoice]}=await query('SELECT etims_invoice_number,etims_receipt_json FROM sales_documents WHERE id=? AND business_id=?',[document.reference_invoice_id,businessId]);if(!invoice?.etims_receipt_json)fail('Submit the original invoice to KRA before its credit note');original=Number(invoice.etims_invoice_number);}
    const payload=buildPayload(settings,document,items,number,original);
    sent=true;
    const{data}=await transport.post(`${apiUrl(settings)}/saveTrnsSalesOsdc`,payload,{timeout:30000});
    if(data?.resultCd!=='000'){sent=false;fail(data?.resultMsg||'KRA rejected this invoice');}
    await query('UPDATE sales_documents SET etims_receipt_json=? WHERE id=? AND business_id=?',[JSON.stringify(data.data||{}),document.id,businessId]);await query("UPDATE integration_jobs SET status='completed',response_json=?,last_error=NULL WHERE id=? AND business_id=?",[JSON.stringify(data),job.id,businessId]);sent=false;return{completed:true,response:data};
  }catch(error){await query('UPDATE integration_jobs SET status=?,last_error=? WHERE id=? AND business_id=?',[sent?'unknown':'failed',sent?'KRA acceptance is unknown; reconcile before retrying':error.message,job.id,businessId]);throw error;}
}
module.exports={initialize,buildPayload,queueDocument,submit,transport};
