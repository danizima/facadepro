import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {createClientPortal} from '../backend/client-portal.mjs';
import {createQuotes} from '../backend/quotes14.mjs';

const DATA=await mkdtemp(path.join(tmpdir(),'facade-client-responses16-')),db=new DatabaseSync(':memory:');
let clock=Date.parse('2026-10-07T05:00:00.000Z'),hookFailure=false,notifications=0;
const hash=value=>createHash('sha256').update(value).digest('hex');
const privateHash=value=>createHmac('sha256','TEST-ONLY-CLIENT-RESPONSE-SECRET').update(value).digest('hex');
const fail=(status,message)=>Object.assign(new Error(message),{status});
const text=(value,max,required=false)=>{if(typeof value!=='string'||value.length>max||required&&!value.trim()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw fail(422,'Invalid field');return value.trim();};
const content=()=>({settings:{manager:'Менеджер ФАСАД.PRO',phone:'+7 999 000-00-00',email:'info@example.test'}});
const upload=()=>{const f=new FormData();f.set('idempotency',randomUUID());f.set('amount','1030000.75');f.set('timeframe','30 рабочих дней');f.set('note','STAFF-PRIVATE-NOTE');f.append('files',new Blob(['%PDF-1.7\nproposal\n%%EOF\n']),'Предложение.pdf');return f;};
const addLead=()=>{const id=randomUUID();db.prepare('INSERT INTO leads VALUES(?,?,?,?,?,?,?,?)').run(id,'FP-'+randomUUID(),'estimate','{"name":"STAFF-PRIVATE-NAME","phone":"STAFF-PRIVATE-PHONE"}','STAFF-PRIVATE-NOTE','STAFF-PRIVATE-ACTION','STAFF-PRIVATE-ASSIGNEE',1);return id;};
try{
 db.exec(`PRAGMA foreign_keys=ON;
  CREATE TABLE leads(id TEXT PRIMARY KEY,reference TEXT UNIQUE,status TEXT,payload TEXT,note TEXT,next_action TEXT,assignee TEXT,revision INTEGER);
  CREATE TABLE files(id TEXT PRIMARY KEY,lead_id TEXT REFERENCES leads(id) ON DELETE CASCADE,name TEXT,size INTEGER,ext TEXT);
  CREATE TABLE outbox(id TEXT PRIMARY KEY,lead_id TEXT REFERENCES leads(id) ON DELETE CASCADE,kind TEXT);
 `);
 const quotes=createQuotes({db,dataDir:DATA,text,fail,content,now:()=>new Date(clock)});
 const dependencies={db,DATA,hash,privateHash,text,fail,content,signature:()=>true,now:()=>clock,onQuoteResponse:({leadId,responseId,quoteId})=>{
   assert.ok(db.prepare('SELECT id FROM lead_quote_responses16 WHERE id=? AND lead_id=? AND quote_id=?').get(responseId,leadId,quoteId),'notification sees the committed response inside its transaction');
   db.prepare('INSERT INTO outbox VALUES(?,?,?)').run(responseId,leadId,'quote_response');
   if(hookFailure)throw Error('TEST-ONLY queue failure');notifications++;
 }};
 const portal=createClientPortal(dependencies),id=addLead(),otherId=addLead();
 let token=portal.issue(id).continuationUrl.split('#')[1];const otherToken=portal.issue(otherId).continuationUrl.split('#')[1];
 const first=(await quotes.upload(id,upload(),'manager')).quote,next=(await quotes.upload(id,upload(),'manager')).quote,foreign=(await quotes.upload(otherId,upload(),'manager')).quote;
 const responseInput=(quoteId=first.id,choice='discuss',comment='')=>({quoteId,choice,comment,idempotency:randomUUID()});
 assert.throws(()=>portal.quoteResponse(token,responseInput()),{status:404},'unpublished drafts cannot receive a response');
 portal.adminAction(id,{action:'publishQuote',quoteId:first.id,revision:portal.admin(id).revision});
 assert.equal(portal.read(token).quote.response,null);assert.equal(portal.read(token).quote.responseApi,'/api/client/lead/quotes/'+first.id+'/response');
 for(const input of [null,[],{},responseInput(first.id,'won'),{...responseInput(),comment:'x'.repeat(1501)},{...responseInput(),comment:123},{...responseInput(),quoteId:'bad'},{...responseInput(),idempotency:'bad'}])assert.throws(()=>portal.quoteResponse(token,input),{status:422});
 assert.throws(()=>portal.quoteResponse(otherToken,responseInput()),{status:404},'a capability is scoped to its lead');
 assert.throws(()=>portal.quoteResponse(token,responseInput(foreign.id)),{status:404});
 assert.equal(db.prepare('SELECT COUNT(*) n FROM lead_quote_responses16').get().n,0);

 const input=responseInput(first.id,'reprice','  Уточните площадь и примыкания.  '),before=portal.admin(id),saved=portal.quoteResponse(token,input);
 assert.equal(saved.received,true);assert.equal(saved.replayed,false);assert.equal(saved.response.comment,'Уточните площадь и примыкания.');
 assert.deepEqual(Object.keys(saved.response).sort(),['id','quoteId','choice','comment','createdAt'].sort());
 assert.deepEqual(saved.lead.quote.response,saved.response);assert.equal(portal.admin(id).leadRevision,before.leadRevision+1);assert.equal(portal.admin(id).leadStatus,'sent');
 assert.equal(quotes.list(id).quotes[0].state,'draft');assert.equal(quotes.list(id).quotes[0].sentAt,'');assert.equal(notifications,1);
 const dbSaved=db.prepare('SELECT * FROM lead_quote_responses16 WHERE id=?').get(saved.response.id);
 assert.equal(dbSaved.publication_revision,portal.admin(id).quotePublication.revision);assert.equal(dbSaved.portal_generation,portal.authorize(token).generation);
 const replay=portal.quoteResponse(token,{...input,comment:input.comment.trim()});assert.equal(replay.replayed,true);assert.deepEqual(replay.response,saved.response);assert.equal(notifications,1);assert.equal(portal.admin(id).leadRevision,before.leadRevision+1);
 for(const replacement of [{choice:'discuss'},{comment:'Другой вопрос.'},{quoteId:next.id}])assert.throws(()=>portal.quoteResponse(token,{...input,...replacement}),{status:409},'an idempotency key cannot refer to changed business data');
 const safeJSON=JSON.stringify(portal.read(token));for(const secret of ['STAFF-PRIVATE',id,'portal_generation','idempotency','digest','file_key','created_by'])assert.ok(!safeJSON.includes(secret),'safe response excludes '+secret);

 clock+=1000;const proceed=portal.quoteResponse(token,responseInput(first.id,'proceed','Готов обсудить договор.'));
 assert.equal(proceed.response.choice,'proceed');assert.equal(portal.read(token).quote.response.id,proceed.response.id);assert.equal(portal.admin(id).leadStatus,'sent','intent is not a signed contract');
 assert.equal(db.prepare('SELECT COUNT(*) n FROM lead_quote_responses16 WHERE lead_id=?').get(id).n,2,'the earlier response stays immutable');
 assert.equal(db.prepare('SELECT comment FROM lead_quote_responses16 WHERE id=?').get(saved.response.id).comment,saved.response.comment);
 portal.adminAction(id,{action:'publishQuote',quoteId:next.id,revision:portal.admin(id).revision});
 assert.equal(portal.read(token).quote.response,null,'a response to a prior version is not shown against a new version');
 assert.throws(()=>portal.quoteResponse(token,responseInput()),{status:404},'a fresh response to an old selected version is denied');
 const afterReplacement=portal.admin(id).leadRevision;assert.equal(portal.quoteResponse(token,input).replayed,true,'a previously accepted receipt remains retryable after replacement');assert.equal(portal.admin(id).leadRevision,afterReplacement);
 portal.adminAction(id,{action:'withdrawQuote',revision:portal.admin(id).revision});
 assert.throws(()=>portal.quoteResponse(token,responseInput(next.id)),{status:404});assert.equal(portal.quoteResponse(token,input).replayed,true,'replay of an existing response creates no new response after withdrawal');
 portal.adminAction(id,{action:'publishQuote',quoteId:next.id,revision:portal.admin(id).revision});
 const archived=quotes.update(id,next.id,{revision:next.revision,archived:true},'manager').quote;
 assert.throws(()=>portal.quoteResponse(token,responseInput(next.id)),{status:404});quotes.update(id,next.id,{revision:archived.revision,archived:false},'manager');

 hookFailure=true;const failureInput=responseInput(next.id,'discuss','Что входит в монтаж?'),beforeFailed=portal.admin(id).leadRevision,countBefore=db.prepare('SELECT COUNT(*) n FROM outbox').get().n;
 assert.throws(()=>portal.quoteResponse(token,failureInput),/queue failure/);assert.equal(portal.admin(id).leadRevision,beforeFailed);assert.equal(db.prepare('SELECT COUNT(*) n FROM outbox').get().n,countBefore);assert.equal(portal.read(token).quote.response,null,'queue failure rolls back response and revision');
 hookFailure=false;assert.equal(portal.quoteResponse(token,failureInput).replayed,false,'same key can retry the rolled back response');
 const asyncPortal=createClientPortal({...dependencies,onQuoteResponse:()=>Promise.resolve()});const asyncInput=responseInput(next.id);const beforeAsync=portal.admin(id).leadRevision;
 assert.throws(()=>asyncPortal.quoteResponse(token,asyncInput),/synchronously/);assert.equal(portal.admin(id).leadRevision,beforeAsync);assert.equal(db.prepare('SELECT id FROM lead_quote_responses16 WHERE idempotency=?').get(asyncInput.idempotency),undefined);
 assert.throws(()=>createClientPortal({...dependencies,onQuoteResponse:true}),/synchronous/);

 const oldToken=token;token=portal.adminAction(id,{action:'issue',revision:portal.admin(id).revision}).url.split('#')[1];
 assert.throws(()=>portal.quoteResponse(oldToken,input),{status:404},'rotation denies even accepted receipt replays');
 const reusedKey={...failureInput,comment:'После новой ссылки.'};assert.equal(portal.quoteResponse(token,reusedKey).replayed,false,'a new capability generation has its own retry namespace');
 assert.equal(portal.read(token).quote.response.comment,'После новой ссылки.');
 portal.adminAction(id,{action:'revoke',revision:portal.admin(id).revision});assert.throws(()=>portal.quoteResponse(token,reusedKey),{status:404});
 token=portal.adminAction(id,{action:'issue',revision:portal.admin(id).revision}).url.split('#')[1];clock+=90*86400000;assert.throws(()=>portal.quoteResponse(token,responseInput(next.id)),{status:404},'expiry also denies response retries');
 token=portal.adminAction(id,{action:'issue',revision:portal.admin(id).revision}).url.split('#')[1];assert.equal(createClientPortal(dependencies).read(token).quote.response.comment,'После новой ссылки.','immutable response survives initialization');
 const other=(await quotes.upload(otherId,upload(),'manager')).quote,freshOtherToken=portal.adminAction(otherId,{action:'issue',revision:portal.admin(otherId).revision}).url.split('#')[1];portal.adminAction(otherId,{action:'publishQuote',quoteId:other.id,revision:portal.admin(otherId).revision});portal.quoteResponse(freshOtherToken,responseInput(other.id));
 db.prepare('DELETE FROM leads WHERE id=?').run(id);assert.equal(db.prepare('SELECT COUNT(*) n FROM lead_quote_responses16 WHERE lead_id=?').get(id).n,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM lead_quote_responses16 WHERE lead_id=?').get(otherId).n,1,'deletion does not affect another customer');assert.throws(()=>portal.quoteResponse(token,input),{status:404});
 console.log('PASS v16 client responses: selected quote authorization, explicit choices, bounded comments, immutable history, safe projection, intent without contract claims, exact retries, generation scoping, selection/withdraw/archive, notification rollback, expiry/revoke and cascades');
}finally{db.close();await rm(DATA,{recursive:true,force:true});}
