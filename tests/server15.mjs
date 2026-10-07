import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readFile,stat,readdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {randomUUID,createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {DatabaseSync} from 'node:sqlite';
import {verifyBackup,restoreBackup} from '../backend/backups.mjs';

const root=new URL('../',import.meta.url).pathname,temp=await mkdtemp(path.join(os.tmpdir(),'facadepro-server15-')),dataDir=path.join(temp,'data');
const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
const base='http://127.0.0.1:'+port,env={...process.env,DATA_DIR:dataDir,PORT:String(port),PUBLIC_URL:base,NODE_ENV:'test',SMTP_HOST:'',SMTP_FROM:'',SMTP_PASSWORD:'',LEAD_TO:'manager@example.test',TELEGRAM_BOT_TOKEN:'',TELEGRAM_CHAT_ID:'',BACKUP_ENABLED:'false'};
let server,log='',cookie='',csrf='';
function command(args){return new Promise((resolve,reject)=>{const p=spawn(process.execPath,args,{cwd:root,env});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',reject);p.on('close',code=>code?reject(Error(err||out)):resolve(out));});}
async function start(){log='';server=spawn(process.execPath,['server.mjs'],{cwd:root,env});server.stdout.on('data',b=>log+=b);server.stderr.on('data',b=>log+=b);for(let i=0;i<250;i++){if(server.exitCode!==null)throw Error(log);try{if((await fetch(base+'/healthz')).ok)return;}catch{}await delay(50);}throw Error('Server start: '+log);}
async function stop(){if(server&&server.exitCode===null&&server.signalCode===null)await new Promise(r=>{server.once('close',r);server.kill('SIGTERM');});server=null;}
async function call(route,{method='GET',body,auth=false,token,csrfToken=csrf,origin=base,form=false}={}){const headers={};if(!['GET','HEAD'].includes(method))headers.Origin=origin;if(auth){headers.Cookie=cookie;if(!['GET','HEAD'].includes(method))headers['X-CSRF-Token']=csrfToken;}if(token)headers.Authorization='Bearer '+token;if(body&&!form)headers['Content-Type']='application/json';return fetch(base+route,{method,headers,body:body?(form?body:JSON.stringify(body)):undefined});}
async function json(route,options={},status=200){const r=await call(route,options);assert.equal(r.status,status,route+': '+await r.clone().text());return r.json();}
const manual=()=>({name:'Заказчик с выезда',company:'Строительная компания',phone:'+7 (999) 555-66-77',email:'visit@example.test',city:'Владивосток',object:'Объект с выезда',services:['glazing'],source:'site_visit',assignee:'server15',comment:'Обсудили фасад',idempotency:randomUUID(),allowDuplicate:false});
const publicRequest=(attribution)=>{const f=new FormData();for(const [k,v] of Object.entries({kind:'quote',service:'glazing',name:'Клиент тендера',company:'Клиентская компания',phone:'+7 999 111-22-33',city:'Владивосток',object:'Тендерный объект',timing:'Согласовать',consent:'yes',scope:'installation',idempotency:requestKey,sourcePage:'/for-contractors.html'}))f.set(k,v);if(attribution)f.set('attribution',JSON.stringify(attribution));return f;};
const requestKey=randomUUID(),attribution={source:'yandex',medium:'cpc',campaign:'Фасады / тендер',content:'banner-1',term:'монтаж фасада',landing:'/for-contractors.html?discard=private'};
const document=()=>({idempotency:randomUUID(),title:'Коммерческое предложение',items:[{title:'Монтаж витража <проект>',unit:'м²',quantity:'2.5',unitPrice:'1000.10'}],tax:{mode:'extra',rate:'22'},timeframe:'20 рабочих дней',validUntil:'',payment:'Условия согласовать',exclusions:'Поставка металла',customerNote:'Обсудим размеры'});
try{
 const admin=await command(['scripts/create-admin.mjs','server15']);const password=admin.match(/Одноразовая выдача пароля: (.+)/)[1];await start();
 const login=await call('/api/admin/login',{method:'POST',body:{username:'server15',password}});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];csrf=(await login.json()).csrf;
 assert.equal((await call('/api/admin/sales')).status,401);
 assert.equal((await call('/api/admin/leads',{method:'POST',body:manual()})).status,401);
 assert.equal((await call('/api/admin/leads',{method:'POST',auth:true,csrfToken:'bad',body:manual()})).status,403);
 const manualInput=manual(),created=await json('/api/admin/leads',{method:'POST',auth:true,body:manualInput},201),manualRoute='/api/admin/leads/'+created.id;
 assert.equal((await json('/api/admin/leads',{method:'POST',auth:true,body:manualInput})).id,created.id);
 const duplicate=await json('/api/admin/leads',{method:'POST',auth:true,body:{...manual(),phone:'8 999 555 66 77'}},409);assert.ok(duplicate.matches.some(r=>r.id===created.id));
 const separate=await json('/api/admin/leads',{method:'POST',auth:true,body:{...manual(),allowDuplicate:true}},201);assert.notEqual(separate.id,created.id);
 const event={type:'call',text:'Позвонили заказчику <script>literal</script>',idempotency:randomUUID()};
 const history=await json(manualRoute+'/history',{method:'POST',auth:true,body:event});assert.ok(history.entries.some(r=>r.text===event.text));
 const replayHistory=await json(manualRoute+'/history',{method:'POST',auth:true,body:event});assert.equal(replayHistory.entries.length,history.entries.length);assert.equal(replayHistory.leadRevision,history.leadRevision);
 assert.equal((await call(manualRoute+'/history')).status,401);
 let detail=await json(manualRoute,{auth:true});assert.equal(detail.payload.kind,'manual');assert.equal(detail.notifications.length,0,'staff entry sends no unsolicited mail');
 await json(manualRoute,{method:'PATCH',auth:true,body:{status:'review',note:'Внутренняя заметка STAFF_ONLY_15',revision:detail.revision}});
 const afterStatus=await json(manualRoute+'/history',{auth:true});assert.ok(afterStatus.entries.some(r=>r.type==='status'&&r.toStatus==='review'));assert.ok(afterStatus.entries.some(r=>r.text.includes('STAFF_ONLY_15')));
 let commercial=await json(manualRoute+'/commercial',{auth:true});assert.equal(commercial.revision,0);
 commercial=await json(manualRoute+'/commercial',{method:'PUT',auth:true,body:{revision:0,amount:'3400.77',lossReason:''}});assert.equal(commercial.amount,'3400.77');
 assert.equal((await call(manualRoute+'/commercial',{method:'PUT',auth:true,body:{revision:0,amount:'1',lossReason:''}})).status,409);
 detail=await json(manualRoute,{auth:true});await json(manualRoute,{method:'PATCH',auth:true,body:{status:'won',note:detail.note,revision:detail.revision}});

 const raceKey=randomUUID(),raceForm=()=>{const f=publicRequest(null);f.set('idempotency',raceKey);f.append('files',new Blob([Buffer.alloc(1024*1024,65)],{type:'text/plain'}),'project.txt');return f;};
 const races=await Promise.all([call('/api/requests',{method:'POST',form:true,body:raceForm()}),call('/api/requests',{method:'POST',form:true,body:raceForm()})]);
 assert.deepEqual(races.map(r=>r.status).sort(),[200,201],'concurrent retry confirms the accepted request');
 const raceReceipts=await Promise.all(races.map(r=>r.json()));assert.equal(raceReceipts[0].reference,raceReceipts[1].reference);assert.equal(raceReceipts[0].continuationUrl,raceReceipts[1].continuationUrl);
 const raceRows=await json('/api/admin/leads',{auth:true}),raceLead=raceRows.rows.find(r=>r.reference===raceReceipts[0].reference);
 assert.equal((await json('/api/admin/leads/'+raceLead.id,{auth:true})).files.length,1);
 assert.equal((await readdir(path.join(dataDir,'uploads'))).length,1,'redundant race uploads are removed');
 await json('/api/admin/leads/'+raceLead.id,{method:'DELETE',auth:true});
 const request=await json('/api/requests',{method:'POST',form:true,body:publicRequest(attribution)},201),token=request.continuationUrl.split('#')[1];
 const retry=await json('/api/requests',{method:'POST',form:true,body:publicRequest(null)});assert.equal(retry.reference,request.reference,'statistics opt-out never changes business retry identity');
 const list=await json('/api/admin/leads',{auth:true}),lead=list.rows.find(r=>r.reference===request.reference),route='/api/admin/leads/'+lead.id;
 const snapshot=await json(route,{auth:true});assert.equal(snapshot.payload.attribution.source,'yandex');
 assert.equal(snapshot.payload.policyVersion,'2026-10-07');
 const previousPolicy={...snapshot.payload,policyVersion:'2026-09-27'},previousDigest=createHash('sha256').update(JSON.stringify({...previousPolicy,attribution:undefined}).replace(/"consentAt":"[^"]+",/,'')).digest('hex');
 const legacyDB=new DatabaseSync(path.join(dataDir,'facadepro.sqlite'));try{legacyDB.prepare('UPDATE leads SET payload=?,digest=? WHERE id=?').run(JSON.stringify(previousPolicy),previousDigest,lead.id);}finally{legacyDB.close();}
 assert.equal((await json('/api/requests',{method:'POST',form:true,body:publicRequest(null)})).reference,request.reference,'notice version changes preserve earlier accepted retry');
 const input=document(),buildRoute=route+'/quotes/build';
 assert.equal((await call(buildRoute,{method:'POST',body:input})).status,401);
 assert.equal((await call(buildRoute,{method:'POST',auth:true,csrfToken:'bad',body:input})).status,403);
 const built=await json(buildRoute,{method:'POST',auth:true,body:input},201);assert.equal(built.quote.amount,'3050.31');assert.equal(built.quote.document.totals.totalKopecks,305031);
 const repeated=await json(buildRoute,{method:'POST',auth:true,body:input});assert.equal(repeated.quote.id,built.quote.id);assert.equal(repeated.duplicate,true);
 const builtHistory=await json(route+'/history',{auth:true});assert.equal(builtHistory.entries.filter(r=>r.type==='quote_built').length,1,'constructor retry creates one action');assert.equal(builtHistory.entries.find(r=>r.type==='quote_built').createdBy,'server15');
 const adminFile=await call(built.quote.downloadUrl,{auth:true});assert.equal(adminFile.status,200);assert.equal(Buffer.from(await adminFile.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
 const publicFile='/api/client/lead/quotes/'+built.quote.id+'/file',publicView='/api/client/lead/quotes/'+built.quote.id+'/view';
 assert.equal((await call(publicFile,{token})).status,404,'unpublished PDF remains private');
 assert.equal((await json('/api/client/lead',{token})).quote,undefined);
 let portal=await json(route+'/portal',{auth:true});assert.equal((await call(route+'/portal',{method:'POST',auth:true,body:{action:'publishQuote',quoteId:built.quote.id}})).status,422);
 portal=await json(route+'/portal',{method:'POST',auth:true,body:{action:'publishQuote',quoteId:built.quote.id,revision:portal.revision}});
 assert.equal(portal.quotePublication.quoteId,built.quote.id);
 const publishedHistory=await json(route+'/history',{auth:true});assert.ok(publishedHistory.entries.some(r=>r.type==='quote_published'&&r.createdBy==='server15'));assert.ok(publishedHistory.entries.some(r=>r.type==='status'&&r.fromStatus==='new'&&r.toStatus==='sent'));
 const client=await json('/api/client/lead',{token});assert.equal(client.quote.id,built.quote.id);assert.equal(client.quote.amount,'3050.31');
 for(const key of ['note','document','file_key','createdBy','revision'])assert.equal(client.quote[key],undefined,'client quote allowlist '+key);
 assert.equal((await call(publicFile)).status,404);assert.equal((await call(built.quote.downloadUrl,{token})).status,401);
 let file=await call(publicFile,{token,method:'HEAD'});assert.equal(file.status,200);assert.equal((await file.arrayBuffer()).byteLength,0);assert.match(file.headers.get('cache-control'),/no-store/);assert.equal(file.headers.get('referrer-policy'),'no-referrer');assert.match(file.headers.get('x-robots-tag'),/noindex/);
 assert.equal((await json(route+'/portal',{auth:true})).quotePublication.viewCount,0,'HEAD never claims a PDF was opened');
 file=await call(publicFile,{token});assert.equal(file.status,200);assert.equal(Buffer.from(await file.arrayBuffer()).subarray(0,5).toString(),'%PDF-');assert.equal((await json(route+'/portal',{auth:true})).quotePublication.viewCount,0,'downloading alone is not a view event');
 await json(publicView,{method:'POST',token,body:{}});await json(publicView,{method:'POST',token,body:{}});assert.equal((await json(route+'/portal',{auth:true})).quotePublication.viewCount,1);
 assert.equal((await call(publicView,{method:'POST',token,body:{},origin:'https://other.example'})).status,403);
 assert.equal((await call(route+'/quotes/'+built.quote.id,{method:'PATCH',auth:true,body:{revision:built.quote.revision,amount:'1'}})).status,422,'generated approved PDF cannot diverge from metadata');
 const second=await json(buildRoute,{method:'POST',auth:true,body:{...document(),items:[{title:'Дополнение',unit:'шт',quantity:'1',unitPrice:'5000'}]}},201);
 portal=await json(route+'/portal',{auth:true});portal=await json(route+'/portal',{method:'POST',auth:true,body:{action:'publishQuote',quoteId:second.quote.id,revision:portal.revision}});
 assert.equal((await call(publicFile,{token})).status,404,'replaced version immediately loses customer access');
 const publishedFile='/api/client/lead/quotes/'+second.quote.id+'/file';
 portal=await json(route+'/portal',{method:'POST',auth:true,body:{action:'withdrawQuote',revision:portal.revision}});assert.equal((await call(publishedFile,{token})).status,404);
 portal=await json(route+'/portal',{method:'POST',auth:true,body:{action:'publishQuote',quoteId:second.quote.id,revision:portal.revision}});
 const rotated=await json(route+'/portal',{method:'POST',auth:true,body:{action:'issue',revision:portal.revision}}),newToken=rotated.url.split('#')[1];
 assert.equal((await call(publishedFile,{token})).status,404);assert.equal((await call(publishedFile,{token:newToken})).status,200);
 const sale=await json('/api/admin/sales?days=30',{auth:true});assert.equal(sale.totals.leads,3);assert.equal(sale.totals.won,1);assert.equal(sale.totals.contractAmount,'3400.77');assert.equal(sale.totals.quoted,1);
 assert.ok(sale.campaigns.some(g=>g.campaign===attribution.campaign&&g.leads===1));assert.ok(sale.firstAction.known>=1);
 const dbCheck=new DatabaseSync(path.join(dataDir,'facadepro.sqlite'),{readOnly:true});try{assert.equal(dbCheck.prepare('SELECT landing FROM lead_attribution WHERE lead_id=?').get(lead.id).landing,'/for-contractors.html');assert.equal(dbCheck.prepare('SELECT COUNT(*) n FROM outbox WHERE lead_id=?').get(created.id).n,0);}finally{dbCheck.close();}
 await stop();const backup=JSON.parse((await command(['scripts/backup-data.mjs'])).trim()),directory=path.join(dataDir,'backups',backup.backup);assert.equal((await verifyBackup(directory)).verified,true);
 const restore=path.join(temp,'restored');await restoreBackup(directory,restore);const restored=new DatabaseSync(path.join(restore,'facadepro.sqlite'),{readOnly:true});
 try{assert.equal(restored.prepare('SELECT COUNT(*) n FROM quote_versions WHERE document_json<>?').get('').n,2);assert.ok(restored.prepare('SELECT COUNT(*) n FROM lead_history').get().n>=4);assert.equal(restored.prepare('SELECT amount_kopecks FROM lead_commercial WHERE lead_id=?').get(created.id).amount_kopecks,340077);assert.equal(restored.prepare('SELECT source FROM lead_attribution WHERE lead_id=?').get(lead.id).source,'yandex');assert.ok(restored.prepare('SELECT COUNT(*) n FROM lead_quote_publications').get().n>=1);}finally{restored.close();}
 await start();assert.equal((await json('/api/client/lead',{token:newToken})).quote.id,second.quote.id);
 const storage=new DatabaseSync(path.join(dataDir,'facadepro.sqlite'),{readOnly:true});let files;try{files=storage.prepare('SELECT file_key FROM quote_versions WHERE lead_id=?').all(lead.id);}finally{storage.close();}
 await json(route,{method:'DELETE',auth:true});assert.equal((await call(publishedFile,{token:newToken})).status,404);for(const f of files)await assert.rejects(()=>stat(path.join(dataDir,f.file_key)),{code:'ENOENT'});
 assert.equal((await json('/api/admin/sales?days=30',{auth:true})).totals.leads,2);
 console.log('PASS v15 HTTP: staff-only manual leads/history/contracts, contact duplicates, auth/CSRF, stable opt-out retry attribution, genuine quote PDF/tax/versions, explicit private publication, safe download/HEAD/view, replace/withdraw/rotate, sales cohorts, backup/restore and cascade');
}catch(error){console.error(error);console.error(log.slice(-1800));process.exitCode=1;}finally{await stop();await rm(temp,{recursive:true,force:true});}
