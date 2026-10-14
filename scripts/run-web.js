const path=require('node:path');
const {spawn}=require('node:child_process');
const command=process.argv[2];
if(!['dev','build','start'].includes(command))throw new Error('Use dev, build or start');
const root=path.resolve(__dirname,'../bar-inventory-system');
const child=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),command,...process.argv.slice(3)],{
  cwd:root,env:{...process.env,STOCKPRO_DESKTOP_BUILD:'0'},stdio:'inherit',windowsHide:true,
});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
