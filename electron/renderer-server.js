const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
function serveRenderer(root){
  const absolute=path.resolve(root);
  const server=http.createServer((req,res)=>{
    try{
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      const candidate=path.resolve(absolute,'.'+pathname);
      if(candidate!==absolute&&!candidate.startsWith(absolute+path.sep)){res.writeHead(403);res.end();return;}
      let file=candidate;
      if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
      if(!fs.existsSync(file)&&fs.existsSync(candidate+'.html'))file=candidate+'.html';
      if(!fs.existsSync(file)){res.writeHead(404);res.end('Not found');return;}
      const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.txt':'text/plain','.woff2':'font/woff2'};
      res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});fs.createReadStream(file).pipe(res);
    }catch(error){res.writeHead(400);res.end('Invalid request');}
  });
  return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve({server,url:`http://127.0.0.1:${server.address().port}`}));});
}
module.exports={serveRenderer};
