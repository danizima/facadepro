import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm,readdir,readFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createQuotes,initializeQuotes} from '../backend/quotes14.mjs';
import {normalizeQuoteDocument,renderQuoteDocument} from '../backend/quote-document15.mjs';

const input=(overrides={})=>({idempotency:randomUUID(),title:'Коммерческое предложение',items:[{title:'Монтаж фасадного остекления',unit:'м²',quantity:'100,125',unitPrice:'2500.35'}],tax:{mode:'included',rate:'22'},timeframe:'45 рабочих дней',validUntil:'2026-11-15',payment:'Аванс 30%, остаток по этапам.',exclusions:'Поставка стекла в расчёт не входит.',customerNote:'Работы по согласованному проекту.',...overrides});
const document=normalizeQuoteDocument(input());
assert.equal(document.items[0].quantity,'100.125');assert.equal(document.items[0].unitPrice,'2500.35');
assert.equal(document.items[0].lineTotalKopecks,25034754);assert.equal(document.totals.totalKopecks,25034754);assert.equal(document.totals.taxKopecks,4514464);
const row=(quantity,unitPrice)=>[{title:'Позиция',unit:'шт.',quantity,unitPrice}];
assert.equal(normalizeQuoteDocument(input({items:row('0.001','5'),tax:{mode:'none',rate:'0'}})).totals.totalKopecks,1,'half a kopeck rounds up at the line');
assert.deepEqual(normalizeQuoteDocument(input({items:row('1','0.05'),tax:{mode:'extra',rate:'10'}})).totals,{subtotalKopecks:5,taxKopecks:1,totalKopecks:6},'VAT uses half-up rounding');
assert.deepEqual(normalizeQuoteDocument(input({items:row('1','122'),tax:{mode:'included',rate:'22'}})).totals,{subtotalKopecks:12200,taxKopecks:2200,totalKopecks:12200},'included VAT is extracted from total');
assert.deepEqual(normalizeQuoteDocument(input({items:row('1','100'),tax:{mode:'extra',rate:'22'}})).totals,{subtotalKopecks:10000,taxKopecks:2200,totalKopecks:12200});
for(const patch of [
 {items:[]},{items:Array.from({length:51},()=>row('1','1')[0])},{items:row('0','1')},{items:row('1000000.001','1')},{items:row('1.0001','1')},{items:row('1e3','1')},{items:row('1','NaN')},{items:row('1','1.001')},{items:row('1','-1')},{items:row('1','0')},
 {items:row('1','9999999999.99'),tax:{mode:'extra',rate:'30'}},{tax:{mode:'none',rate:'22'}},{tax:{mode:'included',rate:'30.01'}},{tax:{mode:'included',rate:22}},{tax:{mode:'maybe',rate:'0'}},{validUntil:'2026-02-30'},{validUntil:'2026-1-1'},{title:'x'.repeat(181)},{customerNote:'\u0000'},{totals:{totalKopecks:1}},
])assert.throws(()=>normalizeQuoteDocument(input(patch)),{status:422},JSON.stringify(patch));
assert.throws(()=>normalizeQuoteDocument(input({items:[{...row('1','1')[0],lineTotalKopecks:1}]})),{status:422},'manager cannot forge derived line totals');

const directory=await mkdtemp(path.join(tmpdir(),'facade-quote-document15-'));
const db=new DatabaseSync(':memory:');
try{
 db.exec(`PRAGMA foreign_keys=ON; CREATE TABLE leads(id TEXT PRIMARY KEY,reference TEXT,status TEXT DEFAULT 'estimate',revision INTEGER DEFAULT 1,payload TEXT); CREATE TABLE audit(id INTEGER PRIMARY KEY,action TEXT,target TEXT); CREATE TABLE outbox(id TEXT PRIMARY KEY);`);
 db.prepare('INSERT INTO leads(id,reference,payload) VALUES(?,?,?)').run('customer','FP-TEST-0001',JSON.stringify({name:'Ольга',company:'Компания заказчика',object:'Жилой дом',city:'Владивосток',phone:'+79999999999',email:'private@example.test'}));
 const settings={legalName:'ООО «Мастер Склад Владивосток»',inn:'2543104214',kpp:'254301001',ogrn:'1162536089759',phone:'+7 995 000 00 00',email:'office@example.test',manager:'Менеджер',vladivostok:'Владивосток, тестовый адрес',moscow:'Москва, тестовый адрес'};
 let auditFail=false;
 const quotes=createQuotes({db,dataDir:directory,content:()=>({settings}),audit:(_user,action,target)=>{if(auditFail)throw Error('audit failed');db.prepare('INSERT INTO audit(action,target) VALUES(?,?)').run(action,target);}});
 initializeQuotes(db);
 assert.ok(db.prepare('PRAGMA table_info(quote_versions)').all().some(row=>row.name==='document_json'));
 const request=input(),created=await quotes.build('customer',request,'manager');
 assert.equal(created.quote.version,1);assert.equal(created.quote.state,'draft');assert.equal(created.quote.sentAt,'');assert.equal(created.quote.amount,'250347.54');
 assert.deepEqual(created.quote.document.company,settings);assert.equal(created.quote.document.customer.company,'Компания заказчика');assert.equal(created.quote.document.customer.reference,'FP-TEST-0001');
 assert.ok(!JSON.stringify(created.quote.document).includes('private@example.test'),'customer contact data is not copied into a PDF');
 const descriptor=await quotes.download('customer',created.quote.id),bytes=await readFile(descriptor.path);
 assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.equal((await stat(descriptor.path)).mode&0o777,0o600);assert.ok(descriptor.path.startsWith(path.join(directory,'quotes')+path.sep));
 const decoded=spawnSync('pdftotext',['-','-'],{input:bytes,encoding:'utf8'});
 assert.equal(decoded.status,0,decoded.stderr);assert.match(decoded.stdout,/Мастер Склад Владивосток/);assert.match(decoded.stdout,/Монтаж фасадного остекления/);assert.match(decoded.stdout,/250 347,54|250347,54|250,347\.54/);
 settings.manager='Новый менеджер';settings.legalName='Другая компания';db.prepare('UPDATE leads SET payload=? WHERE id=?').run(JSON.stringify({name:'Другой клиент',company:'Другой заказчик'}),'customer');
 const retry=await quotes.build('customer',request,'manager');assert.equal(retry.quote.id,created.quote.id);assert.equal(retry.duplicate,true);assert.equal(retry.quote.document.company.manager,'Менеджер');assert.equal(retry.quote.document.customer.name,'Ольга');
 assert.deepEqual(await readFile(descriptor.path),bytes,'retries preserve the exact original PDF and snapshots');
 await assert.rejects(()=>quotes.build('customer',{...request,payment:'Изменённые условия'},'manager'),{status:409});
 await assert.rejects(()=>quotes.build('missing',request,'manager'),{status:404});
 assert.throws(()=>quotes.update('customer',created.quote.id,{revision:1,amount:'1'},'manager'),{status:422});
 assert.throws(()=>quotes.update('customer',created.quote.id,{revision:1,timeframe:'1 день'},'manager'),{status:422});
 assert.throws(()=>quotes.update('customer',created.quote.id,{revision:1,note:'Изменено'},'manager'),{status:422});
 const archived=quotes.update('customer',created.quote.id,{revision:1,archived:true},'manager');assert.equal(archived.quote.archived,true);assert.equal(archived.quote.document.title,request.title);
 const simultaneous=input({customerNote:'<img src=x onerror=alert(1)> & <script>текст</script>'});
 const parallel=await Promise.all([quotes.build('customer',simultaneous,'manager'),quotes.build('customer',simultaneous,'manager')]);
 assert.equal(parallel[0].quote.id,parallel[1].quote.id);assert.deepEqual(parallel.map(row=>row.duplicate),[false,true]);assert.equal(parallel[0].quote.version,2);assert.equal((await readdir(path.join(directory,'quotes'))).length,2);
 assert.equal(parallel[0].quote.document.company.manager,'Новый менеджер');
 const stableA=await renderQuoteDocument(parallel[0].quote.document),stableB=await renderQuoteDocument(parallel[0].quote.document);assert.deepEqual(stableA,stableB,'renderer bytes are deterministic for an identical document');
 assert.equal(db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0,'building a PDF neither sends nor queues messages');
 const longRequest=input({items:Array.from({length:50},(_,i)=>({title:'Позиция '+(i+1)+' '+('подробное описание узла и состава монтажных работ '.repeat(6)).slice(0,275),unit:'компл.',quantity:'1.125',unitPrice:'1234.56'})),customerNote:'Уточнение условий '.repeat(150),exclusions:'Исключения '.repeat(200),payment:'Оплата '.repeat(150)});
 const long=await quotes.build('customer',longRequest,'manager'),longFile=await quotes.download('customer',long.quote.id),longBytes=await readFile(longFile.path);
 const pageInfo=spawnSync('pdfinfo',['-'],{input:longBytes,encoding:'utf8'}),pages=spawnSync('pdftotext',['-','-'],{input:longBytes,encoding:'utf8'});
 assert.equal(pageInfo.status,0,pageInfo.stderr);assert.equal(pages.status,0,pages.stderr);assert.ok(Number(pageInfo.stdout.match(/Pages:\s+(\d+)/)?.[1])>1);assert.ok(/Позиция 50/.test(pages.stdout));assert.ok(/Итого/i.test(pages.stdout));assert.ok(/Исключения/i.test(pages.stdout));
 const countBefore=db.prepare('SELECT COUNT(*) n FROM quote_versions').get().n,filesBefore=await readdir(path.join(directory,'quotes'));
 auditFail=true;await assert.rejects(()=>quotes.build('customer',input(),'manager'),/audit failed/);auditFail=false;
 assert.equal(db.prepare('SELECT COUNT(*) n FROM quote_versions').get().n,countBefore);assert.deepEqual(await readdir(path.join(directory,'quotes')),filesBefore,'PDF is removed if storing its record fails');
 db.exec('CREATE TABLE quote_client_approvals(quote_id TEXT PRIMARY KEY,lead_id TEXT)');
 const rawForm=new FormData();rawForm.set('idempotency',randomUUID());rawForm.set('amount','100');rawForm.append('files',new Blob([bytes]),'Uploaded.pdf');
 const uploaded=await quotes.upload('customer',rawForm,'manager');assert.equal(uploaded.quote.document,null);
 db.prepare('INSERT INTO quote_client_approvals VALUES(?,?)').run(uploaded.quote.id,'customer');
 assert.throws(()=>quotes.update('customer',uploaded.quote.id,{revision:1,amount:'50'},'manager'),{status:422},'once-approved uploaded PDF remains immutable even after withdrawal');
 console.log('PASS v15 PDF constructor: exact decimal line/VAT totals, input limits, company/customer snapshots, genuine searchable multipage PDF, immutable generated/published metadata, retries/concurrency, deterministic rendering, private storage and rollback');
}finally{db.close();await rm(directory,{recursive:true,force:true});}
