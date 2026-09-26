import assert from 'node:assert/strict';
import http from 'node:http';
import {servePublicFile} from '../backend/public-files.mjs';
import {readFile} from 'node:fs/promises';
const file=new URL('../site/assets/films/facade-survey.mp4',import.meta.url).pathname,bytes=await readFile(file);
const server=http.createServer((req,res)=>{servePublicFile(req,res,file,{'.mp4':'video/mp4'}).catch(()=>{res.statusCode=500;res.end();});});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
try{
 let r=await fetch(url,{headers:{Range:'bytes=10-109'}});assert.equal(r.status,206);assert.equal(r.headers.get('content-type'),'video/mp4');assert.equal(r.headers.get('content-range'),`bytes 10-109/${bytes.length}`);assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes.subarray(10,110));
 r=await fetch(url,{headers:{Range:'bytes=-20'}});assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes.subarray(-20));
 for(const range of ['bytes=999999999-','bytes=0-1,5-8','bytes=-0','bytes=abc-'])assert.equal((await fetch(url,{headers:{Range:range}})).status,416);
 r=await fetch(url,{method:'HEAD',headers:{Range:'bytes=0-9'}});assert.equal(r.status,206);assert.equal(r.headers.get('content-length'),'10');assert.equal((await r.arrayBuffer()).byteLength,0);
 r=await fetch(url,{headers:{Range:'bytes=0-9','If-Range':'"other"'}});assert.equal(r.status,200);assert.equal((await r.arrayBuffer()).byteLength,bytes.length);
 console.log('PASS v12: real film byte ranges, suffix ranges, malformed/out-of-bounds, HEAD and If-Range');
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
