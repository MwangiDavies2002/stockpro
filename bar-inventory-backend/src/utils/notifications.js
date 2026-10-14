const {query}=require('../config/db');
const {currentBusinessId}=require('./tenant');
async function save(type,title,message,businessId){
  try{await query('INSERT INTO notifications(business_id,type,title,message) VALUES (?,?,?,?)',[businessId||currentBusinessId(),type,title,message]);}
  catch(error){console.error('Could not save application notification:',error.message);}
}
async function sendLowStockAlert(item){
  return save('stock',`Low stock: ${item.name}`,`${item.stock} ${item.unit||'units'} left; threshold ${item.threshold}`,item.business_id);
}
async function sendOrderStatusUpdate(order,status){return save('order',`Order #${order.id}`,`Order status: ${status}`,order.business_id);}
module.exports={sendLowStockAlert,sendOrderStatusUpdate};
