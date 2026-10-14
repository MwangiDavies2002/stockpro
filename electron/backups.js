const fs=require('node:fs');
const path=require('node:path');
const Database=require('./native-db');
function validateBackup(source){
  const candidate=new Database(source,{readonly:true,fileMustExist:true});
  try{
    if(candidate.pragma('integrity_check',{simple:true})!=='ok')throw new Error('Backup integrity check failed');
    for(const name of ['users','inventory_items','sales','sale_items'])if(!candidate.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name))throw new Error('This is not a StockPro backup');
  }finally{candidate.close();}
}
async function exportBackup(db,destination){await db.backup(destination);validateBackup(destination);return destination;}
async function restoreBackup(db,root,source){
  validateBackup(source);
  const folder=path.resolve(root),target=path.join(folder,'data','stockpro.sqlite'),backupDir=path.join(folder,'backups');
  if(path.resolve(source)===target)throw new Error('Choose a separate backup file');
  fs.mkdirSync(backupDir,{recursive:true});const recovery=path.join(backupDir,`before-restore-${Date.now()}.sqlite`);
  await exportBackup(db,recovery);
  const stage=path.join(folder,'data','restore-staged.sqlite');
  const candidate=new Database(source,{readonly:true,fileMustExist:true});
  try{await candidate.backup(stage);}finally{candidate.close();}
  validateBackup(stage);
  db.pragma('wal_checkpoint(TRUNCATE)');db.close();
  for(const suffix of ['-wal','-shm'])if(fs.existsSync(target+suffix))fs.unlinkSync(target+suffix);
  try{fs.renameSync(target,target+'.before-restore');fs.renameSync(stage,target);const reopened=require('./db').openDatabase(folder);fs.unlinkSync(target+'.before-restore');return{db:reopened,recovery};}
  catch(error){if(fs.existsSync(target+'.before-restore')){if(fs.existsSync(target))fs.unlinkSync(target);fs.renameSync(target+'.before-restore',target);}throw error;}
}
module.exports={validateBackup,exportBackup,restoreBackup};
