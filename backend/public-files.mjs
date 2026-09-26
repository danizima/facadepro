import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
const cached=new Map();let cachedBytes=0;
function gzipAllowed(value){
 const entries=String(value||'').toLowerCase().split(',').map(s=>s.trim().split(';'));
 const entry=entries.find(e=>e[0]==='gzip')||entries.find(e=>e[0]==='*');
 if(!entry)return false;const q=entry.slice(1).map(s=>s.trim()).find(s=>s.startsWith('q='));
 return q===undefined||Number(q.slice(2))>0;
}
export async function servePublicFile(req,res,file,types,extra={}){
 let info;try{info=await stat(file);if(!info.isFile())return false;}catch{return false;}
 const text=/\.(?:html|css|js|svg|xml|txt)$/.test(file),stamp=info.mtimeMs+':'+info.size;
 let entry=cached.get(file);
 if(!entry||entry.stamp!==stamp){
  let bytes;try{bytes=await readFile(file);}catch{return false;}
  entry={stamp,bytes,gzip:text&&bytes.length>1000?gzipSync(bytes,{level:6}):null};
  entry.tag='"'+createHash('sha256').update(bytes).digest('hex').slice(0,24)+'"';
  if(text&&bytes.length<1024*1024){
   if(cached.has(file)){const old=cached.get(file);cachedBytes-=old.bytes.length+(old.gzip?.length||0);cached.delete(file);}
   cached.set(file,entry);cachedBytes+=entry.bytes.length+(entry.gzip?.length||0);
   while(cached.size>40||cachedBytes>8*1024*1024){const oldest=cached.keys().next().value,old=cached.get(oldest);cachedBytes-=old.bytes.length+(old.gzip?.length||0);cached.delete(oldest);}
  }
 }
 const compressed=!!entry.gzip&&gzipAllowed(req.headers['accept-encoding']);
 const bytes=compressed?entry.gzip:entry.bytes,tag=compressed?entry.tag.slice(0,-1)+'-gz"':entry.tag;
 const immutable=/\/bundles\/[a-z]+-[a-f0-9]{16}\.(css|js)$/.test(file);
 const headers={'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':immutable?'public, max-age=31536000, immutable':'no-cache','Vary':'Accept-Encoding',...extra};
 if(compressed)headers['Content-Encoding']='gzip';
 if(headers['Cache-Control']!=='no-store'){
  headers.ETag=tag;
  if(String(req.headers['if-none-match']||'').split(',').map(s=>s.trim().replace(/^W\//,'')).some(t=>t===tag||t==='*')){res.writeHead(304,headers);res.end();return true;}
 }
 const range=req.headers.range;
 if(/\.(?:mp4|webm)$/.test(file)){
  headers['Accept-Ranges']='bytes';
  if(range&&(!req.headers['if-range']||req.headers['if-range']===tag)){
   const match=/^bytes=(\d*)-(\d*)$/.exec(range);let start=0,end=bytes.length-1;
   if(match&&(match[1]||match[2])){
    if(!match[1])start=Math.max(0,bytes.length-Number(match[2]));
    else{start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
   }else start=NaN;
   if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=bytes.length||end<start){res.writeHead(416,{...headers,'Content-Range':'bytes */'+bytes.length,'Content-Length':0});res.end();return true;}
   const chunk=bytes.subarray(start,end+1);res.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${bytes.length}`,'Content-Length':chunk.length});res.end(req.method==='HEAD'?undefined:chunk);return true;
  }
 }
 headers['Content-Length']=bytes.length;res.writeHead(200,headers);res.end(req.method==='HEAD'?undefined:bytes);return true;
}
