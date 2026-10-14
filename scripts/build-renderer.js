const {spawnSync}=require('node:child_process');
const path=require('node:path');
const root=path.join(__dirname,'../bar-inventory-system');
const result=spawnSync(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'build'],{cwd:root,env:{...process.env,STOCKPRO_DESKTOP_BUILD:'1'},stdio:'inherit',windowsHide:true});
process.exitCode=result.status??1;
