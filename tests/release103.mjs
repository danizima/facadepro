import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

const root=new URL('../',import.meta.url).pathname,data=await mkdtemp(path.join(tmpdir(),'facadepro-v103-')),base='http://127.0.0.1:18750';
const messages=[];
const smtp=net.createServer(socket=>{
  socket.write('220 localhost test\r\n');let buffer='',inData=false,message='';
  socket.on('data',chunk=>{buffer+=chunk.toString();while(buffer.includes('\r\n')){
    const i=buffer.indexOf('\r\n'),line=buffer.slice(0,i);buffer=buffer.slice(i+2);
    if(inData){if(line==='.'){messages.push(message);message='';inData=false;socket.write('250 stored\r\n');}else message+=line+'\n';continue;}
    if(/^EHLO|^HELO/i.test(line))socket.write('250 localhost\r\n');
    else if(line.toUpperCase()==='DATA'){inData=true;socket.write('354 send\r\n');}
    else if(line.toUpperCase()==='QUIT')socket.end('221 bye\r\n');
    else socket.write('250 OK\r\n');
  }});
});
await new Promise(resolve=>smtp.listen(0,'127.0.0.1',resolve));
const env={...process.env,DATA_DIR:data,PORT:'18750',PUBLIC_URL:base,NODE_ENV:'test',SMTP_HOST:'127.0.0.1',SMTP_PORT:String(smtp.address().port),SMTP_SECURITY:'local-test',SMTP_FROM:'site@example.com',SMTP_USER:'',SMTP_PASSWORD:'',LEAD_TO:'manager@example.com',TELEGRAM_BOT_TOKEN:'',TELEGRAM_CHAT_ID:''};
const admin=spawnSync(process.execPath,['scripts/create-admin.mjs','tester103'],{cwd:root,env,encoding:'utf8'});assert.equal(admin.status,0);
const password=admin.stdout.match(/Одноразовая выдача пароля: (.+)/)[1];
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env,stdio:['ignore','ignore','pipe']});let log='',cookie='',csrf='';server.stderr.on('data',value=>log+=value);
async function call(route,{method='GET',body,auth=false,form=false,origin=base}={}){
  const headers={};if(method!=='GET')headers.Origin=origin;if(auth){headers.Cookie=cookie;headers['X-CSRF-Token']=csrf;}if(body&&!form)headers['Content-Type']='application/json';
  return fetch(base+route,{method,headers,body:body?(form?body:JSON.stringify(body)):undefined});
}
async function ok(response,status=200){assert.equal(response.status,status,await response.clone().text());return response.json();}
const bytes=await readFile(path.join(root,'site/assets/museum-small.webp'));
const payload={phone:'+7 999 000 00 00',email:'customer@example.com',comment:'PHOTO-INTEGRATION-TEST',consent:'yes',website:'',idempotency:randomUUID(),sourcePage:'/projects/museum.html'};
function photo(overrides={},files=[{bytes,name:'Фасад.webp'}]){const form=new FormData();for(const [key,value] of Object.entries({...payload,...overrides}))form.set(key,value);for(const file of files)form.append('files',new Blob([file.bytes]),file.name);return form;}
const submit=(body,options={})=>call('/api/photo-request',{method:'POST',body,form:true,...options});
try{
  for(let i=0;i<120;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}if(i===119)throw Error(log);await delay(50);}
  assert.equal((await ok(await call('/api/public/config'))).photoRequests,true);
  const login=await call('/api/admin/login',{method:'POST',body:{username:'tester103',password}});cookie=login.headers.get('set-cookie').split(';')[0];csrf=(await ok(login)).csrf;
  assert.equal((await submit(photo(),{origin:'https://other.example'})).status,403);
  assert.equal((await submit(photo({},[]))).status,422,'a photo is required');
  assert.equal((await submit(photo({consent:'no'}))).status,422);
  assert.equal((await submit(photo({phone:'broken'}))).status,422);
  assert.equal((await submit(photo({},[{bytes:Buffer.from('%PDF-1.4'),name:'plan.pdf'}]))).status,422,'only photos');
  assert.equal((await submit(photo({},[{bytes:Buffer.from('<script>bad</script>'),name:'fake.webp'}]))).status,422,'validate signatures');
  assert.equal((await submit(photo({},Array.from({length:6},(_,i)=>({bytes,name:i+'.webp'}))))).status,422,'file count');
  const first=await ok(await submit(photo()),201),again=await ok(await submit(photo()));assert.equal(first.reference,again.reference,'retry reuses the receipt');
  assert.equal((await submit(photo({comment:'Changed'}))).status,409,'same key cannot silently overwrite');
  const leads=await ok(await call('/api/admin/leads',{auth:true}));assert.equal(leads.total,1);assert.equal(leads.rows[0].kind,'photo');assert.equal(leads.rows[0].payload.sourcePage,payload.sourcePage);
  const detail=await ok(await call('/api/admin/leads/'+leads.rows[0].id,{auth:true}));assert.equal(detail.files.length,1);
  assert.equal((await call('/api/admin/files/'+detail.files[0].id)).status,401);
  assert.equal((await call('/uploads/'+detail.files[0].id)).status,404);
  const download=await call('/api/admin/files/'+detail.files[0].id,{auth:true});assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),bytes);
  for(let i=0;i<80&&messages.length<2;i++)await delay(50);
  assert.equal(messages.length,2);assert.ok(messages.some(m=>m.includes('To: manager@example.com')&&m.includes(first.reference)));assert.ok(messages.some(m=>m.includes('To: customer@example.com')&&m.includes(first.reference)));
  let cfg=await ok(await call('/api/admin/notifications',{auth:true}));assert.equal(cfg.timewebPreset.smtpHost,'smtp.timeweb.ru');assert.equal(cfg.timewebPreset.smtpUser,'office@facadepro.ru');
  assert.equal((await call('/api/admin/notifications',{method:'PUT',auth:true,body:{...cfg,...cfg.timewebPreset,emailEnabled:true,smtpPassword:''}})).status,422,'Timeweb cannot be enabled without its password');
  await ok(await call('/api/admin/notifications/test',{method:'POST',auth:true,body:{channel:'email'}}));assert.equal(messages.length,3,'saved configuration test uses the local SMTP only');
  const source=await ok(await call('/api/admin/content',{auth:true}));
  let page=await(await call('/projects/brusnika.html')).text();assert.equal([...page.matchAll(/class="building-item"/g)].length,5);assert.match(page,/Дом №7/);
  source.projects.find(p=>p.id==='lider').case.solution='Редакционная правка <script>alert(1)</script>';
  await ok(await call('/api/admin/content',{method:'PUT',auth:true,body:source}));page=await(await call('/projects/lider.html')).text();assert.ok(!page.includes('class="building-item"'));assert.ok(page.includes('Редакционная правка &lt;script&gt;'));assert.ok(!page.includes('<script>alert(1)</script>'));
  console.log('PASS 10.3: photo validation, privacy, retry safety, local SMTP manager/receipt delivery, Timeweb missing-password guard and editable building scopes');
}catch(error){console.error(error);console.error(log.slice(-1200));process.exitCode=1;}
finally{const stopped=new Promise(resolve=>server.once('close',resolve));server.kill('SIGTERM');await stopped;await new Promise(resolve=>smtp.close(resolve));await rm(data,{recursive:true,force:true});}
