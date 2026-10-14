require('dotenv').config({path:require('node:path').join(__dirname,'.env')});
const {query,db}=require('./src/config/db');
(async()=>{
  const keys=['MPESA_CONSUMER_KEY','MPESA_CONSUMER_SECRET','MPESA_SHORTCODE','MPESA_PASSKEY','MPESA_CALLBACK_URL','ETIMS_ENCRYPTION_KEY'];
  console.log(JSON.stringify({environment:keys.map(key=>({key,configured:!!process.env[key]})),storage:'KRA eTIMS settings are stored in businesses.etims_* columns; M-Pesa credentials use the backend environment.'}));
  const {rows}=await query('SELECT id,kra_pin,etims_enabled,etims_api_url,etims_username,etims_password_encrypted,etims_device_serial FROM businesses');
  console.log(JSON.stringify(rows.map(row=>({businessId:row.id,enabled:!!row.etims_enabled,hasKraPin:!!row.kra_pin,hasApiUrl:!!row.etims_api_url,hasUsername:!!row.etims_username,hasSecret:!!row.etims_password_encrypted,hasDeviceSerial:!!row.etims_device_serial}))));
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db.end());
