import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
const root=new URL('../',import.meta.url).pathname,temp=await mkdtemp(path.join(os.tmpdir(),'facadepro-v6-'));
const port=18744,base='http://127.0.0.1:'+port;
const env={...process.env,DATA_DIR:temp,PORT:String(port),PUBLIC_URL:base,NODE_ENV:'test',SMTP_HOST:'',SMTP_FROM:'',TELEGRAM_BOT_TOKEN:'',TELEGRAM_CHAT_ID:''};
let server,log='',cookie='',csrf='';
function command(args,extra={}){return new Promise((resolve,reject)=>{const p=spawn(process.execPath,args,{cwd:root,env:{...env,...extra}});let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('close',code=>code?reject(Error(err)):resolve(out));});}
async function start(){server=spawn(process.execPath,['server.mjs'],{cwd:root,env});server.stdout.on('data',x=>log+=x);server.stderr.on('data',x=>log+=x);for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok)return;}catch{}await delay(50);}throw Error(log);}
async function stop(){if(!server)return;await new Promise(r=>{server.once('close',r);server.kill('SIGTERM');});server=null;}
async function call(route,{method='GET',body,auth=true,csrfToken=csrf,form=false}={}){const headers={};if(method!=='GET')headers.Origin=base;if(auth){headers.Cookie=cookie;headers['X-CSRF-Token']=csrfToken;}if(body&&!form)headers['Content-Type']='application/json';return fetch(base+route,{method,headers,body:body?(form?body:JSON.stringify(body)):undefined});}
async function ok(r,status=200){assert.equal(r.status,status,await r.clone().text());return r.json();}
try{
 const result=await command(['scripts/create-admin.mjs','tester']),password=result.match(/Одноразовая выдача пароля: (.+)/)[1];
 await start();
 assert.equal((await call('/api/admin/notifications',{auth:false})).status,401);
 const login=await call('/api/admin/login',{method:'POST',body:{username:'tester',password},auth:false});cookie=login.headers.get('set-cookie').split(';')[0];csrf=(await ok(login)).csrf;
 assert.equal((await call('/api/admin/showcases',{method:'POST',body:{},csrfToken:'bad'})).status,403);
 let original=await ok(await call('/api/admin/content'));
 assert.equal(original.schemaVersion,6);assert.equal(original.projects.find(p=>p.id==='museum').reports.length,3);
 assert.equal(original.projects.find(p=>p.id==='museum').hotspots.length,3);
 const edited=structuredClone(original),museum=edited.projects.find(p=>p.id==='museum');
 const report={id:'site-report-test',published:false,period:'Тестовый период',publishedAt:'2026-09-24',dateKind:'shooting',title:'DRAFT-REPORT-SECRET',summary:'Только в панели',sourceUrl:'',credit:'ФАСАД.PRO',photos:[{key:'museum-facade',caption:'Подпись <script>alert(1)</script>'}]};
 museum.reports.push(report);
 original=await ok(await call('/api/admin/content',{method:'PUT',body:edited}));
 assert.ok(!(await (await call('/projects/museum.html',{auth:false})).text()).includes('DRAFT-REPORT-SECRET'));
 let invalid=structuredClone(original);invalid.projects[0].reports.at(-1).sourceUrl='javascript:alert(1)';
 assert.equal((await call('/api/admin/content',{method:'PUT',body:invalid})).status,422);
 invalid=structuredClone(original);invalid.projects[0].hotspots[0].x=101;
 assert.equal((await call('/api/admin/content',{method:'PUT',body:invalid})).status,422);
 invalid=structuredClone(original);invalid.projects[0].reports.at(-1).publishedAt='2026-02-30';
 assert.equal((await call('/api/admin/content',{method:'PUT',body:invalid})).status,422);
 const upload=new FormData();upload.append('files',new Blob([await readFile(path.join(root,'site/assets/museum-small.webp'))]),'report.webp');
 const image=await ok(await call('/api/admin/media',{method:'POST',body:upload,form:true}),201);
 let next=structuredClone(original);next.projects[0].reports.at(-1).photos.push({key:image.key,caption:'Загруженная фотография'});
 next.projects[0].reports.at(-1).published=true;next.projects[0].reports.at(-1).title='LIVE-REPORT';
 const preview=await ok(await call('/api/admin/preview',{method:'POST',body:{content:next,project:'museum'}}));
 assert.ok(preview.html.includes('LIVE-REPORT'));assert.ok(!preview.html.includes('<script>alert(1)</script>'));
 assert.ok(!(await (await call('/projects/museum.html',{auth:false})).text()).includes('LIVE-REPORT'),'preview does not publish');
 original=await ok(await call('/api/admin/content',{method:'PUT',body:next}));
 const page=await (await call('/projects/museum.html',{auth:false})).text();
 assert.ok(page.includes('LIVE-REPORT'));assert.ok(page.includes(image.key));assert.ok(page.includes('&lt;script&gt;'));
 const share={title:'Подборка <b>опыт</b>',message:'Личное обращение',recipient:'Для тестового проекта',projects:['museum','restaurant'],manager:'Менеджер',phone:'+7 999 000 00 00',email:'manager@example.com',days:90};
 assert.equal((await call('/api/admin/showcases',{method:'POST',body:{...share,projects:['missing']}})).status,422);
 const created=await ok(await call('/api/admin/showcases',{method:'POST',body:share}),201),token=created.token;
 let publicResponse=await call('/selection/'+token,{auth:false});assert.equal(publicResponse.status,200);assert.equal(publicResponse.headers.get('x-robots-tag'),'noindex, nofollow');assert.equal(publicResponse.headers.get('referrer-policy'),'no-referrer');
 const html=await publicResponse.text();assert.ok(html.includes('Подборка &lt;b&gt;опыт&lt;/b&gt;'));assert.ok(html.indexOf('/projects/museum.html')<html.indexOf('/projects/restaurant.html'));
 const selected=await ok(await call('/api/selection/'+token,{auth:false}));assert.deepEqual(selected.projects,['museum','restaurant']);
 const pdf=await call('/selection/'+token+'/pdf',{method:'POST',auth:false,body:{}});assert.equal(pdf.status,200);assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
 next=structuredClone(original);next.projects.find(p=>p.id==='restaurant').published=false;original=await ok(await call('/api/admin/content',{method:'PUT',body:next}));
 assert.ok(!(await (await call('/selection/'+token,{auth:false})).text()).includes('/projects/restaurant.html'),'hidden projects disappear from existing links');
 const f=new FormData();for(const [k,v] of Object.entries({kind:'request',service:'glazing',object:'Объект',city:'Москва',timing:'Обсудить',name:'Тест',phone:'+7 999 000 00 00',consent:'yes',idempotency:randomUUID(),selection:token,audience:'developer'}))f.set(k,v);
 await ok(await call('/api/requests',{method:'POST',body:f,form:true,auth:false}),201);
 const leads=await ok(await call('/api/admin/leads'));assert.equal(leads.rows[0].payload.selectionTitle,share.title);assert.equal(leads.rows[0].payload.audience,'developer');
 await ok(await call('/api/admin/showcases/'+token,{method:'PATCH',body:{revoked:true,revision:1}}));
 assert.equal((await call('/selection/'+token,{auth:false})).status,410);assert.equal((await call('/selection/'+token+'/pdf',{method:'POST',auth:false,body:{}})).status,410);
 let cfg=await ok(await call('/api/admin/notifications'));const testPassword=' TestSecret-Only-Local-33456677 ',testToken='123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
 assert.equal(cfg.hasPassword,false);assert.equal(cfg.hasToken,false);
 const saved=await ok(await call('/api/admin/notifications',{method:'PUT',body:{...cfg,smtpPassword:testPassword,telegramToken:testToken}}));
 assert.equal(saved.hasPassword,true);assert.equal(saved.hasToken,true);assert.ok(!JSON.stringify(saved).includes(testPassword));assert.ok(!JSON.stringify(saved).includes(testToken));
 assert.equal((await call('/api/admin/notifications',{method:'PUT',body:cfg})).status,409);
 cfg=await ok(await call('/api/admin/notifications',{method:'PUT',body:{...saved,smtpPassword:'',telegramToken:''}}));assert.equal(cfg.hasPassword,true);assert.equal(cfg.hasToken,true);
 assert.equal((await call('/api/admin/notifications/test',{method:'POST',body:{channel:'telegram'}})).status,422,'disabled provider never contacted');
 await stop();await start();
 assert.equal((await ok(await call('/api/admin/content'))).projects[0].reports.at(-1).title,'LIVE-REPORT');
 assert.equal((await call('/selection/'+token,{auth:false})).status,410,'revocation survives restart');
 assert.equal((await ok(await call('/api/admin/notifications'))).hasPassword,true);
 await stop();
 assert.ok(!(await readFile(path.join(temp,'facadepro.sqlite'))).includes(Buffer.from(testPassword)),'SMTP password encrypted at rest');
 assert.ok(!(await readFile(path.join(temp,'facadepro.sqlite'))).includes(Buffer.from(testToken)),'bot token encrypted at rest');
 const unit=await command(['--input-type=module','-e',[
  "import assert from 'node:assert/strict';",
  "import {db} from './backend/store.mjs';",
  "import {notificationConfig,saveNotifications,scheduleReminders,reminderStillRelevant,sendTelegram,telegramMessage} from './backend/notifications.mjs';",
  "let c=notificationConfig();assert.equal(c.smtpPassword,' TestSecret-Only-Local-33456677 ');saveNotifications({...c,telegramEnabled:true,telegramChat:'12345',remindersEnabled:true});",
  "const lead=db.prepare('SELECT * FROM leads LIMIT 1').get();db.prepare(\"UPDATE leads SET status='new',created='2026-09-20T00:00:00.000Z',next_contact='2026-09-24' WHERE id=?\").run(lead.id);",
  "const now=new Date('2026-09-24T01:00:00Z');scheduleReminders(now);scheduleReminders(now);",
  "let rows=db.prepare(\"SELECT * FROM outbox WHERE channel='telegram'\").all();assert.equal(rows.length,1);",
  "const active=db.prepare('SELECT * FROM leads LIMIT 1').get();assert.equal(reminderStillRelevant(rows[0],active,now),true);assert.equal(reminderStillRelevant(rows[0],{...active,status:'closed'},now),false);assert.equal(reminderStillRelevant(rows[0],active,new Date('2026-09-25T01:00:00Z')),false);",
  "scheduleReminders(new Date('2026-09-24T20:00:00Z'));assert.equal(db.prepare(\"SELECT COUNT(*) n FROM outbox WHERE channel='telegram'\").get().n,1);",
  "let seen;await sendTelegram(telegramMessage(rows[0],active),notificationConfig(),async(url,options)=>{seen={url,body:JSON.parse(options.body)};return {ok:true,json:async()=>({ok:true,result:{message_id:1}})};});assert.equal(seen.body.chat_id,'12345');assert.ok(!seen.body.text.includes('+7'));assert.ok(seen.url.startsWith('https://api.telegram.org/bot'));",
  "await assert.rejects(()=>sendTelegram('test',notificationConfig(),async()=>{throw Error(notificationConfig().telegramToken)}),e=>!e.message.includes(notificationConfig().telegramToken));",
  "db.close();console.log('Reminder deduplication, quiet hours, cancellation and Telegram transport passed');"
 ].join('\n')]);
 console.log('PASS: v6 drafts + preview + publication + uploads + validation + share links/PDF + hidden projects + revocation + lead attribution + encrypted settings + restart persistence');
 console.log(unit.trim());
}catch(err){console.error(err);console.error(log.slice(-1500));process.exitCode=1;}
finally{await stop();await rm(temp,{recursive:true,force:true});}
