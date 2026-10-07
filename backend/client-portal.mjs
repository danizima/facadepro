import {randomBytes,randomUUID} from 'node:crypto';
import {writeFile,rm} from 'node:fs/promises';
import path from 'node:path';

const LIFETIME=90*86400000;
const ID=/^[a-f0-9-]{36}$/;
const TOKEN=/^[a-f0-9]{64}$/;
const FILE_TYPES=new Set(['pdf','jpg','jpeg','png','webp','zip','docx','xlsx','dwg','dxf','txt']);
const STATUS_LABELS={new:'Получена',review:'В работе',estimate:'Готовим предложение',sent:'Предложение подготовлено',won:'Договор',closed:'Обращение завершено'};
const DEFAULT_MESSAGES={new:'Менеджер свяжется с вами для уточнения деталей.',review:'Уточняем состав работ и исходные данные.',estimate:'Готовим коммерческое предложение.',sent:'Обсудим предложение и ответим на ваши вопросы.',won:'Согласуем следующий этап работ.',closed:'Обращение завершено. Свяжитесь с менеджером, если появились новые вопросы.'};

/**
 * Additive client continuation for existing leads. Server integration:
 * createClientPortal({db,DATA,hash,privateHash,text,fail,content,transaction,signature,onAddition?}).
 * onAddition({leadId,additionId}) is synchronous and queues notifications inside
 * the append transaction; a queue failure rolls back the whole addition.
 * Include issue(leadId) in BOTH first and repeated successful form responses.
 * GET /api/client/lead: read(tokenFromHeader(req.headers.authorization)).
 * POST /api/client/lead/append: sameOrigin + rate + multipart + getFiles first,
 * then append(token,{idempotency,comment,projectLink},validatedFiles).
 * GET /api/admin/leads/:id/portal: admin(id), authenticated admin only.
 * POST same: adminAction(id,{action,customerMessage,revision}), with CSRF.
 * Tokens belong in /followup.html#token and Bearer headers, never a query/path.
 * Append file IDs use the existing private /api/admin/files/:id route only.
 */
export function createClientPortal({db,DATA,hash,privateHash,text,fail,content,transaction,signature,onAddition,now=Date.now,fileLimit=10*1024*1024,totalLimit=25*1024*1024,maxFiles=5}){
 if(typeof privateHash!=='function'||typeof signature!=='function')throw new TypeError('Portal requires keyed privateHash and the existing attachment signature validator.');
 if(onAddition!==undefined&&typeof onAddition!=='function')throw new TypeError('Portal onAddition must be a synchronous function.');
 db.exec(`
  CREATE TABLE IF NOT EXISTS lead_portals(
   lead_id TEXT PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
   generation TEXT NOT NULL,token_hash TEXT UNIQUE NOT NULL,
   created_at TEXT NOT NULL,expires INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,
   customer_message TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS lead_additions(
   id TEXT PRIMARY KEY,lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
   created_at TEXT NOT NULL,comment TEXT NOT NULL,project_link TEXT NOT NULL,
   idempotency TEXT NOT NULL,digest TEXT NOT NULL,UNIQUE(lead_id,idempotency)
  );
  CREATE TABLE IF NOT EXISTS lead_addition_files(
   addition_id TEXT NOT NULL REFERENCES lead_additions(id) ON DELETE CASCADE,
   file_id TEXT PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS lead_additions_lead ON lead_additions(lead_id,created_at);
 `);
 const runTransaction=transaction||((fn)=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}});
 const unavailable=()=>fail(404,'Ссылка недоступна или срок её действия завершён. Свяжитесь с менеджером.');
 function lead(leadId){const row=db.prepare('SELECT id,reference,status,revision FROM leads WHERE id=?').get(leadId);if(!row)throw fail(404,'Заявка не найдена.');return row;}
 const portalRow=leadId=>db.prepare('SELECT * FROM lead_portals WHERE lead_id=?').get(leadId);
 const active=row=>Boolean(row&&!row.revoked&&row.expires>now());
 const tokenFor=row=>privateHash('client-portal-v14:'+row.lead_id+':'+row.generation);
 function tokenFromHeader(value){if(typeof value!=='string')throw unavailable();const match=/^Bearer ([a-f0-9]{64})$/.exec(value);if(!match)throw unavailable();return match[1];}
 function authorize(token){
  if(typeof token!=='string'||!TOKEN.test(token))throw unavailable();
  const row=db.prepare('SELECT * FROM lead_portals WHERE token_hash=?').get(hash(token));
  if(!active(row)||!db.prepare('SELECT id FROM leads WHERE id=?').get(row.lead_id))throw unavailable();
  return row;
 }
 function issuance(row){return {continuationUrl:active(row)?'/followup.html#'+tokenFor(row):null,continuationExpiresAt:new Date(row.expires).toISOString()};}
 function issue(leadId,{rotate=false,customerMessage}={}){
  lead(leadId);
  const message=customerMessage===undefined?undefined:text(customerMessage,2000);
  return runTransaction(()=>{
   let row=portalRow(leadId);
   if(!row||rotate){
    const generation=randomBytes(32).toString('hex'),createdAt=new Date(now()).toISOString(),expires=now()+LIFETIME;
    const token=privateHash('client-portal-v14:'+leadId+':'+generation);
    if(typeof token!=='string'||!TOKEN.test(token))throw new TypeError('Portal privateHash must return a 256-bit hexadecimal digest.');
    if(!row)db.prepare('INSERT INTO lead_portals(lead_id,generation,token_hash,created_at,expires,customer_message) VALUES(?,?,?,?,?,?)').run(leadId,generation,hash(token),createdAt,expires,message??'');
    else db.prepare('UPDATE lead_portals SET generation=?,token_hash=?,created_at=?,expires=?,revoked=0,customer_message=?,revision=revision+1 WHERE lead_id=?').run(generation,hash(token),createdAt,expires,message??row.customer_message,leadId);
    db.prepare('UPDATE leads SET revision=revision+1 WHERE id=?').run(leadId);
    row=portalRow(leadId);
   }
   return issuance(row);
  });
 }
 function additions(leadId,forAdmin=false){
  return db.prepare('SELECT id,created_at,comment,project_link FROM lead_additions WHERE lead_id=? ORDER BY created_at,id').all(leadId).map(row=>{
   const files=db.prepare('SELECT f.id,f.name,f.size FROM files f JOIN lead_addition_files af ON af.file_id=f.id WHERE af.addition_id=? ORDER BY f.rowid').all(row.id);
   return {...(forAdmin?{id:row.id}:{}),createdAt:row.created_at,comment:row.comment,projectLink:row.project_link,files:files.map(f=>({...((forAdmin)?{id:f.id}:{}),name:f.name,size:f.size}))};
  });
 }
 function read(token){
  const row=authorize(token),request=lead(row.lead_id),settings=content().settings;
  const status=Object.hasOwn(STATUS_LABELS,request.status)?request.status:'review';
  return {
   reference:request.reference,status,statusLabel:STATUS_LABELS[status],
   manager:{name:settings.manager,phone:settings.phone,email:settings.email},
   customerMessage:row.customer_message||DEFAULT_MESSAGES[status],expiresAt:new Date(row.expires).toISOString(),updates:additions(row.lead_id)
  };
 }
 function admin(leadId){
  const request=lead(leadId),row=portalRow(leadId);
  return {active:active(row),expiresAt:row?new Date(row.expires).toISOString():null,customerMessage:row?.customer_message||'',revision:row?.revision||0,leadRevision:request.revision,updates:additions(leadId,true)};
 }
 function adminAction(leadId,input){
  lead(leadId);
  if(!input||typeof input!=='object'||!['issue','revoke','message'].includes(input.action))throw fail(422,'Выберите действие со ссылкой.');
  const row=portalRow(leadId);
  if(input.revision!==undefined&&input.revision!==(row?.revision||0))throw fail(409,'Доступ к заявке изменён. Обновите карточку.');
  const message=input.customerMessage===undefined?undefined:text(input.customerMessage,2000);
  if(input.action==='issue'){
   const result=issue(leadId,{rotate:true,customerMessage:message});
   return {...admin(leadId),url:result.continuationUrl};
  }
  if(!row)throw fail(404,'Ссылка ещё не создана.');
  if(input.action==='message'&&message===undefined)throw fail(422,'Укажите следующий шаг для заказчика.');
  runTransaction(()=>{
   db.prepare('UPDATE lead_portals SET revoked=?,customer_message=?,revision=revision+1 WHERE lead_id=?').run(input.action==='revoke'?1:row.revoked,message??row.customer_message,leadId);
   db.prepare('UPDATE leads SET revision=revision+1 WHERE id=?').run(leadId);
  });
  return admin(leadId);
 }
 function validateProjectLink(value){
  const link=text(value||'',2000);if(!link)return '';
  let url;try{url=new URL(link);}catch{throw fail(422,'Укажите полную HTTPS-ссылку на проект.');}
  if(url.protocol!=='https:'||url.username||url.password||!url.hostname)throw fail(422,'Укажите полную HTTPS-ссылку на проект без логина и пароля.');
  return url.href;
 }
 function validateFiles(files){
  if(!Array.isArray(files)||files.length>maxFiles)throw fail(422,'Допустимо не более '+maxFiles+' файлов.');
  let total=0;const ids=new Set();
  return files.map(file=>{
   if(!file||!ID.test(file.id)||ids.has(file.id)||!Buffer.isBuffer(file.bytes)||!Number.isSafeInteger(file.size)||file.size<1||file.bytes.length!==file.size)throw fail(422,'Проверьте файлы дополнения.');
   ids.add(file.id);total+=file.size;
   if(file.size>fileLimit||total>totalLimit)throw fail(413,'Превышен допустимый размер файлов.');
   if(typeof file.name!=='string'||typeof file.ext!=='string')throw fail(422,'Проверьте имя файла.');
   const name=path.basename(file.name.replaceAll('\\','/')).replace(/[\r\n\u0000-\u001f]/g,'').slice(0,180),ext=file.ext.toLowerCase();
   if(!name||!FILE_TYPES.has(ext)||name.split('.').at(-1).toLowerCase()!==ext||!signature(file.bytes,ext))throw fail(422,'Неподдерживаемый или повреждённый файл: '+name);
   return {...file,name,ext};
  });
 }
 async function append(token,input,sourceFiles=[]){
  const row=authorize(token);
  if(!input||typeof input!=='object')throw fail(422,'Проверьте дополнение.');
  const key=text(input.idempotency||'',80,true);if(!ID.test(key))throw fail(422,'Обновите страницу и повторите отправку.');
  const comment=text(input.comment||'',3000),projectLink=validateProjectLink(input.projectLink),files=validateFiles(sourceFiles);
  if(!comment&&!projectLink&&!files.length)throw fail(422,'Добавьте комментарий, ссылку или файлы.');
  const digest=hash(JSON.stringify({comment,projectLink,files:files.map(file=>({name:file.name,size:file.size,ext:file.ext,digest:hash(file.bytes)}))}));
  const prior=()=>db.prepare('SELECT id,created_at,digest FROM lead_additions WHERE lead_id=? AND idempotency=?').get(row.lead_id,key);
  function checkPrior(previous){if(previous&&previous.digest!==digest)throw fail(409,'Дополнение изменилось. Повторите отправку с новым номером.');return previous;}
  function receipt(saved,replayed){const safeLead=read(token);return {received:true,reference:safeLead.reference,addedAt:saved.created_at,fileCount:files.length,replayed,lead:safeLead};}
  const previous=checkPrior(prior());if(previous)return receipt(previous,true);
  const written=[];let committed=false;
  try{
   for(const file of files){await writeFile(path.join(DATA,'uploads',file.id),file.bytes,{mode:0o600,flag:'wx'});written.push(file.id);}
   const result=runTransaction(()=>{
    authorize(token);const existing=checkPrior(prior());if(existing)return {saved:existing,replayed:true};
    const id=randomUUID(),createdAt=new Date(now()).toISOString();
    db.prepare('INSERT INTO lead_additions VALUES(?,?,?,?,?,?,?)').run(id,row.lead_id,createdAt,comment,projectLink,key,digest);
    for(const file of files){
     db.prepare('INSERT INTO files(id,lead_id,name,size,ext) VALUES(?,?,?,?,?)').run(file.id,row.lead_id,file.name,file.size,file.ext);
     db.prepare('INSERT INTO lead_addition_files VALUES(?,?)').run(id,file.id);
    }
    db.prepare('UPDATE leads SET revision=revision+1 WHERE id=?').run(row.lead_id);
    if(onAddition){const result=onAddition({leadId:row.lead_id,additionId:id});if(result&&typeof result.then==='function')throw new TypeError('Portal onAddition must queue notifications synchronously.');}
    return {saved:{id,created_at:createdAt},replayed:false};
   });
   committed=!result.replayed;
   if(result.replayed)for(const id of written)await rm(path.join(DATA,'uploads',id),{force:true});
   return receipt(result.saved,result.replayed);
  }catch(error){if(!committed)for(const id of written)await rm(path.join(DATA,'uploads',id),{force:true});throw error;}
 }
 return {issue,read,append,admin,adminAction,authorize,tokenFromHeader};
}
