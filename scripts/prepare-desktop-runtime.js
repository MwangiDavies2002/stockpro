const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),runtime=path.join(root,'.desktop-runtime');
const version=require('../node_modules/electron/package.json').version;
fs.mkdirSync(runtime,{recursive:true});
fs.writeFileSync(path.join(runtime,'package.json'),JSON.stringify({name:'stockpro-native-runtime',version:'1.0.0',private:true,dependencies:{'better-sqlite3':require('../node_modules/better-sqlite3/package.json').version},devDependencies:{electron:version},build:{electronVersion:version}},null,2));
function run(args){const result=spawnSync(process.execPath,args,{cwd:runtime,stdio:'inherit',windowsHide:true});if(result.status!==0)process.exit(result.status||1);}
const npm=path.resolve(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
if(!fs.existsSync(npm))throw new Error('Cannot locate npm beside Node.js');
run([npm,'install','--omit=dev','--ignore-scripts','--no-audit','--no-fund']);
run([path.join(root,'node_modules/electron-builder/cli.js'),'install-app-deps','--platform','win32','--arch','x64']);
fs.writeFileSync(path.join(runtime,'electron-version'),version);
