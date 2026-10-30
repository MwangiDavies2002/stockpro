const {app,BrowserWindow,ipcMain,dialog,shell}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {openDatabase,apiRequest}=require('./db');
const {authenticate}=require('./desktop-api');
const {serveRenderer}=require('./renderer-server');
const {exportBackup,restoreBackup}=require('./backups');
let db,backupTimer,shiftTimer,renderer,restoring=false;
const dataRoot=()=>process.env.STOCKPRO_DATA_DIR||(app.isPackaged?app.getPath('userData'):path.join(app.getAppPath(),'stockpro-user-data'));
function trusted(event){if(!renderer||new URL(event.senderFrame.url).origin!==renderer.url)throw new Error('Untrusted request origin');}
function admin(authorization){const user=authenticate(db,authorization);if(user.supportSession||!user.is_owner)throw new Error('Only the business owner can back up or restore the database');}
function createWindow(){const win=new BrowserWindow({width:1440,height:900,show:process.env.STOCKPRO_AUDIT_MODE!=='1',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==renderer.url)event.preventDefault();});win.loadURL(renderer.url);return win;}
app.whenReady().then(async()=>{
  const root=dataRoot();db=openDatabase(root);renderer=await serveRenderer(path.join(__dirname,'../bar-inventory-system/out'));
  const sweepShifts=()=>{if(restoring)return;try{require('./shifts').sweep(db);}catch(error){console.error('Automatic shift closure failed:',error.message);}};sweepShifts();shiftTimer=setInterval(sweepShifts,60_000);
  ipcMain.handle('api:request',async(event,request)=>{try{trusted(event);if(restoring)throw new Error('Database restore is in progress');return await apiRequest(db,request);}catch(error){return{__stockproError:true,message:error.message,status:error.status||400};}});
  ipcMain.handle('share:whatsapp',async(event,authorization,text)=>{trusted(event);const user=authenticate(db,authorization);await require('./share-report').shareWhatsApp(user,text,url=>shell.openExternal(url));});
  ipcMain.handle('share:document-whatsapp',async(event,authorization,phone,text,kind)=>{trusted(event);const user=authenticate(db,authorization);await require('./share-report').shareDocumentWhatsApp(user,phone,text,kind,url=>shell.openExternal(url));});
  ipcMain.handle('backup:export',async(event,authorization)=>{trusted(event);admin(authorization);const target=await dialog.showSaveDialog({defaultPath:'stockpro-backup.sqlite',filters:[{name:'SQLite backup',extensions:['sqlite']}]});if(target.canceled||!target.filePath)return null;return exportBackup(db,target.filePath);});
  ipcMain.handle('backup:restore',async(event,authorization)=>{
    trusted(event);admin(authorization);const selected=await dialog.showOpenDialog({properties:['openFile'],filters:[{name:'StockPro backup',extensions:['sqlite']}]});if(selected.canceled)return null;
    const confirm=await dialog.showMessageBox({type:'warning',buttons:['Cancel','Restore backup'],defaultId:0,cancelId:0,message:'Restore this backup?',detail:'Current records will be replaced. A recovery backup is saved first. You will need to sign in again.'});if(confirm.response!==1)return null;
    restoring=true;try{const result=await restoreBackup(db,root,selected.filePaths[0]);db=result.db;return{restored:true,recovery:result.recovery};}catch(error){if(!db.open)db=openDatabase(root);throw error;}finally{restoring=false;}
  });
  const backupDir=path.join(root,'backups');fs.mkdirSync(backupDir,{recursive:true});backupTimer=setInterval(async()=>{if(restoring)return;try{await exportBackup(db,path.join(backupDir,`stockpro-${Date.now()}.sqlite`));const files=fs.readdirSync(backupDir).filter(file=>/^stockpro-\d+\.sqlite$/.test(file)).sort();for(const file of files.slice(0,-30))fs.unlinkSync(path.join(backupDir,file));}catch(error){console.error('Automatic backup failed:',error.message);}},6*60*60*1000);
  const window=createWindow();if(process.env.STOCKPRO_AUDIT_MODE==='1'){window.webContents.once('did-finish-load',()=>{console.log('DESKTOP_RENDERER_READY');app.quit();});window.webContents.once('did-fail-load',(_event,code,description)=>{console.error(code,description);app.exit(1);});}
  app.on('activate',()=>{if(!BrowserWindow.getAllWindows().length)createWindow();});
}).catch(error=>{console.error(error.message);app.exit(1);});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
app.on('will-quit',()=>{clearInterval(backupTimer);clearInterval(shiftTimer);renderer?.server.close();if(db?.open)db.close();});
