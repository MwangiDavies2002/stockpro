const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {openDatabase}=require('../electron/db');
const {exportBackup,restoreBackup,validateBackup}=require('../electron/backups');
(async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'stockpro-backup-audit-'));
  let db=openDatabase(root);
  try{
    db.prepare("INSERT INTO inventory_items(name,category,unit,stock,threshold,cost,price,location_id,business_id) VALUES ('Backup original','','Pieces',5,0,10,20,1,1)").run();
    const file=path.join(root,'snapshot.sqlite');await exportBackup(db,file);
    db.prepare("UPDATE inventory_items SET stock=99").run();
    const restored=await restoreBackup(db,root,file);db=restored.db;
    assert.equal(db.prepare('SELECT stock FROM inventory_items').get().stock,5);
    validateBackup(restored.recovery);
    const Database=require('better-sqlite3');const recovery=new Database(restored.recovery,{readonly:true});
    assert.equal(recovery.prepare('SELECT stock FROM inventory_items').get().stock,99);recovery.close();
    const invalid=path.join(root,'invalid.sqlite');fs.writeFileSync(invalid,'not a database');
    assert.throws(()=>validateBackup(invalid));
    assert.equal(db.prepare('SELECT stock FROM inventory_items').get().stock,5);
    console.log('Backup export, restore, recovery and invalid-file rejection passed');
  }finally{if(db.open)db.close();if(root.startsWith(path.join(os.tmpdir(),'stockpro-backup-audit-')))fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
