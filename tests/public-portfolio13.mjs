import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import net from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {createPublicPortfolio} from '../backend/public-portfolio.mjs';

// Coalesce concurrent requests, cap the public selection, and discard a render
// if an editor changes visibility before it completes.
let current={revision:1,settings:{},projects:Array.from({length:25},(_,i)=>({id:String(i),published:i!==0}))};
let calls=0,release;
const publicPDF=createPublicPortfolio({readContent:()=>structuredClone(current),version:'test',generate:async job=>{
  calls++;assert.equal(job.projects.length,20);assert.equal(job.projects[0].id,'1');assert.equal(job.recipient,'');
  if(calls===1)await new Promise(resolve=>release=resolve);
  return Buffer.from('PDF '+calls);
}});
const first=publicPDF(),second=publicPDF();await delay(0);assert.equal(calls,1);release();assert.deepEqual(await first,await second);await publicPDF();assert.equal(calls,1);
current.revision++;await publicPDF();assert.equal(calls,2,'revision invalidates cache');
let race={revision:1,projects:[{id:'old',published:true}],settings:{}},resume,renders=0;
const racePDF=createPublicPortfolio({readContent:()=>structuredClone(race),version:'test',generate:async job=>{renders++;if(renders===1)await new Promise(resolve=>resume=resolve);return Buffer.from(job.projects.map(p=>p.id).join(','));}});
const racing=racePDF();await delay(0);race={revision:2,settings:{},projects:[{id:'old',published:false},{id:'new',published:true}]};resume();assert.equal((await racing).toString(),'new');
let failureRevision=1;
const failing=createPublicPortfolio({readContent:()=>({revision:failureRevision,settings:{},projects:[{id:'x'}]}),version:'test',generate:async()=>{if(failureRevision>1)throw Error('test renderer failure');return Buffer.from('old');}});
await failing();failureRevision++;await assert.rejects(failing,/renderer failure/,'no cached old fallback after rendering fails');

const root=new URL('../',import.meta.url).pathname,dir=await mkdtemp(path.join(tmpdir(),'facade-public-portfolio13-'));
const allocator=net.createServer();await new Promise(resolve=>allocator.listen(0,'127.0.0.1',resolve));const port=allocator.address().port;await new Promise(resolve=>allocator.close(resolve));
const base='http://127.0.0.1:'+port;
let child,exit,writer,log='';
try {
  child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,DATA_DIR:dir,PORT:String(port),PUBLIC_URL:base,NODE_ENV:'test',BACKUP_ENABLED:'false',SMTP_HOST:'',SMTP_FROM:'',SMTP_PASSWORD:'',TELEGRAM_BOT_TOKEN:'',TELEGRAM_CHAT_ID:''},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',chunk=>log+=chunk);child.stderr.on('data',chunk=>log+=chunk);child.once('exit',(code,signal)=>exit={code,signal});
  let ready=false;
  for(let i=0;i<300;i++){if(exit)throw Error('Test server exited');try{if((await fetch(base+'/healthz')).ok){ready=true;break;}}catch{}await delay(100);}
  assert.ok(ready,'test server ready');
  const extract=async bytes=>{
    const file=path.join(dir,'response.pdf');await writeFile(file,bytes);
    const result=spawnSync('pdftotext',['-layout',file,'-'],{encoding:'utf8'});assert.equal(result.status,0,'pdftotext must extract generated PDF');return result.stdout.replace(/\s+/g,' ').trim();
  };
  const route=base+'/downloads/portfolio.pdf';
  let response=await fetch(route);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/application\/pdf/);assert.equal(response.headers.get('cache-control'),'no-cache');
  const originalETag=response.headers.get('etag'),pdf=Buffer.from(await response.arrayBuffer());assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
  const initialText=await extract(pdf),seed=JSON.parse(await readFile(path.join(root,'source/content.json'),'utf8'));
  const burny=seed.projects.find(p=>p.id==='burny');assert.ok(burny.case.result);assert.ok(initialText.includes(burny.case.result.replace(/\s+/g,' ').trim()),'GET full portfolio includes the current v13 case result');
  response=await fetch(route,{method:'HEAD'});assert.equal(response.status,200);assert.equal(Number(response.headers.get('content-length')),pdf.length);assert.equal(response.headers.get('etag'),originalETag);assert.equal((await response.arrayBuffer()).byteLength,0);
  assert.equal((await fetch(route,{headers:{'If-None-Match':originalETag}})).status,304);
  writer=new DatabaseSync(path.join(dir,'facadepro.sqlite'));writer.exec('PRAGMA busy_timeout=5000');
  const saved=JSON.parse(writer.prepare('SELECT json FROM content WHERE id=1').get().json);
  const marker='Подтверждённый редактором новый результат проекта.';
  saved.projects.find(p=>p.id==='burny').case.result=marker;
  const hidden=saved.projects.find(p=>p.id==='golden-horn'),oldTitle=hidden.title;hidden.title='PRIVATE PROJECT MUST NOT BE PUBLISHED';hidden.published=false;
  writer.prepare('UPDATE content SET revision=revision+1,json=? WHERE id=1').run(JSON.stringify(saved));
  response=await fetch(route,{headers:{'If-None-Match':originalETag}});assert.equal(response.status,200);assert.notEqual(response.headers.get('etag'),originalETag);
  const editedText=await extract(Buffer.from(await response.arrayBuffer()));assert.ok(editedText.includes(marker));assert.ok(!editedText.includes('PRIVATE PROJECT'));assert.ok(!editedText.includes(oldTitle),'hidden project excluded from regenerated full portfolio');
  saved.projects.forEach(project=>project.published=false);writer.prepare('UPDATE content SET revision=revision+1,json=? WHERE id=1').run(JSON.stringify(saved));
  response=await fetch(route);assert.equal(response.status,404,'no published projects never falls back to old static/cached PDF');assert.match(response.headers.get('content-type'),/application\/json/);
  assert.ok((await response.json()).error);
  writer.close();writer=null;
  console.log('PASS public full portfolio: GET/HEAD searchable current cases, editor revision refresh, hidden exclusion, ETag, coalesced renders, max20, mid-render visibility change and no stale fallback');
} catch(error){console.error(log.slice(-1200));throw error;}
finally {
  writer?.close();
  if(child&&!exit){const ended=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await ended;}
  await rm(dir,{recursive:true,force:true});
}
