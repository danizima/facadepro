import {mkdirSync} from 'node:fs';
import {writeFile,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {normalizeQuoteDocument,quoteDocumentSnapshot,renderQuoteDocument,rubles} from './quote-document15.mjs';

export const QUOTE_FILE_LIMIT=15*1024*1024;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const fileKey=/^quotes\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.pdf$/;
const error=(status,message)=>Object.assign(new Error(message),{status});

// Prices are parsed as integer kopecks; binary floating point never rounds a
// customer's commercial offer. Number remains exact at the accepted ceiling.
export function quoteAmount(value,fail=error){
 if(typeof value!=='string'||value.length>30)throw fail(422,'Укажите сумму КП в рублях.');
 const normalized=value.trim().replace(',','.');
 if(!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(normalized))throw fail(422,'Сумма КП — до 9 999 999 999,99 ₽, не более двух знаков после запятой.');
 const [rubles,fraction='']=normalized.split('.');
 const amount=Number(rubles)*100+Number(fraction.padEnd(2,'0'));
 if(!Number.isSafeInteger(amount)||amount<=0)throw fail(422,'Сумма КП должна быть больше нуля.');
 return amount;
}
const formattedAmount=value=>Math.floor(value/100)+'.'+String(value%100).padStart(2,'0');

export function initializeQuotes(db){
 db.exec(`CREATE TABLE IF NOT EXISTS quote_versions(
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK(version>0),
  amount_kopecks INTEGER NOT NULL CHECK(amount_kopecks>0),
  timeframe TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  size INTEGER NOT NULL CHECK(size>0),
  file_key TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','sent')),
  sent_at TEXT NOT NULL DEFAULT '',
  archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
  created TEXT NOT NULL,
  created_by TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  idempotency TEXT NOT NULL,
  digest TEXT NOT NULL,
  UNIQUE(lead_id,version),UNIQUE(lead_id,idempotency)
 ); CREATE INDEX IF NOT EXISTS quote_versions_lead ON quote_versions(lead_id,version);`);
 const columns=new Set(db.prepare('PRAGMA table_info(quote_versions)').all().map(row=>row.name));
 if(!columns.has('document_json'))db.exec("ALTER TABLE quote_versions ADD COLUMN document_json TEXT NOT NULL DEFAULT ''");
}

// The factory does not expose an HTTP endpoint. Its caller must authenticate
// every read/download and enforce CSRF and same-origin checks on every write.
export function createQuotes({db,dataDir,fail=error,text,audit=()=>{},now=()=>new Date(),content,onManagerAction}){
 initializeQuotes(db);
 if(onManagerAction!==undefined&&typeof onManagerAction!=='function')throw new TypeError('Quote onManagerAction must be a synchronous function.');
 const managerAction=event=>{if(onManagerAction){const result=onManagerAction(event);if(result&&typeof result.then==='function')throw new TypeError('Quote onManagerAction must record history synchronously.');}};
 const directory=path.join(dataDir,'quotes');mkdirSync(directory,{recursive:true,mode:0o700});
 const clean=(value,max,required=false)=>{
  if(text)return text(value,max,required);
  if(typeof value!=='string'||value.length>max||(required&&!value.trim())||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw fail(422,'Проверьте поля КП.');
  return value.trim();
 };
 const getLead=id=>{
  if(typeof id!=='string'||id.length>80)throw fail(404,'Заявка не найдена.');
  const lead=db.prepare('SELECT id,status,revision FROM leads WHERE id=?').get(id);
  if(!lead)throw fail(404,'Заявка не найдена.');return lead;
 };
 const getQuote=(leadId,id)=>{
  getLead(leadId);
  if(typeof id!=='string'||!uuid.test(id))throw fail(404,'КП не найдено.');
  const row=db.prepare('SELECT * FROM quote_versions WHERE lead_id=? AND id=?').get(leadId,id);
  if(!row)throw fail(404,'КП не найдено.');return row;
 };
 const present=row=>({id:row.id,version:row.version,amount:formattedAmount(row.amount_kopecks),amountKopecks:row.amount_kopecks,timeframe:row.timeframe,note:row.note,name:row.name,size:row.size,state:row.state,sentAt:row.sent_at,archived:Boolean(row.archived),createdAt:row.created,createdBy:row.created_by,revision:row.revision,document:row.document_json?JSON.parse(row.document_json):null,downloadUrl:'/api/admin/leads/'+encodeURIComponent(row.lead_id)+'/quotes/'+row.id+'/file'});
 const leadState=leadId=>{const lead=getLead(leadId);return {leadRevision:lead.revision,leadStatus:lead.status};};
 const atomic=callback=>{
  db.exec('BEGIN IMMEDIATE');
  try{const result=callback();db.exec('COMMIT');return result;}
  catch(e){db.exec('ROLLBACK');throw e;}
 };
 const bumpLead=leadId=>db.prepare('UPDATE leads SET revision=revision+1 WHERE id=?').run(leadId);
 const existingUpload=(leadId,key,digest)=>{
  const prior=db.prepare('SELECT * FROM quote_versions WHERE lead_id=? AND idempotency=?').get(leadId,key);
  if(!prior)return null;
  if(prior.digest!==digest)throw fail(409,'Данные КП изменились. Начните загрузку заново.');
  return {quote:present(prior),duplicate:true,...leadState(leadId)};
 };
 const save=async({leadId,key,digest,bytes,amount,timeframe,note,safeName,user,documentJson=''})=>{
  const id=randomUUID(),storageKey='quotes/'+id+'.pdf',localPath=path.join(dataDir,storageKey);let written=false;
  try{
   await writeFile(localPath,bytes,{mode:0o600,flag:'wx'});written=true;
   // Recheck inside the lock after asynchronous disk I/O: concurrent retries
   // must reuse a version, and concurrent uploads receive distinct numbers.
   const result=atomic(()=>{
    const priorLead=getLead(leadId);const retry=existingUpload(leadId,key,digest);if(retry)return retry;
    const version=db.prepare('SELECT COALESCE(MAX(version),0)+1 n FROM quote_versions WHERE lead_id=?').get(leadId).n;
    db.prepare(`INSERT INTO quote_versions(id,lead_id,version,amount_kopecks,timeframe,note,name,size,file_key,created,created_by,idempotency,digest,document_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,leadId,version,amount,timeframe,note,safeName,bytes.length,storageKey,now().toISOString(),user,key,digest,documentJson);
    bumpLead(leadId);managerAction({leadId,type:documentJson?'quote_built':'quote_uploaded',text:(documentJson?'Создана':'Загружена')+' версия КП №'+version+'.',username:user,fromStatus:priorLead.status,toStatus:priorLead.status});audit(user,documentJson?'quote_built':'quote_uploaded',id);
    return {quote:present(getQuote(leadId,id)),duplicate:false,...leadState(leadId)};
   });
   if(result.duplicate)await rm(localPath,{force:true});return result;
  }catch(e){if(written)await rm(localPath,{force:true}).catch(()=>{});throw e;}
 };
 const builds=new Map();
 const approvedForClient=(leadId,id)=>{
  for(const table of ['quote_client_approvals','lead_quote_publications']){
   if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)&&db.prepare('SELECT 1 FROM '+table+' WHERE lead_id=? AND quote_id=?').get(leadId,id))return true;
  }
  return false;
 };
 return {
  list(leadId){
   getLead(leadId);
   return {quotes:db.prepare('SELECT * FROM quote_versions WHERE lead_id=? ORDER BY version DESC').all(leadId).map(present),...leadState(leadId)};
  },
  async upload(leadId,form,username){
   getLead(leadId);
   if(!form||typeof form.getAll!=='function')throw fail(422,'Нужна форма КП с PDF.');
   const field=name=>{const entries=form.getAll(name);if(entries.length>1)throw fail(422,'Проверьте поля КП.');return entries[0]??'';};
   const key=clean(field('idempotency'),36,true);
   if(!uuid.test(key))throw fail(422,'Обновите форму загрузки КП.');
   const amount=quoteAmount(field('amount'),fail),timeframe=clean(field('timeframe'),160),note=clean(field('note'),1000),user=clean(username,60,true);
   const entries=form.getAll('files');
   if(entries.length!==1||typeof entries[0]==='string'||!entries[0]||typeof entries[0].arrayBuffer!=='function')throw fail(422,'Загрузите один PDF-файл КП.');
   const file=entries[0];
   if(!Number.isSafeInteger(file.size)||file.size<=0||file.size>QUOTE_FILE_LIMIT)throw fail(413,'PDF-файл КП — не более 15 МБ.');
   if(typeof file.name!=='string'||!/\.pdf$/i.test(file.name))throw fail(422,'КП должно быть PDF-файлом.');
   const name=path.basename(file.name.replaceAll('\\','/')).replace(/[\u0000-\u001f\u007f]/g,'').trim();
   const safeName=(name.slice(0,-4).slice(0,175).trim()||'КП')+'.pdf';
   const bytes=Buffer.from(await file.arrayBuffer());
   if(bytes.length!==file.size||bytes.length>QUOTE_FILE_LIMIT)throw fail(413,'Проверьте размер PDF-файла КП.');
   if(!/^%PDF-(?:1\.[0-7]|2\.0)[\r\n \t]/.test(bytes.subarray(0,16).toString('ascii'))||!bytes.subarray(Math.max(0,bytes.length-8192)).includes(Buffer.from('%%EOF')))throw fail(422,'PDF-файл повреждён или не соответствует формату.');
   const digest=createHash('sha256').update(JSON.stringify({amount,timeframe,note,name:safeName,size:bytes.length})).update(bytes).digest('hex');
   const duplicate=existingUpload(leadId,key,digest);if(duplicate)return duplicate;
   return save({leadId,key,digest,bytes,amount,timeframe,note,safeName,user});
  },
  async build(leadId,input,username){
   getLead(leadId);
   const document=normalizeQuoteDocument(input,{fail,text}),key=clean(input.idempotency,36,true),user=clean(username,60,true);
   if(!uuid.test(key))throw fail(422,'Обновите форму конструктора КП.');
   const digest='build:'+createHash('sha256').update(JSON.stringify(document)).digest('hex');
   // Retrying manager input returns its original company/customer snapshot,
   // even when the CMS or lead changes later. It never re-renders a saved PDF.
   const duplicate=existingUpload(leadId,key,digest);if(duplicate)return duplicate;
   const flightKey=leadId+':'+key,inFlight=builds.get(flightKey);
   if(inFlight){if(inFlight.digest!==digest)throw fail(409,'Данные КП изменились. Начните сборку заново.');return {...await inFlight.promise,duplicate:true};}
   if(typeof content!=='function')throw fail(503,'Данные компании недоступны для создания КП.');
   const source=db.prepare('SELECT reference,payload FROM leads WHERE id=?').get(leadId);
   const snapshot=quoteDocumentSnapshot(document,content().settings,{reference:source.reference,payload:JSON.parse(source.payload)},{fail,text});
   const promise=(async()=>{
    const bytes=await renderQuoteDocument(snapshot,{fail});
    return save({leadId,key,digest,bytes,amount:document.totals.totalKopecks,timeframe:document.timeframe,note:'',safeName:'КП_'+clean(source.reference,100).replace(/[^a-zA-Z0-9_-]/g,'')+'.pdf',user,documentJson:JSON.stringify(snapshot)});
   })();
   builds.set(flightKey,{digest,promise});
   try{return await promise;}finally{builds.delete(flightKey);}
  },
  update(leadId,id,input,username){
   if(!input||typeof input!=='object'||Array.isArray(input))throw fail(422,'Проверьте поля КП.');
   const allowed=new Set(['revision','state','archived','amount','timeframe','note']);
   if(Object.keys(input).some(key=>!allowed.has(key))||!Number.isSafeInteger(input.revision)||input.revision<1)throw fail(422,'Обновите карточку КП.');
   const user=clean(username,60,true);
   return atomic(()=>{
    const row=getQuote(leadId,id),priorLead=getLead(leadId);
    if(input.revision!==row.revision)throw fail(409,'КП изменено в другой вкладке. Обновите карточку.');
    const state=input.state??row.state;
    if(!['draft','sent'].includes(state)||row.state==='sent'&&state!=='sent')throw fail(422,'Отправленное КП сохранено в истории. Для изменения загрузите новую версию.');
    if(input.archived!==undefined&&typeof input.archived!=='boolean')throw fail(422,'Проверьте состояние архива КП.');
    const archived=input.archived===undefined?row.archived:Number(input.archived);
    if(archived&&row.state==='draft'&&state==='sent')throw fail(422,'Верните КП из архива перед отметкой об отправке.');
    const amount=input.amount===undefined?row.amount_kopecks:quoteAmount(input.amount,fail),timeframe=input.timeframe===undefined?row.timeframe:clean(input.timeframe,160),note=input.note===undefined?row.note:clean(input.note,1000);
    const metadataChanged=amount!==row.amount_kopecks||timeframe!==row.timeframe||note!==row.note;
    if(metadataChanged&&(row.state==='sent'||row.document_json||approvedForClient(leadId,id)))throw fail(422,'Сохраните изменения в новой версии КП.');
    const firstSent=row.state==='draft'&&state==='sent';
    if(!metadataChanged&&state===row.state&&archived===row.archived)return {quote:present(row),...leadState(leadId)};
    db.prepare('UPDATE quote_versions SET amount_kopecks=?,timeframe=?,note=?,state=?,sent_at=?,archived=?,revision=revision+1 WHERE id=?').run(amount,timeframe,note,state,firstSent?now().toISOString():row.sent_at,archived,id);
    if(firstSent)db.prepare("UPDATE leads SET status=CASE WHEN status IN ('won','closed') THEN status ELSE 'sent' END,revision=revision+1 WHERE id=?").run(leadId);
    else bumpLead(leadId);
    const action=firstSent?'quote_marked_sent':archived!==row.archived?'quote_archive_changed':'quote_updated';
    managerAction({leadId,type:action,text:firstSent?'Версия КП №'+row.version+' отмечена менеджером как отправленная.':archived!==row.archived?'Версия КП №'+row.version+(archived?' перенесена в архив.':' возвращена из архива.'):'Данные версии КП №'+row.version+' обновлены.',username:user,fromStatus:priorLead.status,toStatus:getLead(leadId).status});
    audit(user,action,id);
    return {quote:present(getQuote(leadId,id)),...leadState(leadId)};
   });
  },
  async download(leadId,id){
   const row=getQuote(leadId,id);
   if(!fileKey.test(row.file_key))throw fail(404,'Файл КП не найден.');
   const localPath=path.join(dataDir,row.file_key);
   let info;try{info=await stat(localPath);}catch{throw fail(404,'Файл КП не найден.');}
   if(!info.isFile()||info.size!==row.size)throw fail(404,'Файл КП не найден.');
   return {path:localPath,name:row.name,size:row.size,mime:'application/pdf'};
  }
 };
}
