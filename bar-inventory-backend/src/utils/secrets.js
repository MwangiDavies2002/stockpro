const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
function key(){
  if(process.env.ETIMS_ENCRYPTION_KEY){const value=Buffer.from(process.env.ETIMS_ENCRYPTION_KEY,'hex');if(value.length!==32)throw new Error('ETIMS_ENCRYPTION_KEY must be 64 hexadecimal characters');return value;}
  const file=process.env.INTEGRATION_KEY_PATH||path.join(__dirname,'../../.private/integration.key');
  if(!fs.existsSync(file)){fs.mkdirSync(path.dirname(file),{recursive:true});try{fs.writeFileSync(file,crypto.randomBytes(32),{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;}}
  return fs.readFileSync(file);
}
function encrypt(value){if(!value)return null;const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(),iv);const data=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]);return `enc:v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${data.toString('base64')}`;}
function decrypt(value){if(!value)return null;if(!String(value).startsWith('enc:v1:'))return String(value);const parts=value.split(':'),cipher=crypto.createDecipheriv('aes-256-gcm',key(),Buffer.from(parts[2],'base64'));cipher.setAuthTag(Buffer.from(parts[3],'base64'));return Buffer.concat([cipher.update(Buffer.from(parts[4],'base64')),cipher.final()]).toString('utf8');}
module.exports={encrypt,decrypt};
