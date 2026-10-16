const policy=require('../bar-inventory-backend/src/utils/accessPolicy');
async function shareWhatsApp(user,text,openExternal){policy.assertAccess(user.access,'/reports/stock-overview','get');if(!user.access.permissions.reports?.export)throw new Error('Your role cannot export reports');if(typeof text!=='string'||!text.trim()||text.length>8000)throw new Error('Enter a report summary up to 8000 characters');await openExternal('https://wa.me/?text='+encodeURIComponent(text));}
module.exports={shareWhatsApp};
