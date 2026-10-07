import {randomUUID,randomBytes,createHash} from 'node:crypto';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const defaultFail=(status,message)=>Object.assign(new Error(message),{status});
const dateOK=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const sources=['phone','email','site_visit','other'];
const formatAmount=n=>typeof n==='bigint'?(n/100n).toString()+'.'+(n%100n).toString().padStart(2,'0'):Math.floor(n/100)+'.'+String(n%100).padStart(2,'0');
const normalizedPhone=s=>{const digits=s.replace(/\D/g,'');return digits.length===11&&digits.startsWith('8')?'7'+digits.slice(1):digits;};

export function validateAttribution(input,fail=defaultFail){
 if(!input||typeof input!=='object'||Array.isArray(input))throw fail(422,'Проверьте источник обращения.');
 const out={};
 for(const [key,max] of [['source',80],['medium',80],['campaign',160],['content',160],['term',160],['landing',200]]){
  const value=input[key]??'';
  if(typeof value!=='string'||value.length>max||/[\u0000-\u001f\u007f]/.test(value))throw fail(422,'Проверьте источник обращения.');
  out[key]=value.trim();
 }
 if(out.landing){if(!out.landing.startsWith('/')||out.landing.startsWith('//')||out.landing.includes('\\'))throw fail(422,'Проверьте страницу обращения.');out.landing=out.landing.split(/[?#]/)[0];}
 return out;
}

export function createCRM15({db,fail=defaultFail,text,emailOK,SERVICE_IDS=[],STATUSES={},audit=()=>{},transaction,hash,staff=()=>[],now=()=>new Date()}){
 db.exec(`CREATE TABLE IF NOT EXISTS lead_history(
  id TEXT PRIMARY KEY,lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  type TEXT NOT NULL,text TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,created_by TEXT NOT NULL,
  from_status TEXT NOT NULL DEFAULT '',to_status TEXT NOT NULL DEFAULT '',idempotency TEXT,digest TEXT NOT NULL DEFAULT '',
  UNIQUE(lead_id,idempotency)
 );CREATE INDEX IF NOT EXISTS lead_history_lead ON lead_history(lead_id,created_at);
 CREATE TABLE IF NOT EXISTS lead_commercial(
  lead_id TEXT PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,amount_kopecks INTEGER,
  loss_reason TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL
 );
 CREATE TABLE IF NOT EXISTS lead_attribution(
  lead_id TEXT PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,source TEXT NOT NULL DEFAULT '',medium TEXT NOT NULL DEFAULT '',
  campaign TEXT NOT NULL DEFAULT '',content TEXT NOT NULL DEFAULT '',term TEXT NOT NULL DEFAULT '',landing TEXT NOT NULL DEFAULT '',captured_at TEXT NOT NULL
 );`);
 const clean=(value,max,required=false)=>{if(text)return text(value,max,required);if(typeof value!=='string'||value.length>max||(required&&!value.trim())||/[\u0000-\u001f\u007f]/.test(value))throw fail(422,'Проверьте поля.');return value.trim();};
 const atomic=transaction||((fn)=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}});
 const digest=value=>hash?hash(value):createHash('sha256').update(value).digest('hex');
 const lead=id=>{if(typeof id!=='string'||!UUID.test(id))throw fail(404,'Заявка не найдена.');const row=db.prepare('SELECT * FROM leads WHERE id=?').get(id);if(!row)throw fail(404,'Заявка не найдена.');return row;};
 const state=id=>{const row=lead(id);return {leadRevision:row.revision,leadStatus:row.status};};
 const bump=id=>db.prepare('UPDATE leads SET revision=revision+1 WHERE id=?').run(id);
 const record=(id,type,message,username,{fromStatus='',toStatus='',idempotency=null,checksum=''}={})=>{const key=randomUUID();db.prepare('INSERT INTO lead_history(id,lead_id,type,text,created_at,created_by,from_status,to_status,idempotency,digest) VALUES(?,?,?,?,?,?,?,?,?,?)').run(key,id,type,message,now().toISOString(),username,fromStatus,toStatus,idempotency,checksum);return key;};
 function history(id){lead(id);const entries=db.prepare('SELECT * FROM lead_history WHERE lead_id=? ORDER BY created_at DESC,rowid DESC').all(id).map(r=>({id:r.id,type:r.type,text:r.text,createdAt:r.created_at,createdBy:r.created_by,...(r.from_status?{fromStatus:r.from_status}:{}),...(r.to_status?{toStatus:r.to_status}:{})}));return {entries,...state(id)};}
 function captureAttribution(id,input){lead(id);const a=validateAttribution(input,fail);db.prepare('INSERT OR IGNORE INTO lead_attribution(lead_id,source,medium,campaign,content,term,landing,captured_at) VALUES(?,?,?,?,?,?,?,?)').run(id,a.source,a.medium,a.campaign,a.content,a.term,a.landing,now().toISOString());}
 function commercial(id){lead(id);const row=db.prepare('SELECT * FROM lead_commercial WHERE lead_id=?').get(id);return {amount:row?.amount_kopecks===null||!row?'':formatAmount(row.amount_kopecks),lossReason:row?.loss_reason||'',revision:row?.revision||0,...state(id)};}
 function parseAmount(value){if(typeof value!=='string'||value.length>30)throw fail(422,'Укажите сумму договора в рублях.');const s=value.trim().replace(',','.');if(!s)return null;if(!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(s))throw fail(422,'Сумма договора — до 9 999 999 999,99 ₽, не более двух знаков после запятой.');const [rub,fraction='']=s.split('.'),kopecks=Number(rub)*100+Number(fraction.padEnd(2,'0'));if(!Number.isSafeInteger(kopecks)||kopecks<=0)throw fail(422,'Сумма договора должна быть больше нуля.');return kopecks;}
 function create(input,username){
  if(!input||typeof input!=='object'||Array.isArray(input))throw fail(422,'Проверьте обращение.');
  const key=clean(input.idempotency||'',36,true);if(!UUID.test(key))throw fail(422,'Обновите форму нового обращения.');
  const name=clean(input.name,100,true),company=clean(input.company||'',150),phone=clean(input.phone||'',40),email=clean(input.email||'',200);
  if(!phone&&!email)throw fail(422,'Укажите телефон или email.');
  if(phone&&(!/^[+\d\s().-]+$/.test(phone)||phone.replace(/\D/g,'').length<7||phone.replace(/\D/g,'').length>15))throw fail(422,'Проверьте телефон.');
  if(email&&!(emailOK?emailOK(email):/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)))throw fail(422,'Проверьте email.');
  const serviceList=input.services??[];if(!Array.isArray(serviceList)||serviceList.length>SERVICE_IDS.length||serviceList.some(s=>!SERVICE_IDS.includes(s)))throw fail(422,'Выберите направления работ.');
  const source=input.source;if(!sources.includes(source))throw fail(422,'Выберите источник обращения.');
  if(input.allowDuplicate!==undefined&&typeof input.allowDuplicate!=='boolean')throw fail(422,'Проверьте подтверждение нового обращения.');
  const assignee=clean(input.assignee||'',60),nextContact=clean(input.next_contact||'',10),nextAction=clean(input.next_action||'',500);
  if(assignee&&!staff().includes(assignee))throw fail(422,'Ответственный сотрудник не найден.');
  if(nextContact&&!dateOK(nextContact))throw fail(422,'Укажите корректную дату следующего контакта.');if(nextContact&&!nextAction)throw fail(422,'Укажите следующее действие.');
  const projectLink=clean(input.projectLink||'',2000);if(projectLink){let url;try{url=new URL(projectLink);}catch{throw fail(422,'Укажите ссылку на проект.');}if(url.protocol!=='https:'||url.username||url.password)throw fail(422,'Ссылка на проект должна начинаться с https://.');}
  const payload={kind:'manual',name,company,phone,email,services:[...new Set(serviceList)],object:clean(input.object||'',100)||'Уточняется',city:clean(input.city||'',120)||'Уточняется',timing:'Уточняется',area:'',documents:'',height:'',system:'',deadline:'',comment:clean(input.comment||'',3000),manualSource:source,sourcePage:'Вручную: '+source,projectLink};
  const checksum=digest(JSON.stringify({payload,assignee,nextContact,nextAction,allowDuplicate:input.allowDuplicate===true}));
  return atomic(()=>{
   const prior=db.prepare('SELECT id,reference,digest FROM leads WHERE idempotency=?').get(key);if(prior){if(prior.digest!==checksum)throw fail(409,'Данные обращения изменились. Начните новую запись.');return {id:prior.id,reference:prior.reference,duplicate:true,...state(prior.id)};}
   if(input.allowDuplicate!==true){const p=phone?normalizedPhone(phone):'',mail=email.toLocaleLowerCase('en-US'),matches=[];for(const row of db.prepare('SELECT id,reference,payload FROM leads ORDER BY created DESC').all()){const other=JSON.parse(row.payload);if((p&&typeof other.phone==='string'&&normalizedPhone(other.phone)===p)||(mail&&typeof other.email==='string'&&other.email.trim().toLocaleLowerCase('en-US')===mail))matches.push({id:row.id,reference:row.reference,name:String(other.name||'').slice(0,100)});if(matches.length>=20)break;}if(matches.length)throw Object.assign(fail(409,'Есть обращения с таким контактом. Откройте существующее или подтвердите новую запись.'),{matches});}
   const id=randomUUID(),reference='FP-'+now().toISOString().slice(0,10).replaceAll('-','')+'-'+randomBytes(4).toString('hex').toUpperCase();
   db.prepare('INSERT INTO leads(id,reference,created,kind,status,payload,idempotency,digest,assignee,next_contact,next_action) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,reference,now().toISOString(),'manual','new',JSON.stringify(payload),key,checksum,assignee,nextContact,nextAction);
   captureAttribution(id,{source:'manual:'+source,medium:'manual'});record(id,'created','Обращение добавлено менеджером.',username);audit(username,'manual_lead_created',id);
   return {id,reference,duplicate:false,...state(id)};
  });
 }
 function appendHistory(id,input,username){lead(id);if(!input||!['call','meeting','comment'].includes(input.type))throw fail(422,'Выберите звонок, встречу или комментарий.');const message=clean(input.text,3000,true),key=clean(input.idempotency||'',36,true);if(!UUID.test(key))throw fail(422,'Обновите форму события.');const checksum=digest(JSON.stringify({type:input.type,text:message}));return atomic(()=>{lead(id);const prior=db.prepare('SELECT digest FROM lead_history WHERE lead_id=? AND idempotency=?').get(id,key);if(prior){if(prior.digest!==checksum)throw fail(409,'Событие изменилось. Начните новую запись.');return {...history(id),duplicate:true};}record(id,input.type,message,username,{idempotency:key,checksum});bump(id);audit(username,'lead_history_added',id);return {...history(id),duplicate:false};});}
 function recordManagerAction({leadId,type,text:message,username,fromStatus='',toStatus=''}){
  // The owning quote/portal mutation already holds the transaction and bumps
  // the lead revision. This hook records facts in that same atomic write.
  lead(leadId);const user=clean(username,60,true),kind=clean(type,40,true),description=clean(message,3000,true);
  if(!/^[a-z][a-z0-9_]{0,39}$/.test(kind))throw fail(422,'Проверьте тип действия менеджера.');
  if((fromStatus&&!Object.hasOwn(STATUSES,fromStatus))||(toStatus&&!Object.hasOwn(STATUSES,toStatus)))throw fail(422,'Проверьте статус действия.');
  if(fromStatus&&toStatus&&fromStatus!==toStatus)record(leadId,'status','Статус изменён.',user,{fromStatus,toStatus});
  record(leadId,kind,description,user);
 }
 function recordStatus(old,input,username){
  // Called within the caller's PATCH transaction; do not open another one.
  if(input.status!==old.status)record(old.id,'status','Статус изменён.',username,{fromStatus:old.status,toStatus:input.status});
  if(input.note!==old.note)record(old.id,'comment','Заметка сотрудника обновлена.\n'+input.note,username);
  if(input.assignee!==old.assignee)record(old.id,'assignment',input.assignee?'Назначен ответственный: '+input.assignee:'Ответственный снят.',username);
  if(input.next_contact!==old.next_contact||input.next_action!==old.next_action)record(old.id,'followup',[input.next_contact?'Следующий контакт: '+input.next_contact:'Дата следующего контакта снята.',input.next_action].filter(Boolean).join('\n'),username);
 }
 function saveCommercial(id,input,username){lead(id);if(!input||!Number.isSafeInteger(input.revision)||input.revision<0)throw fail(422,'Обновите данные договора.');const amount=parseAmount(input.amount),lossReason=clean(input.lossReason||'',500);return atomic(()=>{lead(id);const current=commercial(id);if(input.revision!==current.revision)throw fail(409,'Данные договора изменились. Откройте заявку заново.');const stamp=now().toISOString();if(current.revision===0)db.prepare('INSERT INTO lead_commercial(lead_id,amount_kopecks,loss_reason,revision,updated_at,updated_by) VALUES(?,?,?,1,?,?)').run(id,amount,lossReason,stamp,username);else db.prepare('UPDATE lead_commercial SET amount_kopecks=?,loss_reason=?,revision=revision+1,updated_at=?,updated_by=? WHERE lead_id=?').run(amount,lossReason,stamp,username,id);record(id,'commercial','Данные договора обновлены.',username);bump(id);audit(username,'lead_commercial_updated',id);return commercial(id);});}
 function sales({days=30}={}){
  if(![7,30,90].includes(days))throw fail(422,'Выберите период.');const to=now().toISOString(),from=new Date(Date.parse(to)-days*86400000).toISOString();
  const quoteTable=Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='quote_versions'").get());
  const quoted=quoteTable?new Set(db.prepare('SELECT DISTINCT lead_id FROM quote_versions').all().map(r=>r.lead_id)):new Set();
  const rows=db.prepare('SELECT l.*,c.amount_kopecks,c.loss_reason,a.source,a.medium,a.campaign FROM leads l LEFT JOIN lead_commercial c ON c.lead_id=l.id LEFT JOIN lead_attribution a ON a.lead_id=l.id WHERE l.created>=? AND l.created<=? ORDER BY l.created DESC').all(from,to);
  const totals={leads:0,quoted:0,won:0,closed:0,wonWithAmount:0,wonWithoutAmount:0,wonWithoutQuote:0,contractAmount:'0.00',conversion:0},sourceGroups=new Map(),campaignGroups=new Map(),loss=new Map(),first=[];let amountTotal=0n;
  const firstRows=db.prepare("SELECT lead_id,MIN(created_at) first_action FROM lead_history WHERE type<>'created' GROUP BY lead_id").all(),firstMap=new Map(firstRows.map(r=>[r.lead_id,r.first_action]));
  function group(map,key,labels){let g=map.get(key);if(!g){g={...labels,leads:0,quoted:0,won:0,closed:0,wonWithAmount:0,wonWithoutAmount:0,contractAmount:'0.00',_amount:0n};map.set(key,g);}return g;}
  function add(g,row,hasQuote){g.leads++;if(hasQuote)g.quoted++;if(row.status==='closed')g.closed++;if(row.status==='won'){g.won++;if(row.amount_kopecks!==null&&row.amount_kopecks!==undefined){g.wonWithAmount++;g._amount+=BigInt(row.amount_kopecks);}else g.wonWithoutAmount++;}}
  for(const row of rows){const hasQuote=quoted.has(row.id);totals.leads++;if(hasQuote)totals.quoted++;if(row.status==='won'){totals.won++;if(!hasQuote)totals.wonWithoutQuote++;if(row.amount_kopecks!==null&&row.amount_kopecks!==undefined){totals.wonWithAmount++;amountTotal+=BigInt(row.amount_kopecks);}else totals.wonWithoutAmount++;}if(row.status==='closed'){totals.closed++;const reason=row.loss_reason||'Не указана';loss.set(reason,(loss.get(reason)||0)+1);}const source=row.source||'Не указан',medium=row.medium||'',campaign=row.campaign||'';add(group(sourceGroups,JSON.stringify([source,medium]),{source,medium}),row,hasQuote);add(group(campaignGroups,JSON.stringify([source,medium,campaign]),{source,medium,campaign}),row,hasQuote);const stamp=firstMap.get(row.id);if(stamp){const seconds=(Date.parse(stamp)-Date.parse(row.created))/1000;if(Number.isFinite(seconds)&&seconds>=0)first.push(seconds);}}
  const finalize=map=>[...map.values()].map(g=>{g.contractAmount=formatAmount(g._amount);delete g._amount;return g;}).sort((a,b)=>b.leads-a.leads||a.source.localeCompare(b.source));
  first.sort((a,b)=>a-b);const median=first.length?first.length%2?first[(first.length-1)/2]:(first[first.length/2-1]+first[first.length/2])/2:null;
  totals.contractAmount=formatAmount(amountTotal);totals.conversion=totals.leads?totals.won/totals.leads*100:0;
  return {days,from,to,totals,funnel:[{id:'leads',label:'Обращения',count:totals.leads},{id:'quoted',label:'КП создано',count:totals.quoted},{id:'won',label:'Договоры',count:totals.won}],firstAction:{medianSeconds:median,known:first.length,unknown:totals.leads-first.length},sources:finalize(sourceGroups),campaigns:finalize(campaignGroups),lossReasons:[...loss].map(([reason,count])=>({reason,count})).sort((a,b)=>b.count-a.count)};
 }
 return {create,history,appendHistory,recordStatus,recordManagerAction,commercial,saveCommercial,captureAttribution,sales};
}
