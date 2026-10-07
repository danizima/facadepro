import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readFile,writeFile,stat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {DatabaseSync} from 'node:sqlite';
import {verifyBackup,restoreBackup} from '../backend/backups.mjs';
import {retentionCandidates} from '../backend/retention.mjs';

const root=new URL('../',import.meta.url).pathname;
const temp=await mkdtemp(path.join(os.tmpdir(),'facadepro-server14-')),dataDir=path.join(temp,'data');
const listener=net.createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
const base='http://127.0.0.1:'+port;
const env={...process.env,DATA_DIR:dataDir,PORT:String(port),PUBLIC_URL:base,NODE_ENV:'test',SMTP_HOST:'',SMTP_FROM:'',SMTP_PASSWORD:'',LEAD_TO:'manager@example.test',TELEGRAM_BOT_TOKEN:'',TELEGRAM_CHAT_ID:'',BACKUP_ENABLED:'false'};
let server,serverLog='',cookie='',csrf='';
function command(args){return new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,args,{cwd:root,env});let out='',err='';
 child.stdout.on('data',chunk=>out+=chunk);child.stderr.on('data',chunk=>err+=chunk);child.on('error',reject);child.on('close',code=>code?reject(Error(err||out)):resolve(out));
});}
async function start(){
 serverLog='';server=spawn(process.execPath,['server.mjs'],{cwd:root,env});
 server.stdout.on('data',chunk=>serverLog+=chunk);server.stderr.on('data',chunk=>serverLog+=chunk);
 for(let i=0;i<200;i++){
  if(server.exitCode!==null)throw Error('Server stopped: '+serverLog);
  try{if((await fetch(base+'/healthz')).ok)return;}catch{}
  await delay(50);
 }
 throw Error('Server did not start: '+serverLog);
}
async function stop(){
 if(!server)return;
 if(server.exitCode===null&&server.signalCode===null)await new Promise(resolve=>{server.once('close',resolve);server.kill('SIGTERM');});
 server=null;
}
async function call(route,{method='GET',body,auth=false,token,origin=base,csrfToken=csrf,form=false}={}){
 const headers={};if(!['GET','HEAD'].includes(method))headers.Origin=origin;
 if(auth){headers.Cookie=cookie;if(!['GET','HEAD'].includes(method))headers['X-CSRF-Token']=csrfToken;}
 if(token)headers.Authorization='Bearer '+token;if(body&&!form)headers['Content-Type']='application/json';
 return fetch(base+route,{method,headers,body:body?(form?body:JSON.stringify(body)):undefined});
}
async function json(route,options,status=200){const response=await call(route,options);assert.equal(response.status,status,route+': '+await response.clone().text());return response.json();}
const pdf=Buffer.from('%PDF-1.7\nPrivate project\n%%EOF\n');
const data=()=>({kind:'quote',service:['glazing'],object:'Объект частного клиента',city:'Владивосток',area:'100',timing:'Согласовать',documents:'Проект по ссылке',comment:'Начальные данные клиента',name:'Клиент приватный',company:'Организация приватная',email:'client-private@example.test',phone:'+7 999 777 22 11',consent:'yes',idempotency:randomUUID(),sourcePage:'/quote.html',projectLink:'https://disk.yandex.ru/d/example-project',scope:'installation'});
function requestForm(payload){const f=new FormData();for(const [key,value] of Object.entries(payload)){if(Array.isArray(value))for(const item of value)f.append(key,item);else f.set(key,value);}f.append('files',new Blob([pdf],{type:'application/pdf'}),'Исходный проект.pdf');return f;}
function quoteForm({key=randomUUID(),amount='100500.75',note='КП внутри CRM'}={}){const f=new FormData();f.set('idempotency',key);f.set('amount',amount);f.set('timeframe','45 дней');f.set('note',note);f.append('files',new Blob([pdf],{type:'application/pdf'}),'КП.pdf');return f;}
const tokenFrom=url=>{assert.match(url,/^\/followup\.html#[a-f0-9]{64}$/);return new URL(url,base).hash.slice(1);};
try{
 const admin=await command(['scripts/create-admin.mjs','server14']);const password=admin.match(/Одноразовая выдача пароля: (.+)/)[1];
 await start();
 const login=await call('/api/admin/login',{method:'POST',body:{username:'server14',password}});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];csrf=(await login.json()).csrf;
 const empty=await json('/api/budget/config');assert.equal(empty.configured,false);assert.deepEqual(empty.rates,[]);
 const estimateInput={service:'glazing',scope:'installation',area:100,region:'vladivostok',height:'low'};
 const unavailable=await json('/api/budget/estimate',{method:'POST',body:estimateInput});assert.equal(unavailable.available,false);assert.ok(!('min' in unavailable)&&!('max' in unavailable),'unconfigured calculator invents no budget');
 assert.equal((await call('/api/admin/budget',{method:'PUT',body:empty})).status,401);
 assert.equal((await call('/api/admin/budget',{method:'PUT',auth:true,csrfToken:'bad',body:empty})).status,403);
 const configured=await json('/api/admin/budget',{method:'PUT',auth:true,body:{...empty,rates:[{service:'glazing',scope:'installation',label:'Монтаж',min:1000,max:1500}],regions:empty.regions.map(row=>({...row,multiplier:row.id==='vladivostok'?1.2:1})),heights:empty.heights}});
 assert.equal(configured.configured,true);assert.equal(configured.revision,empty.revision+1);
 const estimated=await json('/api/budget/estimate',{method:'POST',body:estimateInput});assert.deepEqual([estimated.min,estimated.max],[120000,180000]);
 assert.equal((await call('/api/admin/budget',{method:'PUT',auth:true,body:empty})).status,409);
 assert.equal((await call('/api/admin/budget',{method:'PUT',auth:true,body:{...configured,rates:[{service:'glazing',scope:'installation',min:2000,max:1000}]}})).status,422);

 const payload=data();
 for(const projectLink of ['http://example.test/project','https://user:password@example.test/project','javascript:alert(1)'])assert.equal((await call('/api/requests',{method:'POST',body:requestForm({...payload,projectLink}),form:true})).status,422,'invalid project link '+projectLink);
 const created=await json('/api/requests',{method:'POST',body:requestForm(payload),form:true},201),token=tokenFrom(created.continuationUrl);
 assert.ok(created.continuationExpiresAt);
 const repeated=await json('/api/requests',{method:'POST',body:requestForm(payload),form:true});assert.equal(repeated.continuationUrl,created.continuationUrl,'retry preserves the original capability URL');
 const otherPayload=data(),secondCreated=await json('/api/requests',{method:'POST',body:requestForm(otherPayload),form:true},201),secondToken=tokenFrom(secondCreated.continuationUrl);assert.notEqual(secondToken,token);
 const list=await json('/api/admin/leads',{auth:true});assert.equal(list.total,2);
 const id=list.rows.find(row=>row.reference===created.reference).id,otherId=list.rows.find(row=>row.reference===secondCreated.reference).id;
 const leadRoute='/api/admin/leads/'+id,quoteRoute=leadRoute+'/quotes',portalRoute=leadRoute+'/portal';
 let lead=await json(leadRoute,{auth:true});assert.equal(lead.payload.projectLink,payload.projectLink);assert.equal(lead.payload.scope,'installation');
 await json(leadRoute,{method:'PATCH',auth:true,body:{status:'estimate',note:'Внутренняя маржа 33%; клиенту не показывать',next_action:'Внутренний звонок инженеру',revision:lead.revision}});
 assert.equal((await call('/api/client/lead')).status,404,'portal needs bearer token');
 assert.equal((await call('/api/client/lead?token='+token)).status,404,'query parameters cannot authorize a portal');
 let publicLead=await json('/api/client/lead',{token});
 const publicText=JSON.stringify(publicLead);
 for(const privateValue of [id,payload.name,payload.company,payload.email,payload.phone,payload.comment,'Внутренняя маржа','Внутренний звонок'])assert.ok(!publicText.includes(privateValue),'public portal omits '+privateValue);
 for(const privateField of ['payload','note','next_action','assignee','revision','quotes','files'])assert.ok(!Object.hasOwn(publicLead,privateField));
 const publicResponse=await call('/api/client/lead',{token});assert.match(publicResponse.headers.get('cache-control'),/no-store/);assert.equal(publicResponse.headers.get('referrer-policy'),'no-referrer');
 let portalState=await json(portalRoute,{auth:true});assert.equal(portalState.active,true);
 const xss='</p><img id="portal-xss" src=x onerror="window.portalXss=true">';
 portalState=await json(portalRoute,{method:'POST',auth:true,body:{action:'message',revision:portalState.revision,customerMessage:xss}});
 publicLead=await json('/api/client/lead',{token});assert.equal(publicLead.customerMessage,xss,'plain text survives transport');
 const publicShell=await (await call('/followup.html')).text();assert.ok(!publicShell.includes(xss),'private text is absent from HTML source');
 assert.match(publicShell,/noindex/);assert.equal((await call('/api/client/lead',{method:'POST',token,body:{},origin:'https://elsewhere.test'})).status,403);

 const additionKey=randomUUID();
 const additionForm=(projectLink='https://disk.yandex.ru/d/more-project')=>{const f=new FormData();f.set('idempotency',additionKey);f.set('comment',xss);f.set('projectLink',projectLink);f.append('files',new Blob([pdf]),'Дополнение.pdf');return f;};
 assert.equal((await call('/api/client/lead/append',{method:'POST',token,body:additionForm('https://user:pass@example.test/project'),form:true})).status,422);
 const addition=await json('/api/client/lead/append',{method:'POST',token,body:additionForm(),form:true});assert.equal(addition.received,true);assert.equal(addition.replayed,false);assert.equal(addition.lead.updates.length,1);assert.equal(addition.lead.updates[0].comment,xss);
 assert.ok(!('id' in addition.lead.updates[0]));assert.ok(!('id' in addition.lead.updates[0].files[0]));
 const replayAddition=await json('/api/client/lead/append',{method:'POST',token,body:additionForm(),form:true});assert.equal(replayAddition.replayed,true);assert.equal(replayAddition.lead.updates.length,1);
 lead=await json(leadRoute,{auth:true});assert.equal(lead.files.length,2,'append retry stores one extra file');
 const notificationDb=new DatabaseSync(path.join(dataDir,'facadepro.sqlite'),{readOnly:true});
 try{
  const additionRow=notificationDb.prepare('SELECT id FROM lead_additions WHERE lead_id=?').get(id);
  const queued=notificationDb.prepare("SELECT recipient,state,dedupe,channel FROM outbox WHERE lead_id=? AND kind='addition'").all(id);
  assert.deepEqual(queued.map(row=>({...row})),[{recipient:'manager@example.test',state:'pending',dedupe:'email-addition:'+additionRow.id,channel:'email'}],'append queues exactly one manager notification, including after replay, without sending email');
 }finally{notificationDb.close();}
 assert.equal((await call('/api/admin/files/'+lead.files.at(-1).id,{token})).status,401,'customer bearer cannot download internal files');

 const quoteKey=randomUUID(),quoteNote='<script>window.quoteXss=true</script>';
 assert.equal((await call(quoteRoute,{method:'POST',body:quoteForm(),form:true})).status,401);
 assert.equal((await call(quoteRoute,{method:'POST',auth:true,csrfToken:'bad',body:quoteForm(),form:true})).status,403);
 const uploaded=await json(quoteRoute,{method:'POST',auth:true,body:quoteForm({key:quoteKey,note:quoteNote}),form:true},201);assert.equal(uploaded.quote.state,'draft');assert.equal(uploaded.quote.note,quoteNote);
 const uploadReplay=await json(quoteRoute,{method:'POST',auth:true,body:quoteForm({key:quoteKey,note:quoteNote}),form:true});assert.equal(uploadReplay.quote.id,uploaded.quote.id);assert.equal(uploadReplay.duplicate,true);
 const fileRoute=uploaded.quote.downloadUrl;
 assert.equal((await call(fileRoute)).status,401,'draft PDF cannot be downloaded anonymously');
 assert.equal((await call(fileRoute,{token})).status,401,'public capability cannot download a draft PDF');
 const pdfResponse=await call(fileRoute,{auth:true});assert.equal(pdfResponse.status,200);assert.match(pdfResponse.headers.get('content-type'),/^application\/pdf/);assert.match(pdfResponse.headers.get('content-disposition'),/^attachment/);assert.match(pdfResponse.headers.get('cache-control'),/private, no-store/);assert.deepEqual(Buffer.from(await pdfResponse.arrayBuffer()),pdf);
 assert.equal((await call('/api/admin/leads/'+otherId+'/quotes/'+uploaded.quote.id+'/file',{auth:true})).status,404,'quote belongs to its own lead');
 assert.equal((await call('/quotes/'+uploaded.quote.id+'.pdf')).status,404,'no public quote storage route');
 assert.equal((await call('/data/quotes/'+uploaded.quote.id+'.pdf')).status,404);
 assert.equal((await json('/api/client/lead',{token})).quotes,undefined,'portal never exposes quotes');
 const sent=await json(quoteRoute+'/'+uploaded.quote.id,{method:'PATCH',auth:true,body:{state:'sent',revision:uploaded.quote.revision}});assert.equal(sent.leadStatus,'sent');assert.ok(sent.quote.sentAt);
 assert.equal((await call(fileRoute)).status,401,'sent marking keeps the download private');
 const newest=await json(quoteRoute,{method:'POST',auth:true,body:quoteForm({amount:'250000'}),form:true},201);assert.equal(newest.quote.version,2);
 const quoteList=await json(quoteRoute,{auth:true});assert.deepEqual(quoteList.quotes.map(row=>row.version),[2,1]);assert.equal(quoteList.quotes[1].sentAt,sent.quote.sentAt);

 portalState=await json(portalRoute,{auth:true});
 portalState=await json(portalRoute,{method:'POST',auth:true,body:{action:'revoke',revision:portalState.revision}});assert.equal(portalState.active,false);
 assert.equal((await call('/api/client/lead',{token})).status,404,'revocation blocks the old capability');
 assert.equal((await call('/api/client/lead/append',{method:'POST',token,body:additionForm(),form:true})).status,404);
 const revokedRetry=await json('/api/requests',{method:'POST',body:requestForm(payload),form:true});assert.equal(revokedRetry.continuationUrl,null,'original form retry cannot reactivate a revoked capability');
 const reissued=await json(portalRoute,{method:'POST',auth:true,body:{action:'issue',revision:portalState.revision}}),rotatedToken=tokenFrom(reissued.url);assert.notEqual(rotatedToken,token);
 assert.equal((await call('/api/client/lead',{token})).status,404);assert.equal((await call('/api/client/lead',{token:rotatedToken})).status,200);
 const reissuedRetry=await json('/api/requests',{method:'POST',body:requestForm(payload),form:true});assert.equal(reissuedRetry.continuationUrl,reissued.url,'form retry returns the explicitly reissued token without another rotation');
 assert.equal((await json('/api/client/lead',{token:secondToken})).reference,secondCreated.reference);

 await stop();
 const retentionDb=new DatabaseSync(path.join(dataDir,'facadepro.sqlite'));
 try{
  const retentionNow=new Date(),portalRecord=retentionDb.prepare('SELECT expires,revoked FROM lead_portals WHERE lead_id=?').get(otherId);
  assert.ok(portalRecord.expires>retentionNow.getTime()+89*86400000,'fresh portal carries its 90-day lifetime');
  const oldStatus=retentionDb.prepare('SELECT status FROM leads WHERE id=?').get(otherId).status;
  retentionDb.prepare("UPDATE leads SET status='closed' WHERE id=?").run(otherId);
  retentionDb.prepare('UPDATE leads SET closed_at=? WHERE id=?').run(new Date(retentionNow.getTime()-181*86400000).toISOString(),otherId);
  assert.ok(!retentionCandidates(retentionDb,retentionNow).some(row=>row.id===otherId),'active fresh portal protects a lead closed more than 180 days ago');
  retentionDb.prepare('UPDATE lead_portals SET revoked=1 WHERE lead_id=?').run(otherId);
  assert.ok(retentionCandidates(retentionDb,retentionNow).some(row=>row.id===otherId),'revoked portal no longer prevents normal retention');
  retentionDb.prepare('UPDATE lead_portals SET revoked=? WHERE lead_id=?').run(portalRecord.revoked,otherId);
  retentionDb.prepare('UPDATE leads SET status=? WHERE id=?').run(oldStatus,otherId);
 }finally{retentionDb.close();}
 const backupResult=JSON.parse((await command(['scripts/backup-data.mjs'])).trim()),snapshotDirectory=path.join(dataDir,'backups',backupResult.backup);
 assert.equal(backupResult.ok,true);assert.equal((await verifyBackup(snapshotDirectory)).verified,true);
 const manifestPath=path.join(snapshotDirectory,'manifest.json'),manifestRaw=await readFile(manifestPath,'utf8'),manifest=JSON.parse(manifestRaw);
 const quoteFiles=manifest.files.filter(file=>file.path.startsWith('quotes/'));assert.equal(quoteFiles.length,2,'backup includes every quote PDF');
 for(const file of quoteFiles){assert.equal(file.size,pdf.length);assert.deepEqual(await readFile(path.join(snapshotDirectory,file.path)),pdf);}
 await writeFile(manifestPath,JSON.stringify({...manifest,files:manifest.files.filter(file=>file.path!==quoteFiles[0].path)}));
 await assert.rejects(()=>verifyBackup(snapshotDirectory),/database attachment is missing from backup/,'database-backed quote PDF is required by verification');
 await writeFile(manifestPath,manifestRaw);
 const restoredDir=path.join(temp,'restored');await restoreBackup(snapshotDirectory,restoredDir);
 const restoredDB=new DatabaseSync(path.join(restoredDir,'facadepro.sqlite'),{readOnly:true});
 try{assert.equal(restoredDB.prepare('SELECT COUNT(*) n FROM quote_versions').get().n,2);assert.equal(restoredDB.prepare('SELECT revision FROM budget_settings').get().revision,configured.revision);}finally{restoredDB.close();}
 await start();
 assert.deepEqual(await json('/api/budget/config'),configured,'accepted prices persist across restart');
 assert.deepEqual((await json('/api/budget/estimate',{method:'POST',body:estimateInput})).min,120000);
 assert.equal((await json('/api/client/lead',{token:rotatedToken})).updates.length,1,'public link and append persist');
 assert.equal((await json(quoteRoute,{auth:true})).quotes.length,2,'quote versions persist');
 assert.equal((await call(fileRoute,{auth:true})).status,200);
 const keys=quoteFiles.map(file=>path.join(dataDir,file.path));
 await json(leadRoute,{method:'DELETE',auth:true});
 for(const key of keys)await assert.rejects(()=>stat(key),{code:'ENOENT'},'deleting a lead removes private quote files');
 assert.equal((await call(fileRoute,{auth:true})).status,404);assert.equal((await call('/api/client/lead',{token:rotatedToken})).status,404);
 console.log('PASS v14 server: HTTPS projects, bearer privacy and rotation, idempotent append/request + one manager notification, auth/CSRF quote routes, manual-send records, active-portal retention protection, empty/configured budget persistence, quote backup/restore/verification and deletion cleanup');
}catch(error){console.error(error);console.error(serverLog.slice(-2000));process.exitCode=1;}
finally{await stop();await rm(temp,{recursive:true,force:true});}
