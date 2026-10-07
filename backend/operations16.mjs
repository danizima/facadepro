import {randomUUID,createHash} from 'node:crypto';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const OUTCOMES={no_answer:'Не ответили',discussed:'Обсудили',waiting_materials:'Ждём материалы'};
const defaultFail=(status,message)=>Object.assign(new Error(message),{status});
const dateOK=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const LIMIT=100;

/**
 * Staff-only operational views. recordIncoming must run inside the owning
 * portal transaction, after the source event and files exist. Acknowledgments
 * belong to each employee and do not mutate customer data or lead revisions.
 * call owns one transaction containing the follow-up update and CRM history.
 */
export function createOperations16({db,fail=defaultFail,text,transaction,hash,staff=()=>[],crm,timezone=()=> 'Asia/Vladivostok',now=()=>new Date()}){
 if(!crm||typeof crm.recordManagerAction!=='function')throw new TypeError('Operations requires the synchronous CRM manager action hook.');
 db.exec(`
  CREATE TABLE IF NOT EXISTS lead_incoming16(
   id TEXT PRIMARY KEY,lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
   kind TEXT NOT NULL CHECK(kind IN ('addition','quote_response')),event_id TEXT NOT NULL,
   created_at TEXT NOT NULL,comment TEXT NOT NULL DEFAULT '',project_link TEXT NOT NULL DEFAULT '',
   files_count INTEGER NOT NULL DEFAULT 0,quote_id TEXT REFERENCES quote_versions(id) ON DELETE SET NULL,
   quote_version INTEGER,choice TEXT NOT NULL DEFAULT '',UNIQUE(kind,event_id)
  );
  CREATE INDEX IF NOT EXISTS lead_incoming16_lead ON lead_incoming16(lead_id,created_at);
  CREATE INDEX IF NOT EXISTS lead_incoming16_order ON lead_incoming16(created_at);
  CREATE TABLE IF NOT EXISTS lead_incoming_ack16(
   incoming_id TEXT NOT NULL REFERENCES lead_incoming16(id) ON DELETE CASCADE,
   username TEXT NOT NULL,processed INTEGER NOT NULL DEFAULT 0 CHECK(processed IN (0,1)),
   revision INTEGER NOT NULL DEFAULT 1,processed_at TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL,
   PRIMARY KEY(incoming_id,username)
  );
  CREATE TABLE IF NOT EXISTS lead_calls16(
   id TEXT PRIMARY KEY,lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
   outcome TEXT NOT NULL,comment TEXT NOT NULL DEFAULT '',next_contact TEXT NOT NULL DEFAULT '',next_action TEXT NOT NULL DEFAULT '',
   history_text TEXT NOT NULL,created_at TEXT NOT NULL,created_by TEXT NOT NULL,idempotency TEXT NOT NULL,digest TEXT NOT NULL,
   UNIQUE(lead_id,idempotency)
  );
 `);
 const clean=(value,max,required=false)=>{if(text)return text(value,max,required);if(typeof value!=='string'||value.length>max||(required&&!value.trim())||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))throw fail(422,'Проверьте поля.');return value.trim();};
 const atomic=transaction||((fn)=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}});
 const digest=value=>hash?hash(value):createHash('sha256').update(value).digest('hex');
 const stamp=()=>new Date(now()).toISOString();
 const user=value=>{const name=clean(value,60,true);if(!staff().includes(name))throw fail(403,'Сотрудник не найден.');return name;};
 const validID=(value,message='Заявка не найдена.')=>{if(typeof value!=='string'||!UUID.test(value))throw fail(404,message);return value;};
 const lead=id=>{validID(id);const row=db.prepare('SELECT * FROM leads WHERE id=?').get(id);if(!row)throw fail(404,'Заявка не найдена.');return row;};
 const state=row=>({leadRevision:row.revision,leadStatus:row.status,next_contact:row.next_contact,next_action:row.next_action});
 const summary=row=>{let payload={};try{payload=JSON.parse(row.payload);}catch{}const fields=Object.fromEntries(['name','company','phone','email','city','object'].map(key=>[key,typeof payload?.[key]==='string'?payload[key]:'']));return {id:row.id,reference:row.reference,created:row.created,kind:row.kind,status:row.status,revision:row.revision,assignee:row.assignee,next_contact:row.next_contact,next_action:row.next_action,payload:fields,...fields};};
 const projection=row=>({id:row.id,leadId:row.lead_id,reference:row.reference,assignee:row.assignee,kind:row.kind,eventId:row.event_id,createdAt:row.created_at,comment:row.comment,projectLink:row.project_link,filesCount:row.files_count,...(row.quote_version!==null?{quoteVersion:row.quote_version}:{}),...(row.choice?{choice:row.choice}:{}),processed:row.processed===1,processedAt:row.processed===1?row.processed_at:'',processedBy:row.processed===1?row.username:'',revision:row.ack_revision||0});
 const incomingSelect=`SELECT i.*,l.reference,l.assignee,COALESCE(a.processed,0) processed,a.processed_at,a.username,a.revision ack_revision
  FROM lead_incoming16 i JOIN leads l ON l.id=i.lead_id LEFT JOIN lead_incoming_ack16 a ON a.incoming_id=i.id AND a.username=?`;
 const incomingEntry=(id,username)=>{const row=db.prepare(incomingSelect+' WHERE i.id=?').get(username,id);if(!row)throw fail(404,'Входящее событие не найдено.');return projection(row);};
 const unreadCount=(username,mine=false,leadId='')=>db.prepare(`SELECT COUNT(*) n FROM lead_incoming16 i JOIN leads l ON l.id=i.lead_id
  LEFT JOIN lead_incoming_ack16 a ON a.incoming_id=i.id AND a.username=? WHERE COALESCE(a.processed,0)=0${mine?' AND l.assignee=?':''}${leadId?' AND i.lead_id=?':''}`).get(username,...(mine?[username]:[]),...(leadId?[leadId]:[])).n;
 function unreadCounts(username){username=user(username);return Object.fromEntries(db.prepare(`SELECT i.lead_id,COUNT(*) n FROM lead_incoming16 i JOIN leads l ON l.id=i.lead_id
  LEFT JOIN lead_incoming_ack16 a ON a.incoming_id=i.id AND a.username=? WHERE COALESCE(a.processed,0)=0 GROUP BY i.lead_id`).all(username).map(row=>[row.lead_id,row.n]));}

 function recordIncoming({leadId,kind,eventId,quoteId}={}){
  lead(leadId);validID(eventId,'Входящее событие не найдено.');
  if(!['addition','quote_response'].includes(kind))throw fail(422,'Проверьте вид входящего события.');
  const prior=db.prepare('SELECT id,lead_id,quote_id FROM lead_incoming16 WHERE kind=? AND event_id=?').get(kind,eventId);
  if(prior){if(prior.lead_id!==leadId||(quoteId!==undefined&&prior.quote_id!==quoteId))throw fail(409,'Входящее событие относится к другой заявке.');return {id:prior.id,duplicate:true};}
  let event,filesCount=0,version=null,selectedQuote=null,choice='';
  if(kind==='addition'){
   event=db.prepare('SELECT lead_id,created_at,comment,project_link FROM lead_additions WHERE id=?').get(eventId);
   if(!event||event.lead_id!==leadId)throw fail(404,'Дополнение клиента не найдено.');
   filesCount=db.prepare('SELECT COUNT(*) n FROM lead_addition_files WHERE addition_id=?').get(eventId).n;
   if(quoteId!==undefined)throw fail(422,'Дополнение не относится к версии КП.');
  }else{
   event=db.prepare('SELECT lead_id,created_at,comment,quote_id,choice FROM lead_quote_responses16 WHERE id=?').get(eventId);
   if(!event||event.lead_id!==leadId)throw fail(404,'Ответ клиента не найден.');
   if(quoteId!==undefined&&quoteId!==event.quote_id)throw fail(409,'Ответ клиента относится к другой версии КП.');
   const quote=db.prepare('SELECT lead_id,version FROM quote_versions WHERE id=?').get(event.quote_id);
   if(!quote||quote.lead_id!==leadId)throw fail(404,'Версия КП не найдена.');
   selectedQuote=event.quote_id;version=quote.version;choice=event.choice;
  }
  const id=randomUUID();db.prepare('INSERT INTO lead_incoming16(id,lead_id,kind,event_id,created_at,comment,project_link,files_count,quote_id,quote_version,choice) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,leadId,kind,eventId,event.created_at,event.comment,event.project_link||'',filesCount,selectedQuote,version,choice);
  return {id,duplicate:false};
 }

 function inbox({username,mine=false,leadId='',limit=LIMIT,offset=0}={}){
  username=user(username);if(typeof mine!=='boolean'||!Number.isSafeInteger(limit)||limit<1||limit>LIMIT||!Number.isSafeInteger(offset)||offset<0||offset>100000)throw fail(422,'Проверьте фильтр входящих.');
  if(leadId)lead(leadId);
  const conditions=[...(mine?['l.assignee=?']:[]),...(leadId?['i.lead_id=?']:[])],where=conditions.length?' WHERE '+conditions.join(' AND '):'',filters=[...(mine?[username]:[]),...(leadId?[leadId]:[])],args=[username,...filters];
  const entries=db.prepare(incomingSelect+where+' ORDER BY CASE WHEN COALESCE(a.processed,0)=0 THEN 0 ELSE 1 END,i.created_at DESC,i.rowid DESC LIMIT ? OFFSET ?').all(...args,limit,offset).map(projection);
  const total=db.prepare('SELECT COUNT(*) n FROM lead_incoming16 i JOIN leads l ON l.id=i.lead_id'+where).get(...filters).n;
  return {entries,unread:unreadCount(username,mine,leadId),total,limit,offset,hasMore:offset+entries.length<total};
 }

 function markIncoming(id,input,username){
  username=user(username);validID(id,'Входящее событие не найдено.');
  if(!input||typeof input.processed!=='boolean'||!Number.isSafeInteger(input.revision)||input.revision<0)throw fail(422,'Обновите входящие перед отметкой.');
  return atomic(()=>{
   const current=incomingEntry(id,username);if(input.revision!==current.revision)throw fail(409,'Отметка изменена в другой вкладке. Обновите входящие.');
   if(current.processed!==input.processed){const time=stamp();db.prepare(`INSERT INTO lead_incoming_ack16(incoming_id,username,processed,revision,processed_at,updated_at) VALUES(?,?,?,1,?,?)
    ON CONFLICT(incoming_id,username) DO UPDATE SET processed=excluded.processed,revision=lead_incoming_ack16.revision+1,processed_at=excluded.processed_at,updated_at=excluded.updated_at`).run(id,username,Number(input.processed),input.processed?time:'',time);}
   return {entry:incomingEntry(id,username),unread:unreadCount(username)};
  });
 }

 function calendar(){
  const zone=timezone(),parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now())),get=key=>parts.find(part=>part.type===key).value;
  return {today:[get('year'),get('month'),get('day')].join('-'),timezone:zone};
 }

 function day(username){
  username=user(username);const {today,timezone:zone}=calendar();
  const groups={},counts={};
  for(const [key,condition,args] of [['overdue',"status NOT IN ('won','closed') AND next_contact<>'' AND next_contact<?",[today]],['today',"status NOT IN ('won','closed') AND next_contact=?",[today]],['new',"status='new'",[]]]){
   const where='assignee=? AND '+condition;counts[key]=db.prepare('SELECT COUNT(*) n FROM leads WHERE '+where).get(username,...args).n;
   groups[key]=db.prepare('SELECT * FROM leads WHERE '+where+' ORDER BY '+(key==='new'?'created DESC,rowid DESC':'next_contact ASC,created DESC,rowid DESC')+' LIMIT ?').all(username,...args,LIMIT).map(summary);
  }
  groups.incoming=db.prepare(incomingSelect+" WHERE l.assignee=? AND COALESCE(a.processed,0)=0 ORDER BY i.created_at DESC,i.rowid DESC LIMIT ?").all(username,username,LIMIT).map(projection);
  counts.incoming=unreadCount(username,true);
  return {today,timezone:zone,counts,groups,limits:{leads:LIMIT,incoming:LIMIT},truncated:Object.fromEntries(Object.keys(counts).map(key=>[key,counts[key]>groups[key].length]))};
 }

 const callEntry=row=>({id:row.id,type:'call',outcome:row.outcome,comment:row.comment,text:row.history_text,createdAt:row.created_at,createdBy:row.created_by,next_contact:row.next_contact,next_action:row.next_action});
 function call(leadId,input,username){
  username=user(username);lead(leadId);
  if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.outcome!=='string'||!Object.hasOwn(OUTCOMES,input.outcome))throw fail(422,'Выберите результат звонка.');
  const key=clean(input.idempotency||'',36,true);if(!UUID.test(key))throw fail(422,'Обновите форму звонка.');
  if(!Number.isSafeInteger(input.revision)||input.revision<1)throw fail(422,'Обновите карточку заявки.');
  const comment=clean(input.comment??'',3000),nextContact=clean(input.next_contact??'',10),nextAction=clean(input.next_action??'',500);
  if(nextContact&&!dateOK(nextContact))throw fail(422,'Укажите корректную дату следующего контакта.');
  if(nextContact&&!nextAction)throw fail(422,'Укажите следующее действие.');
  const checksum=digest(JSON.stringify({username,outcome:input.outcome,comment,nextContact,nextAction}));
  return atomic(()=>{
   const current=lead(leadId),prior=db.prepare('SELECT * FROM lead_calls16 WHERE lead_id=? AND idempotency=?').get(leadId,key);
   if(prior){if(prior.digest!==checksum)throw fail(409,'Результат звонка изменился. Начните новую запись.');return {entry:callEntry(prior),...state(current),duplicate:true};}
   if(input.revision!==current.revision)throw fail(409,'Заявка изменена в другой вкладке. Откройте её заново.');
   const id=randomUUID(),createdAt=stamp(),message=['Результат звонка: '+OUTCOMES[input.outcome]+'.',comment,nextContact?'Следующий контакт: '+nextContact+'.':'Дата следующего контакта не назначена.',nextAction].filter(Boolean).join('\n');
   db.prepare('UPDATE leads SET next_contact=?,next_action=?,revision=revision+1 WHERE id=?').run(nextContact,nextAction,leadId);
   const hook=crm.recordManagerAction({leadId,type:'call',text:message,username,fromStatus:current.status,toStatus:current.status});if(hook&&typeof hook.then==='function')throw new TypeError('Operations manager action must record history synchronously.');
   db.prepare('INSERT INTO lead_calls16(id,lead_id,outcome,comment,next_contact,next_action,history_text,created_at,created_by,idempotency,digest) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,leadId,input.outcome,comment,nextContact,nextAction,message,createdAt,username,key,checksum);
   return {entry:callEntry(db.prepare('SELECT * FROM lead_calls16 WHERE id=?').get(id)),...state(lead(leadId)),duplicate:false};
  });
 }
 return {calendar,day,inbox,recordIncoming,markIncoming,unreadCounts,call};
}
