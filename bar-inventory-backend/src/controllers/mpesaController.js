const {query,getClient}=require('../config/db');
const {getBusinessId,runForBusiness}=require('../utils/tenant');
const provider=require('../services/mpesa');
const {once}=require('../utils/idempotency');
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
const group=amount=>amount<=50?'Micro':amount<=500?'Small':amount<=1000?'Medium':'Large';
async function settleVerified(payment){
  if(!payment.verified_at||!payment.mpesa_receipt)fail('Only verified payments can be recovered');
  if(payment.reference_id||!payment.payload_json)return payment.reference_id;
  const sale=typeof payment.payload_json==='string'?JSON.parse(payment.payload_json):payment.payload_json;
  const{rows:[actor]}=await query('SELECT id,business_id,role,name FROM users WHERE id=? AND business_id=?',[payment.created_by,payment.business_id]);
  if(!actor)fail('The original cashier account is unavailable; payment requires manual reconciliation');
  let failure,document;
  await runForBusiness(payment.business_id,()=>require('./salesDocumentController').create({body:{...sale,type:'pos',requestId:`mpesa:${payment.transaction_id}`,payment:{amount:Number(payment.amount),method:'mpesa'}},user:actor},{status(){return this;},json(data){document=data;}},error=>{failure=error;}),actor);
  if(failure){await query("UPDATE mpesa_payments SET status='needs_action' WHERE id=?",[payment.id]);throw failure;}
  await query("UPDATE mpesa_payments SET reference_id=?,status='completed' WHERE id=? AND business_id=?",[document.id,payment.id,payment.business_id]);
  return document.id;
}
async function stkPush(req,res,next){try{
  const phone=String(req.body.phone||'').replace(/^\+/, '').replace(/^0/,'254'),amount=Number(req.body.amount);
  if(!/^254[17]\d{8}$/.test(phone)||!Number.isInteger(amount)||amount<1)fail('A valid Kenyan phone number and positive whole amount are required');
  const businessId=getBusinessId(req),purpose=req.body.purpose||'sale',referenceId=Number(req.body.referenceId)||null;
  if(!['sale','subscription'].includes(purpose))fail('Invalid payment purpose');
  if(referenceId){const table=purpose==='subscription'?'subscriptions':'sales_documents';const{rows}=await query(`SELECT * FROM ${table} WHERE id=? AND business_id=?`,[referenceId,businessId]);if(!rows.length)fail('Payment reference does not belong to your shop');}
  if(purpose==='subscription'){const prices={basic:1000,growth:5000,erp:30000};if(!prices[req.body.plan]||prices[req.body.plan]!==amount)fail('Subscription amount must match the selected plan');}
  const sale=req.body.sale;
  if(sale){if(purpose!=='sale'||sale.type!=='pos'||!Array.isArray(sale.items)||!sale.items.length)fail('Invalid sale payment request');const location=await query('SELECT id FROM locations WHERE id=? AND business_id=?',[sale.locationId,businessId]);if(!location.rows.length)fail('Sale location must belong to your shop');let expected=0;for(const line of sale.items){const{rows:[item]}=await query('SELECT id,stock FROM inventory_items WHERE id=? AND business_id=? AND location_id=?',[line.itemId,businessId,sale.locationId]);if(!item||item.stock<line.quantity)fail('Sale item is unavailable');expected+=require('../utils/salesMath').calculateSalesLine(line).lineTotal;}if(Number(expected.toFixed(2))!==amount)fail('Payment amount must match the sale total');}
  const client=await getClient();try{await client.query('BEGIN');
    const result=await once(client,businessId,'mpesa-stk',req.body.requestId||sale?.requestId,async()=>{
      const data=await provider.initiate({phone,amount,reference:`SP${businessId}`});
      await client.query('INSERT INTO mpesa_payments(business_id,transaction_id,phone,amount,price_group,status,purpose,reference_id,payload_json,created_by) VALUES (?,?,?,?,?,\'pending\',?,?,?,?)',[businessId,data.CheckoutRequestID,phone,amount,group(amount),purpose,referenceId,sale?JSON.stringify(sale):null,req.user.id]);
      return{checkoutRequestId:data.CheckoutRequestID,message:'Payment request sent; awaiting verified confirmation'};
    });await client.query('COMMIT');res.json(result);
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}catch(error){next(error);}}
async function callback(req,res,next){try{
  const callback=req.body?.Body?.stkCallback;if(!callback?.CheckoutRequestID)return res.json({ResultCode:0,ResultDesc:'Accepted'});
  const{rows:[payment]}=await query('SELECT * FROM mpesa_payments WHERE transaction_id=?',[callback.CheckoutRequestID]);
  if(!payment)return res.json({ResultCode:0,ResultDesc:'Accepted'});
  if(payment.verified_at){try{await settleVerified(payment);}catch(error){console.error('Verified M-Pesa sale requires recovery:',error.message);}return res.json({ResultCode:0,ResultDesc:'Accepted'});}
  if(Number(callback.ResultCode)!==0){const confirmation=await provider.verify(payment.transaction_id);if(Number(confirmation.ResultCode)!==Number(callback.ResultCode))return res.status(503).json({message:'Cancellation is awaiting provider verification'});await query("UPDATE mpesa_payments SET status='failed',result_code=? WHERE id=? AND status='pending'",[Number(callback.ResultCode),payment.id]);return res.json({ResultCode:0,ResultDesc:'Accepted'});}
  const verified=await provider.verify(payment.transaction_id);if(Number(verified.ResultCode)!==0)return res.status(503).json({message:'Payment confirmation is awaiting provider verification'});
  const items=callback.CallbackMetadata?.Item||[],value=name=>items.find(item=>item.Name===name)?.Value;
  const amount=Number(value('Amount')),phone=String(value('PhoneNumber')||''),receipt=String(value('MpesaReceiptNumber')||'');
  if(amount!==Number(payment.amount)||phone!==payment.phone||!receipt)return res.status(400).json({message:'Payment confirmation does not match the pending request'});
  const client=await getClient();try{await client.query('BEGIN');
    const locked=await client.query('SELECT * FROM mpesa_payments WHERE id=? FOR UPDATE',[payment.id]);if(locked.rows[0].status==='completed'){await client.query('ROLLBACK');return res.json({ResultCode:0,ResultDesc:'Accepted'});}
    await client.query("UPDATE mpesa_payments SET status='completed',mpesa_receipt=?,verified_at=NOW(),result_code=0 WHERE id=?",[receipt,payment.id]);
    if(payment.purpose==='subscription')await client.query("UPDATE subscriptions SET status='approved',approved_at=NOW(),start_date=NOW(),end_date=DATE_ADD(NOW(),INTERVAL 30 DAY) WHERE business_id=? AND checkout_request_id=? AND amount=? AND status='pending'",[payment.business_id,payment.transaction_id,amount]);
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  const{rows:[confirmed]}=await query('SELECT * FROM mpesa_payments WHERE id=?',[payment.id]);
  try{await settleVerified(confirmed);}catch(error){console.error('Verified M-Pesa sale requires recovery:',error.message);}
  res.json({ResultCode:0,ResultDesc:'Accepted'});
}catch(error){next(error);}}
async function getPayments(req,res,next){try{const days=req.query.period==='month'?30:req.query.period==='two-week'?14:7;res.json((await query('SELECT * FROM mpesa_payments WHERE business_id=? AND created_at>=DATE_SUB(NOW(),INTERVAL ? DAY) ORDER BY created_at DESC',[getBusinessId(req),days])).rows);}catch(error){next(error);}}
async function getGroups(req,res,next){try{res.json((await query("SELECT price_group,COUNT(*) count,SUM(amount) total FROM mpesa_payments WHERE business_id=? AND status='completed' GROUP BY price_group",[getBusinessId(req)])).rows);}catch(error){next(error);}}
async function getStatus(req,res,next){try{const{rows:[payment]}=await query('SELECT transaction_id,status,reference_id,verified_at,amount FROM mpesa_payments WHERE transaction_id=? AND business_id=?',[req.params.id,getBusinessId(req)]);if(!payment)return res.status(404).json({message:'Payment not found'});res.json(payment);}catch(error){next(error);}}
async function recover(req,res,next){try{const{rows:[payment]}=await query('SELECT * FROM mpesa_payments WHERE id=? AND business_id=?',[req.params.id,getBusinessId(req)]);if(!payment)return res.status(404).json({message:'Payment not found'});const documentId=await settleVerified(payment);res.json({recovered:true,documentId});}catch(error){next(error);}}
module.exports={stkPush,callback,getPayments,getGroups,getStatus,recover};
