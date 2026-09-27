import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {servePublicFile} from '../backend/public-files.mjs';
const root=await mkdtemp(path.join(tmpdir(),'facade-cache13-')),body='body{color:#123456}',digest=createHash('sha256').update(body).digest('hex').slice(0,16);
await mkdir(path.join(root,'bundles'));for(const name of ['styles.css','bundles/site-'+digest+'.css','bundles/site-0000000000000000.css'])await writeFile(path.join(root,name),body);
const server=http.createServer((req,res)=>servePublicFile(req,res,path.join(root,req.url.slice(1)),{'.css':'text/css'}).catch(()=>{res.statusCode=500;res.end();}));
await new Promise(r=>server.listen(0,'127.0.0.1',r));
try {
  const base='http://127.0.0.1:'+server.address().port;
  for(const name of ['styles.css','bundles/site-0000000000000000.css'])assert.equal((await fetch(base+'/'+name)).headers.get('cache-control'),'no-cache');
  const result=await fetch(base+'/bundles/site-'+digest+'.css');assert.match(result.headers.get('cache-control'),/immutable/);
  assert.equal((await fetch(base+'/bundles/site-'+digest+'.css',{headers:{'If-None-Match':result.headers.get('etag')}})).status,304);
  console.log('PASS v13 caching: only verified content-hash bundles are immutable; regular/misnamed files revalidate and ETag still works');
} finally {server.closeAllConnections();await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});}
