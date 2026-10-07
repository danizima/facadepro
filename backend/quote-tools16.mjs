import {createHash,randomUUID} from 'node:crypto';
import {normalizeQuoteDocument} from './quote-document15.mjs';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const maximum=999999999999n;
const categories=['crew','equipment','transport','materials','other'];
const defaultFail=(status,message)=>Object.assign(new Error(message),{status});
const rounded=(value,denominator)=>(value+denominator/2n)/denominator;
const money=value=>{const negative=value<0n,n=negative?-value:value;return (negative?'-':'')+(n/100n).toString()+'.'+(n%100n).toString().padStart(2,'0');};
const quantity=value=>{const whole=value/1000n,fraction=(value%1000n).toString().padStart(3,'0').replace(/0+$/,'');return whole.toString()+(fraction?'.'+fraction:'');};

// Both modules remain staff-only. Template inputs deliberately contain no
// customer/company snapshot, expiry date, generated PDF or pricing defaults.
export function createQuoteTools16({db,fail=defaultFail,text,transaction,audit=()=>{},crm,now=()=>new Date(),SERVICE_IDS=['glazing','windows','repair','engineering','supply','height']}){
 db.exec(`CREATE TABLE IF NOT EXISTS quote_templates16(
  id TEXT PRIMARY KEY,name TEXT NOT NULL,service_ids TEXT NOT NULL,document_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,created_by TEXT NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL
 );
 CREATE TABLE IF NOT EXISTS quote_template_receipts16(
  idempotency TEXT PRIMARY KEY,digest TEXT NOT NULL,result_json TEXT NOT NULL
 );
 CREATE TABLE IF NOT EXISTS lead_costing16(
  lead_id TEXT PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
  basis TEXT NOT NULL CHECK(basis='comparable'),revenue_kopecks TEXT,
  costs_json TEXT NOT NULL,total_cost_kopecks TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL
 );`);
 const clean=(value,max,required=false)=>{
  if(text)return text(value,max,required);
  if(typeof value!=='string'||value.length>max||required&&!value.trim()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))throw fail(422,'Проверьте заполнение полей.');
  return value.trim();
 };
 const object=(value,keys)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))throw fail(422,'Проверьте поля расчёта или шаблона.');};
 const atomic=transaction||((fn)=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}});
 const idOK=id=>{if(typeof id!=='string'||!UUID.test(id))throw fail(404,'Запись не найдена.');return id;};
 const keyOf=input=>{const key=clean(input.idempotency??'',36,true);if(!UUID.test(key))throw fail(422,'Обновите форму шаблона.');return key;};
 const revisionOf=value=>{if(!Number.isSafeInteger(value)||value<0)throw fail(422,'Обновите версию записи.');return value;};
 const checksum=input=>createHash('sha256').update(JSON.stringify(input)).digest('hex');
 const lead=id=>{idOK(id);const row=db.prepare('SELECT id,revision,status FROM leads WHERE id=?').get(id);if(!row)throw fail(404,'Заявка не найдена.');return row;};
 const state=id=>{const row=lead(id);return {leadRevision:row.revision,leadStatus:row.status};};
 const fromTemplate=row=>({id:row.id,name:row.name,serviceIds:JSON.parse(row.service_ids),document:JSON.parse(row.document_json),revision:row.revision,createdAt:row.created_at,createdBy:row.created_by,updatedAt:row.updated_at,updatedBy:row.updated_by});
 const activeTemplate=id=>{idOK(id);const row=db.prepare('SELECT * FROM quote_templates16 WHERE id=? AND archived=0').get(id);if(!row)throw fail(404,'Шаблон не найден.');return row;};
 function templates(){return {templates:db.prepare('SELECT * FROM quote_templates16 WHERE archived=0 ORDER BY name COLLATE NOCASE,id').all().map(fromTemplate)};}
 function templateInput(input,update=false){
  object(input,['name','serviceIds','document','idempotency',...(update?['revision']:[])]);
  const name=clean(input.name,100,true),ids=input.serviceIds??[];
  if(!Array.isArray(ids)||ids.length>SERVICE_IDS.length||ids.some(id=>!SERVICE_IDS.includes(id)))throw fail(422,'Выберите направления работ для шаблона.');
  const serviceIds=[...new Set(ids)].sort(),raw=input.document;
  object(raw,['idempotency','title','items','tax','timeframe','validUntil','payment','exclusions','customerNote','totals','company','customer']);
  if(!Array.isArray(raw.items))throw fail(422,'Добавьте позиции в конструктор КП.');
  const documentItems=raw.items.map(item=>{
   object(item,['title','unit','quantity','unitPrice','lineTotalKopecks']);
   return {title:item.title,unit:item.unit,quantity:item.quantity,unitPrice:item.unitPrice};
  });
  const normalized=normalizeQuoteDocument({title:raw.title,items:documentItems,tax:raw.tax,timeframe:raw.timeframe??'',validUntil:raw.validUntil??'',payment:raw.payment??'',exclusions:raw.exclusions??'',customerNote:raw.customerNote??''},{fail,text});
  const document={title:normalized.title,items:normalized.items.map(({lineTotalKopecks,...item})=>item),tax:normalized.tax,timeframe:normalized.timeframe,validUntil:'',payment:normalized.payment,exclusions:normalized.exclusions,customerNote:normalized.customerNote};
  return {name,serviceIds,document,...(update?{revision:revisionOf(input.revision)}:{})};
 }
 function templateMutation(key,input,mutate){
  const digest=checksum(input);
  return atomic(()=>{
   const prior=db.prepare('SELECT * FROM quote_template_receipts16 WHERE idempotency=?').get(key);
   if(prior){if(prior.digest!==digest)throw fail(409,'Данные шаблона изменились. Начните новое сохранение.');return {...JSON.parse(prior.result_json),duplicate:true};}
   const result=mutate();db.prepare('INSERT INTO quote_template_receipts16(idempotency,digest,result_json) VALUES(?,?,?)').run(key,digest,JSON.stringify(result));return {...result,duplicate:false};
  });
 }
 function templateCreate(input,username){
  const data=templateInput(input),key=keyOf(input),user=clean(username,60,true);
  return templateMutation(key,{action:'create',...data},()=>{
   if(db.prepare('SELECT COUNT(*) count FROM quote_templates16 WHERE archived=0').get().count>=200)throw fail(422,'Сохранено 200 шаблонов. Удалите ненужные перед созданием нового.');
   const id=randomUUID(),stamp=now().toISOString();
   db.prepare('INSERT INTO quote_templates16(id,name,service_ids,document_json,created_at,created_by,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?)').run(id,data.name,JSON.stringify(data.serviceIds),JSON.stringify(data.document),stamp,user,stamp,user);
   audit(user,'quote_template_created',id);return {template:fromTemplate(activeTemplate(id))};
  });
 }
 function templateUpdate(id,input,username){
  idOK(id);const data=templateInput(input,true),key=keyOf(input),user=clean(username,60,true);
  return templateMutation(key,{action:'update',id,...data},()=>{
   const row=activeTemplate(id);if(row.revision!==data.revision)throw fail(409,'Шаблон изменён другим сотрудником. Обновите список и проверьте данные.');
   db.prepare('UPDATE quote_templates16 SET name=?,service_ids=?,document_json=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=? AND revision=? AND archived=0').run(data.name,JSON.stringify(data.serviceIds),JSON.stringify(data.document),now().toISOString(),user,id,data.revision);
   audit(user,'quote_template_updated',id);return {template:fromTemplate(activeTemplate(id))};
  });
 }
 function templateDelete(id,input,username){
  idOK(id);object(input,['revision','idempotency']);const revision=revisionOf(input.revision),key=keyOf(input),user=clean(username,60,true);
  return templateMutation(key,{action:'delete',id,revision},()=>{
   const row=activeTemplate(id);if(row.revision!==revision)throw fail(409,'Шаблон изменён другим сотрудником. Обновите список перед удалением.');
   db.prepare('UPDATE quote_templates16 SET archived=1,revision=revision+1,updated_at=?,updated_by=? WHERE id=? AND revision=? AND archived=0').run(now().toISOString(),user,id,revision);
   audit(user,'quote_template_archived',id);return {removed:true};
  });
 }
 function scaled(value,places,max,label,positive=false){
  if(typeof value!=='string'||value.length>30)throw fail(422,'Проверьте '+label+'.');
  const normalized=value.trim().replace(',','.'),pattern=new RegExp('^(?:0|[1-9]\\d{0,9})(?:\\.\\d{1,'+places+'})?$');
  if(!pattern.test(normalized))throw fail(422,'Проверьте '+label+': укажите десятичное число, не более '+places+' знаков после запятой.');
  const [whole,fraction='']=normalized.split('.'),result=BigInt(whole)*10n**BigInt(places)+BigInt(fraction.padEnd(places,'0'));
  if(result>max||positive&&result===0n)throw fail(422,'Проверьте '+label+'.');return result;
 }
 function costingInput(input){
  object(input,['revision','basis','revenue','costs','note']);const revision=revisionOf(input.revision);
  if(input.basis!=='comparable')throw fail(422,'Подтвердите, что выручка и затраты указаны на одной основе сравнения по НДС.');
  if(typeof input.revenue!=='string')throw fail(422,'Укажите выручку в рублях или оставьте поле пустым.');
  const revenue=input.revenue.trim()===''?null:scaled(input.revenue,2,maximum,'выручку');
  if(!Array.isArray(input.costs)||input.costs.length>50)throw fail(422,'Добавьте не более 50 статей затрат.');
  let totalCost=0n;
  const costs=input.costs.map(item=>{
   object(item,['category','title','quantity','unitPrice']);if(!categories.includes(item.category))throw fail(422,'Выберите статью затрат.');
   const title=clean(item.title,300,true),qty=scaled(item.quantity,3,1000000000n,'количество',true),price=scaled(item.unitPrice,2,maximum,'цену');
   const line=rounded(qty*price,1000n);totalCost+=line;
   if(totalCost>maximum)throw fail(422,'Сумма затрат превышает 9 999 999 999,99 ₽.');
   return {category:item.category,title,quantity:quantity(qty),unitPrice:money(price),lineTotal:money(line)};
  });
  return {revision,basis:'comparable',revenue,costs,totalCost,note:clean(input.note??'',2000)};
 }
 function costing(id){
  const current=state(id),row=db.prepare('SELECT * FROM lead_costing16 WHERE lead_id=?').get(id);
  if(!row)return {revision:0,basis:'comparable',revenue:'',costs:[],totalCost:'0.00',plannedMargin:null,marginPercent:null,note:'',updatedAt:'',updatedBy:'',...current};
  const revenue=row.revenue_kopecks===null?null:BigInt(row.revenue_kopecks),totalCost=BigInt(row.total_cost_kopecks),margin=revenue===null?null:revenue-totalCost;
  let marginPercent=null;
  if(revenue!==null&&revenue>0n){const absolute=margin<0n?-margin:margin,n=rounded(absolute*10000n,revenue);marginPercent=money(margin<0n?-n:n);}
  return {revision:row.revision,basis:row.basis,revenue:revenue===null?'':money(revenue),costs:JSON.parse(row.costs_json),totalCost:money(totalCost),plannedMargin:margin===null?null:money(margin),marginPercent,note:row.note,updatedAt:row.updated_at,updatedBy:row.updated_by,...current};
 }
 function saveCosting(id,input,username){
  lead(id);const data=costingInput(input),user=clean(username,60,true);
  return atomic(()=>{
   lead(id);const current=db.prepare('SELECT revision FROM lead_costing16 WHERE lead_id=?').get(id),revision=current?.revision??0;
   if(data.revision!==revision)throw fail(409,'Расчёт изменён другим сотрудником. Обновите расчёт и проверьте свои изменения.');
   const stamp=now().toISOString(),revenue=data.revenue===null?null:data.revenue.toString();
   if(!current)db.prepare('INSERT INTO lead_costing16(lead_id,basis,revenue_kopecks,costs_json,total_cost_kopecks,note,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?)').run(id,data.basis,revenue,JSON.stringify(data.costs),data.totalCost.toString(),data.note,stamp,user);
   else db.prepare('UPDATE lead_costing16 SET basis=?,revenue_kopecks=?,costs_json=?,total_cost_kopecks=?,note=?,revision=revision+1,updated_at=?,updated_by=? WHERE lead_id=? AND revision=?').run(data.basis,revenue,JSON.stringify(data.costs),data.totalCost.toString(),data.note,stamp,user,id,revision);
   db.prepare('UPDATE leads SET revision=revision+1 WHERE id=?').run(id);
   crm?.recordManagerAction({leadId:id,type:'costing_saved',text:'Внутренний плановый расчёт обновлён.',username:user});
   audit(user,'lead_costing_updated',id);return costing(id);
  });
 }
 return {templates,templateCreate,templateUpdate,templateDelete,costing,saveCosting};
}
