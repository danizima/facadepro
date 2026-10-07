import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm,readdir,readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {createQuotes,initializeQuotes,quoteAmount,QUOTE_FILE_LIMIT} from '../backend/quotes14.mjs';

const directory=await mkdtemp(path.join(tmpdir(),'facade-quotes14-'));
const db=new DatabaseSync(':memory:');
try{
 db.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE leads(id TEXT PRIMARY KEY,status TEXT NOT NULL DEFAULT 'new',revision INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE audit(id INTEGER PRIMARY KEY,username TEXT,action TEXT,target TEXT);
 CREATE TABLE outbox(id TEXT PRIMARY KEY,recipient TEXT,state TEXT);
 INSERT INTO leads(id,status) VALUES('first','estimate'),('second','review'),('contract','won'),('closed','closed');`);
 let clock=new Date('2026-10-07T04:00:00.000Z'),rejectAudit=false;
 const audit=(username,action,target)=>{
  if(rejectAudit)throw Error('audit write failed');
  db.prepare('INSERT INTO audit(username,action,target) VALUES(?,?,?)').run(username,action,target);
 };
 const api=createQuotes({db,dataDir:directory,audit,now:()=>clock});
 initializeQuotes(db);
 const pdf=Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
 const form=({key=randomUUID(),amount='1250000,75',timeframe='60 дней',note='Монтаж фасадов',name='КП.pdf',bytes=pdf}={})=>{
  const f=new FormData();f.set('idempotency',key);f.set('amount',amount);f.set('timeframe',timeframe);f.set('note',note);f.append('files',new Blob([bytes],{type:'application/pdf'}),name);return f;
 };
 assert.equal(quoteAmount('9999999999.99'),999999999999);
 assert.equal(quoteAmount('0,01'),1);assert.equal(quoteAmount(' 10.9 '),1090);
 for(const value of ['0','-1','1.234','1e2','NaN','10000000000','01','123,45.00',100.01])assert.throws(()=>quoteAmount(value),{status:422});
 assert.deepEqual(api.list('first'),{quotes:[],leadRevision:1,leadStatus:'estimate'});
 await assert.rejects(()=>api.upload('missing',form(),'manager'),{status:404});
 await assert.rejects(()=>api.upload('first',form({name:'file.html'}),'manager'),{status:422});
 await assert.rejects(()=>api.upload('first',form({bytes:Buffer.from('<html>%PDF-1.7</html>')}),'manager'),{status:422});
 await assert.rejects(()=>api.upload('first',form({bytes:Buffer.from('%PDF-1.7\nno trailer')}),'manager'),{status:422});
 const tooBig=form({bytes:Buffer.alloc(QUOTE_FILE_LIMIT+1)});
 await assert.rejects(()=>api.upload('first',tooBig,'manager'),{status:413});
 const repeatedField=form();repeatedField.append('amount','500');
 await assert.rejects(()=>api.upload('first',repeatedField,'manager'),{status:422});
 const twoFiles=form();twoFiles.append('files',new Blob([pdf]),'Second.pdf');
 await assert.rejects(()=>api.upload('first',twoFiles,'manager'),{status:422});
 const noFile=form();noFile.delete('files');await assert.rejects(()=>api.upload('first',noFile,'manager'),{status:422});
 assert.equal((await readdir(path.join(directory,'quotes'))).length,0);

 const key=randomUUID(),first=await api.upload('first',form({key}),'manager');
 assert.equal(first.quote.version,1);assert.equal(first.quote.amount,'1250000.75');assert.equal(first.quote.amountKopecks,125000075);
 assert.equal(first.quote.state,'draft');assert.equal(first.quote.sentAt,'');assert.equal(first.leadStatus,'estimate');assert.equal(first.leadRevision,2);
 assert.equal(first.duplicate,false);assert.equal(first.quote.createdAt,clock.toISOString());
 assert.ok(!('file_key' in first.quote)&&!('digest' in first.quote)&&!('idempotency' in first.quote));
 const duplicate=await api.upload('first',form({key}),'manager');
 assert.deepEqual({...duplicate,duplicate:false},first);
 assert.equal((await readdir(path.join(directory,'quotes'))).length,1);
 await assert.rejects(()=>api.upload('first',form({key,amount:'1250000.74'}),'manager'),{status:409});
 await assert.rejects(()=>api.upload('first',form({key,bytes:Buffer.concat([pdf,Buffer.from('\nchanged')])}),'manager'),{status:409});

 const parallelKey=randomUUID();
 const retryResults=await Promise.all([api.upload('first',form({key:parallelKey}),'manager'),api.upload('first',form({key:parallelKey}),'manager')]);
 assert.equal(retryResults[0].quote.id,retryResults[1].quote.id);assert.equal(retryResults[0].quote.version,2);
 assert.deepEqual(retryResults.map(result=>result.duplicate).sort(),[false,true]);
 assert.equal((await readdir(path.join(directory,'quotes'))).length,2);
 const nextResults=await Promise.all([api.upload('first',form(),'manager'),api.upload('first',form(),'manager')]);
 assert.deepEqual(nextResults.map(result=>result.quote.version).sort(),[3,4]);
 const second=await api.upload('second',form({note:'<img src=x onerror=alert(1)>',name:'../../folder/КП\n<script>.pdf'}),'manager');
 assert.equal(second.quote.version,1);assert.equal(second.quote.name,'КП<script>.pdf');
 assert.equal(second.quote.note,'<img src=x onerror=alert(1)>','text is data; response does not generate HTML');
 const descriptor=await api.download('first',first.quote.id);
 assert.equal(descriptor.mime,'application/pdf');assert.deepEqual(await readFile(descriptor.path),pdf);
 assert.equal((await stat(descriptor.path)).mode&0o777,0o600);
 assert.ok(descriptor.path.startsWith(path.join(directory,'quotes')+path.sep));
 await assert.rejects(()=>api.download('second',first.quote.id),{status:404});
 await assert.rejects(()=>api.download('first','../secret'),{status:404});
 assert.throws(()=>api.update('first',first.quote.id,{state:'sent'},'manager'),{status:422});
 assert.throws(()=>api.update('first',first.quote.id,{state:'sent',revision:99},'manager'),{status:409});
 assert.throws(()=>api.update('first',first.quote.id,{state:'sent',sentAt:'yesterday',revision:1},'manager'),{status:422});

 const edited=api.update('first',first.quote.id,{revision:1,amount:'9999999999.99',timeframe:'90 дней',note:'Уточнённая стоимость'},'manager');
 assert.equal(edited.quote.revision,2);assert.equal(edited.quote.state,'draft');assert.equal(edited.quote.sentAt,'');assert.equal(edited.leadStatus,'estimate');
 clock=new Date('2026-10-07T05:30:00.000Z');
 const sent=api.update('first',first.quote.id,{revision:2,state:'sent'},'manager');
 assert.equal(sent.quote.sentAt,clock.toISOString());assert.equal(sent.quote.revision,3);assert.equal(sent.leadStatus,'sent');assert.equal(sent.leadRevision,edited.leadRevision+1);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0,'marking records the manual send and never queues messages');
 assert.equal(db.prepare("SELECT COUNT(*) n FROM audit WHERE action='quote_marked_sent'").get().n,1);
 clock=new Date('2026-10-07T06:00:00.000Z');
 assert.deepEqual(api.update('first',first.quote.id,{revision:3,state:'sent'},'manager'),sent,'marking the same sent state leaves the timestamp and revisions unchanged');
 assert.throws(()=>api.update('first',first.quote.id,{revision:3,state:'draft'},'manager'),{status:422});
 assert.throws(()=>api.update('first',first.quote.id,{revision:3,amount:'100'},'manager'),{status:422});
 const archived=api.update('first',first.quote.id,{revision:3,archived:true},'manager');
 assert.equal(archived.quote.archived,true);assert.equal(archived.quote.sentAt,sent.quote.sentAt);
 assert.equal(api.list('first').quotes.length,4,'archived versions stay in history and downloadable');
 assert.ok((await api.download('first',first.quote.id)).path);
 const draftArchived=api.update('second',second.quote.id,{revision:1,archived:true},'manager');
 assert.throws(()=>api.update('second',second.quote.id,{revision:draftArchived.quote.revision,state:'sent'},'manager'),{status:422});
 const restored=api.update('second',second.quote.id,{revision:draftArchived.quote.revision,archived:false},'manager');
 assert.equal(restored.quote.archived,false);
 for(const lead of ['contract','closed']){
  const upload=await api.upload(lead,form(),'manager'),mark=api.update(lead,upload.quote.id,{revision:1,state:'sent'},'manager');
  assert.equal(mark.leadStatus,lead==='contract'?'won':'closed');assert.equal(mark.quote.sentAt,clock.toISOString());
 }

 const beforeFiles=await readdir(path.join(directory,'quotes')),beforeCount=db.prepare('SELECT COUNT(*) n FROM quote_versions').get().n,beforeRevision=api.list('first').leadRevision;
 rejectAudit=true;
 await assert.rejects(()=>api.upload('first',form(),'manager'),/audit write failed/);
 assert.throws(()=>api.update('first',first.quote.id,{revision:archived.quote.revision,archived:false},'manager'),/audit write failed/);
 rejectAudit=false;
 assert.deepEqual(await readdir(path.join(directory,'quotes')),beforeFiles);assert.equal(db.prepare('SELECT COUNT(*) n FROM quote_versions').get().n,beforeCount);assert.equal(api.list('first').leadRevision,beforeRevision);
 const afterRollback=await api.upload('first',form(),'manager');assert.equal(afterRollback.quote.version,5,'rollback does not consume a version');
 db.prepare("DELETE FROM leads WHERE id='second'").run();
 assert.equal(db.prepare("SELECT COUNT(*) n FROM quote_versions WHERE lead_id='second'").get().n,0,'FK cascade removes quote rows with a lead');
 await assert.rejects(()=>api.download('second',second.quote.id),{status:404});
 const row=db.prepare('SELECT file_key FROM quote_versions WHERE id=?').get(afterRollback.quote.id);
 await rm(path.join(directory,row.file_key));
 await assert.rejects(()=>api.download('first',afterRollback.quote.id),{status:404});
 console.log('PASS v14 quotes: decimal prices, per-lead versions, PDF limits/signatures, concurrent retries, private paths, optimistic edits, explicit manual-send timestamps, archive, rollback and cascade');
}finally{db.close();await rm(directory,{recursive:true,force:true});}
