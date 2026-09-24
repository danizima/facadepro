import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
const root=new URL('../',import.meta.url).pathname;
const temp=await mkdtemp(path.join(os.tmpdir(),'facadepro-test-'));
const port=18743,base='http://127.0.0.1:'+port;
const received=[];
const smtp=net.createServer(socket=>{socket.write('220 localhost test\r\n');let buffer='',inData=false,message='';socket.on('data',chunk=>{buffer+=chunk.toString();while(buffer.includes('\r\n')){const i=buffer.indexOf('\r\n'),line=buffer.slice(0,i);buffer=buffer.slice(i+2);if(inData){if(line==='.'){received.push(message);message='';inData=false;socket.write('250 stored\r\n');}else message+=line+'\n';continue;}if(/^EHLO|^HELO/.test(line.toUpperCase()))socket.write('250 localhost\r\n');else if(/^MAIL|^RCPT|^RSET/.test(line.toUpperCase()))socket.write('250 OK\r\n');else if(line.toUpperCase()==='DATA'){inData=true;socket.write('354 send\r\n');}else if(line.toUpperCase()==='QUIT'){socket.end('221 bye\r\n');}else socket.write('250 OK\r\n');}});});
await new Promise(r=>smtp.listen(0,'127.0.0.1',r));
const env={...process.env,DATA_DIR:temp,PORT:String(port),PUBLIC_URL:base,SMTP_HOST:'127.0.0.1',SMTP_PORT:String(smtp.address().port),SMTP_SECURITY:'local-test',SMTP_FROM:'site@example.com',LEAD_TO:'manager@example.com',NODE_ENV:'test'};
let server,serverLog='';
function command(args){return new Promise((resolve,reject)=>{const p=spawn(process.execPath,args,{cwd:root,env});let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('close',c=>c?reject(Error(err)):resolve(out));});}
async function start(){server=spawn(process.execPath,['server.mjs'],{cwd:root,env});server.stdout.on('data',x=>serverLog+=x);server.stderr.on('data',x=>serverLog+=x);for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok)return;}catch{}await delay(50);}throw Error('Server did not start: '+serverLog);}
async function stop(){if(!server)return;await new Promise(resolve=>{server.once('close',resolve);server.kill('SIGTERM');});server=null;}
let cookie='',csrf='';
async function call(route,{method='GET',body,auth=false,origin=base,csrfToken=csrf,form=false}={}){const headers={};if(method!=='GET')headers.Origin=origin;if(auth){headers.Cookie=cookie;if(method!=='GET')headers['X-CSRF-Token']=csrfToken;}if(body&&!form)headers['Content-Type']='application/json';const res=await fetch(base+route,{method,headers,body:body?(form?body:JSON.stringify(body)):undefined});return res;}
const data=()=>({kind:'quote',solution:'new',service:['glazing','windows'],object:'Жилой комплекс',city:'Тестовый объект',area:'2500',timing:'В течение 1–3 месяцев',documents:'Есть проект и спецификации',comment:'Проверка <script>alert(1)</script>',name:'Тестовый заказчик',company:'Тестовая компания',email:'client@example.com',phone:'',consent:'yes',idempotency:randomUUID(),sourcePage:'/quote.html',analyticsSession:randomUUID()});
function multipart(payload,{bad=false}={}){const f=new FormData();for(const [key,value] of Object.entries(payload)){if(Array.isArray(value))value.forEach(v=>f.append(key,v));else f.set(key,value);}f.append('files',new Blob([bad?'MZ executable':'%PDF-1.4\nMinimal test attachment\n%%EOF']),bad?'bad.exe':'План.pdf');return f;}
try{
 const admin=await command(['scripts/create-admin.mjs','tester']);const password=admin.match(/Одноразовая выдача пароля: (.+)/)[1];
 await start();
 assert.equal((await call('/api/admin/leads')).status,401,'private leads');
 assert.equal((await call('/data/facadepro.sqlite')).status,404,'database not served');
 assert.equal((await call('/api/admin/login',{method:'POST',body:{username:'tester',password},origin:'https://other.example'})).status,403,'origin blocked');
 const login=await call('/api/admin/login',{method:'POST',body:{username:'tester',password}});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];csrf=(await login.json()).csrf;
 assert.equal((await call('/api/admin/content',{method:'PUT',auth:true,csrfToken:'wrong',body:{}})).status,403,'CSRF blocked');
 const p=data();let bad={...p,consent:'no'};assert.equal((await call('/api/requests',{method:'POST',body:multipart(bad),form:true})).status,422,'consent required');
 assert.equal((await call('/api/requests',{method:'POST',body:multipart(p,{bad:true}),form:true})).status,422,'executable blocked');
 let response=await call('/api/requests',{method:'POST',body:multipart(p),form:true});assert.equal(response.status,201,await response.clone().text());const ref=(await response.json()).reference;
 response=await call('/api/requests',{method:'POST',body:multipart(p),form:true});assert.equal(response.status,200,'retry idempotent');assert.equal((await response.json()).reference,ref);
 response=await call('/api/requests',{method:'POST',body:multipart({...p,city:'Изменённый город'}),form:true});assert.equal(response.status,409,'same key cannot overwrite');
 const list=await (await call('/api/admin/leads',{auth:true})).json();assert.equal(list.total,1);const id=list.rows[0].id;
 const detail=await (await call('/api/admin/leads/'+id,{auth:true})).json();assert.equal(detail.files.length,1);assert.equal(detail.payload.company,p.company);
 const fileId=detail.files[0].id;assert.equal((await call('/api/admin/files/'+fileId)).status,401,'private attachment');response=await call('/api/admin/files/'+fileId,{auth:true});assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/^attachment/);assert.match(await response.text(),/^%PDF-/);
 response=await call('/api/admin/leads/'+id,{method:'PATCH',auth:true,body:{status:'estimate',note:'Готовим предложение',revision:1}});assert.equal(response.status,200);
 assert.equal((await call('/api/admin/leads/'+id,{method:'PATCH',auth:true,body:{status:'won',note:'',revision:1}})).status,409,'stale revision blocked');
 const people=await (await call('/api/admin/staff',{auth:true})).json();assert.deepEqual(people.staff,['tester']);
 const follow=async value=>call('/api/admin/leads/'+id,{method:'PATCH',auth:true,body:{status:'estimate',note:'Проверка следующего шага',revision:2,...value}});
 assert.equal((await follow({assignee:'missing',next_contact:'',next_action:''})).status,422,'unknown owner rejected');
 assert.equal((await follow({assignee:'tester',next_contact:'2026-02-30',next_action:'Позвонить'})).status,422,'invalid date rejected');
 assert.equal((await follow({assignee:'tester',next_contact:'2026-09-23',next_action:''})).status,422,'reminder requires action');
 response=await follow({assignee:'tester',next_contact:'2026-09-22',next_action:'Уточнить чертежи'});assert.equal(response.status,200);
 const dueList=await (await call('/api/admin/leads?due=overdue&today=2026-09-23&assignee=@me',{auth:true})).json();assert.equal(dueList.total,1);assert.equal(dueList.rows[0].assignee,'tester');assert.equal(dueList.reminders.overdue,1);
 assert.equal((await (await call('/api/admin/leads?due=today&today=2026-09-23',{auth:true})).json()).total,0);
 assert.equal((await call('/api/admin/reminders?today=wrong',{auth:true})).status,422);
 const summary=await (await call('/api/admin/reminders?today=2026-09-22&mine=1',{auth:true})).json();assert.equal(summary.todayCount,1);assert.equal(summary.overdue,0);
 assert.equal((await call('/api/portfolio',{method:'POST',body:{projects:[],recipient:''}})).status,422,'PDF requires selection');
 assert.equal((await call('/api/portfolio',{method:'POST',body:{projects:['museum','museum'],recipient:''}})).status,422,'PDF duplicates rejected');
 assert.equal((await call('/api/portfolio',{method:'POST',body:{projects:['missing']}})).status,422,'PDF unknown project rejected');
 assert.equal((await call('/api/portfolio',{method:'POST',body:{projects:['museum'],recipient:'x'.repeat(141)}})).status,422,'PDF name length');
 response=await call('/api/portfolio',{method:'POST',body:{projects:['restaurant','museum'],recipient:'Тест <b>получателя</b>'}});assert.equal(response.status,200,await response.clone().text());assert.match(response.headers.get('content-type'),/application\/pdf/);const pdf=Buffer.from(await response.arrayBuffer());assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.ok(pdf.length>50000);
 for(const page of ['/map.html','/solutions.html','/portfolio.html'])assert.equal((await call(page)).status,200);
 for(const event of ['page_view','request_start','step_2','step_3'])assert.equal((await call('/api/events',{method:'POST',body:{session:p.analyticsSession,event,page:'/quote.html',source:'test'}})).status,202);
 const stats=await (await call('/api/admin/stats',{auth:true})).json();assert.equal(stats.totalLeads,1);assert.equal(stats.sessions,1);assert.equal(stats.funnel.at(-1).count,1);assert.equal(stats.leadPages[0].page,'/quote.html');
 const original=await (await call('/api/admin/content',{auth:true})).json();const edited=structuredClone(original);edited.settings.manager='Тестовый менеджер';edited.settings.email='testoffice@example.com';edited.settings.phone='+7 999 000 11 22';edited.settings.slogan='Проверенный заголовок';edited.settings.moscow='Тестовый адрес, 1';edited.projects[1].published=false;edited.projects[0].title='Объект <img src=x onerror=alert(1)> & «Тест»';
 response=await call('/api/admin/content',{method:'PUT',auth:true,body:edited});assert.equal(response.status,200,await response.clone().text());const saved=await response.json();assert.equal(saved.revision,2);assert.ok(saved.projects[0].geo);assert.ok(saved.projects[0].serviceIds.includes('glazing'));assert.equal((await call('/api/portfolio',{method:'POST',body:{projects:['burny']}})).status,422,'unpublished projects excluded from PDF');
 const home=await (await call('/')).text();assert.ok(home.includes('Проверенный заголовок'));assert.ok(!home.includes('<img src=x onerror=alert(1)>'),'escape editor text');const contact=await (await call('/contacts.html')).text();assert.ok(contact.includes('testoffice@example.com'));assert.ok(contact.includes('Тестовый адрес, 1'));assert.ok(contact.includes('Тестовый менеджер'));
 assert.equal((await call('/api/admin/content',{method:'PUT',auth:true,body:edited})).status,409,'stale content blocked');
 const imageForm=new FormData();imageForm.append('files',new Blob([await readFile(path.join(root,'site/assets/museum-small.webp'))]),'Фото.webp');response=await call('/api/admin/media',{method:'POST',auth:true,body:imageForm,form:true});assert.equal(response.status,201);const image=await response.json();assert.equal((await call(image.url)).status,200);
 const add=structuredClone(saved);add.projects.push({...structuredClone(add.projects[3]),id:'integration-new',title:'Новый объект',images:[image.key],case:{task:'Монтаж',result:'Готово'},published:true});response=await call('/api/admin/content',{method:'PUT',auth:true,body:add});assert.equal(response.status,200);assert.equal((await call('/projects/integration-new.html')).status,200);assert.match(await (await call('/projects.html')).text(),/integration-new/);
 await stop();await start();assert.equal((await (await call('/api/admin/leads',{auth:true})).json()).total,1,'leads persist');assert.equal((await call('/projects/integration-new.html')).status,200,'content persists');
 for(let i=0;i<80&&received.length<2;i++)await delay(50);assert.equal(received.length,2,'manager and visitor SMTP messages');assert.ok(received.every(m=>m.includes('Message-ID:')));
 const after=await (await call('/api/admin/leads/'+id,{auth:true})).json();assert.equal(after.status,'estimate');assert.equal(after.assignee,'tester');assert.equal(after.next_contact,'2026-09-22');assert.equal(after.next_action,'Уточнить чертежи');assert.equal(after.payload.solution,'new');assert.ok(after.notifications.every(x=>x.state==='sent'));
 response=await call('/api/admin/leads/'+id,{method:'PATCH',auth:true,body:{status:'closed',note:'Готово',revision:3}});assert.equal(response.status,200);assert.equal((await (await call('/api/admin/reminders?today=2026-09-23',{auth:true})).json()).overdue,0,'closed leads excluded from reminders');
 response=await call('/api/admin/leads/'+id,{method:'DELETE',auth:true});assert.equal(response.status,200);assert.equal((await call('/api/admin/files/'+fileId,{auth:true})).status,404,'deleted attachment inaccessible');
 response=await call('/api/admin/logout',{method:'POST',auth:true,body:{}});assert.equal(response.status,200);assert.equal((await call('/api/admin/leads',{auth:true})).status,401,'logout invalidates session');
 console.log('PASS: request + private files + idempotency + authentication + CSRF + status/revisions + publishing + uploads + persistence + analytics + SMTP + deletion + followups + owner/date validation + PDF selection + hidden projects');
}catch(err){console.error(err);console.error(serverLog.slice(-1500));process.exitCode=1;}
finally{await stop();await new Promise(r=>smtp.close(r));await rm(temp,{recursive:true,force:true});}
