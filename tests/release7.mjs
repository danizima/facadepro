import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
const root=new URL('../',import.meta.url).pathname,temp=await mkdtemp(path.join(os.tmpdir(),'facadepro-v7-'));
const port=18747,base='http://127.0.0.1:'+port;
const env={...process.env,DATA_DIR:temp,PORT:String(port),PUBLIC_URL:base,NODE_ENV:'test',SMTP_HOST:'',SMTP_FROM:'',TELEGRAM_BOT_TOKEN:'',TELEGRAM_CHAT_ID:''};
let server,log='',cookie='',csrf='';
function command(args,extra={}){return new Promise((resolve,reject)=>{const p=spawn(process.execPath,args,{cwd:root,env:{...env,...extra}});let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('close',code=>code?reject(Error(err)):resolve(out));});}
async function start(){server=spawn(process.execPath,['server.mjs'],{cwd:root,env});server.stdout.on('data',x=>log+=x);server.stderr.on('data',x=>log+=x);for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok)return;}catch{}await delay(50);}throw Error(log);}
async function stop(){if(!server)return;await new Promise(r=>{server.once('close',r);server.kill('SIGTERM');});server=null;}
async function call(route,{method='GET',body,auth=true,csrfToken=csrf,form=false}={}){const headers={};if(method!=='GET')headers.Origin=base;if(auth){headers.Cookie=cookie;headers['X-CSRF-Token']=csrfToken;}if(body&&!form)headers['Content-Type']='application/json';return fetch(base+route,{method,headers,body:body?(form?body:JSON.stringify(body)):undefined});}
async function ok(r,status=200){assert.equal(r.status,status,await r.clone().text());return r.json();}
try{
 const admin=await command(['scripts/create-admin.mjs','tester']),password=admin.match(/Одноразовая выдача пароля: (.+)/)[1];await start();
 assert.equal((await call('/healthz',{auth:false})).status,200);
 const login=await call('/api/admin/login',{method:'POST',body:{username:'tester',password},auth:false});cookie=login.headers.get('set-cookie').split(';')[0];csrf=(await ok(login)).csrf;
 const cb={name:'Тест',phone:'+7 999 000 00 00',preferredTime:'После 14:00, Москва',consent:'yes',website:'',idempotency:randomUUID(),sourcePage:'/contacts.html'};
 assert.equal((await call('/api/callback',{method:'POST',body:{...cb,consent:'no'},auth:false})).status,422);
 assert.equal((await call('/api/callback',{method:'POST',body:{...cb,phone:'bad'},auth:false})).status,422);
 const first=await ok(await call('/api/callback',{method:'POST',body:cb,auth:false}),201),again=await ok(await call('/api/callback',{method:'POST',body:cb,auth:false}));assert.equal(first.reference,again.reference);
 const lead=(await ok(await call('/api/admin/leads'))).rows[0];assert.equal(lead.kind,'callback');assert.equal(lead.payload.preferredTime,cb.preferredTime);assert.equal(lead.payload.sourcePage,'/contacts.html');
 assert.equal((await call('/api/callback',{method:'POST',body:{...cb,name:'Changed'},auth:false})).status,409);
 let c=await ok(await call('/api/admin/content'));const video=Buffer.from([0,0,0,24,102,116,121,112,105,115,111,109,0,0,0,1]);
 async function upload(bytes,name){const body=new FormData();body.append('files',new Blob([bytes]),name);return ok(await call('/api/admin/materials/upload',{method:'POST',body,form:true}),201);}
 const pdf=await upload(Buffer.from('%PDF-1.4\nTest only\n%%EOF'),'test.pdf');
 assert.equal((await call(pdf.url,{auth:false})).status,404);assert.equal((await call(pdf.url)).status,200);
 const row={id:'qa-document',kind:'document',title:'REAL-DOC-TEST',text:'Описание <script>alert(1)</script>',author:'Компания',date:'2026-09-24',project:'museum',poster:'',file:pdf.key,published:true,confirmed:false};
 assert.equal((await call('/api/admin/content',{method:'PUT',body:{...c,materials:[row]}})).status,422);
 c=await ok(await call('/api/admin/content',{method:'PUT',body:{...c,materials:[{...row,confirmed:true}]}}));
 assert.equal((await call(pdf.url,{auth:false})).status,200);
 const home=await(await call('/',{auth:false})).text();assert.ok(home.includes('REAL-DOC-TEST'));assert.ok(!home.includes('<script>alert(1)</script>'));
 const film=await upload(video,'test.mp4');c=await ok(await call('/api/admin/content',{method:'PUT',body:{...c,materials:[...c.materials,{...row,id:'qa-video',kind:'video',title:'Видео',poster:'museum-facade',file:film.key,confirmed:true}]}}));
 const ranged=await fetch(base+film.url,{headers:{Range:'bytes=4-7'}});assert.equal(ranged.status,206);assert.equal(await ranged.text(),'ftyp');assert.equal(ranged.headers.get('content-range'),'bytes 4-7/16');
 assert.equal((await fetch(base+film.url,{headers:{Range:'bytes=999-'}})).status,416);
 c.projects.find(p=>p.id==='museum').published=false;c=await ok(await call('/api/admin/content',{method:'PUT',body:c}));
 assert.equal((await call(pdf.url,{auth:false})).status,404);assert.equal((await call(film.url,{auth:false})).status,404);assert.ok(!(await ok(await call('/api/public/projects',{auth:false}))).projects.some(p=>p.id==='museum'));
 assert.equal((await call('/api/callback',{method:'POST',body:{...cb,idempotency:randomUUID(),comparedProjects:'museum'},auth:false})).status,422);
 assert.equal((await call('/compare.html',{auth:false})).status,200);
 await stop();await start();assert.equal((await ok(await call('/api/admin/content'))).materials.length,2);assert.equal((await ok(await call('/api/admin/leads'))).rows[0].kind,'callback');
 console.log('PASS v7: callback validation/idempotency/persistence, materials permissions/publication/escaping, video ranges, hidden project exclusion and comparison data');
}catch(err){console.error(err);console.error(log.slice(-1000));process.exitCode=1;}finally{await stop();await rm(temp,{recursive:true,force:true});}
