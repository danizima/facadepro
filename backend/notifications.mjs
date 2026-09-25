import {createCipheriv,createDecipheriv,createHash,randomBytes,randomUUID} from 'node:crypto';
import {db,secret,content,fail,text,emailOK} from './store.mjs';
db.exec("CREATE TABLE IF NOT EXISTS notification_settings(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,sealed TEXT NOT NULL)");
const columns=new Set(db.prepare('PRAGMA table_info(outbox)').all().map(r=>r.name));
if(!columns.has('channel'))db.exec("ALTER TABLE outbox ADD COLUMN channel TEXT NOT NULL DEFAULT 'email'");
if(!columns.has('dedupe'))db.exec('ALTER TABLE outbox ADD COLUMN dedupe TEXT');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS outbox_dedupe ON outbox(dedupe)');
const key=createHash('sha256').update(secret+'notifications-v6').digest();
function seal(value){const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce),data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return Buffer.concat([nonce,cipher.getAuthTag(),data]).toString('base64');}
function unseal(value){const b=Buffer.from(value,'base64'),d=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([d.update(b.subarray(28)),d.final()]).toString());}
export function notificationConfig(){
 const row=db.prepare('SELECT * FROM notification_settings WHERE id=1').get();
 if(row)return {...unseal(row.sealed),revision:row.revision};
 return {revision:0,emailEnabled:Boolean(process.env.SMTP_HOST&&process.env.SMTP_FROM),smtpHost:process.env.SMTP_HOST||'',smtpPort:Number(process.env.SMTP_PORT||465),smtpSecurity:process.env.SMTP_SECURITY||'tls',smtpFrom:process.env.SMTP_FROM||'',smtpUser:process.env.SMTP_USER||'',smtpPassword:process.env.SMTP_PASSWORD||'',leadTo:process.env.LEAD_TO||content().settings.email,telegramEnabled:false,telegramToken:process.env.TELEGRAM_BOT_TOKEN||'',telegramChat:process.env.TELEGRAM_CHAT_ID||'',remindersEnabled:false,reminderMinutes:60,timezone:'Asia/Vladivostok'};
}
export function notificationPublic(){
 const c=notificationConfig(),{smtpPassword,telegramToken,...safe}=c;
 return {...safe,timewebPreset:{smtpHost:'smtp.timeweb.ru',smtpPort:465,smtpSecurity:'tls',smtpFrom:'office@facadepro.ru',smtpUser:'office@facadepro.ru',leadTo:'office@facadepro.ru'},hasPassword:Boolean(smtpPassword),hasToken:Boolean(telegramToken),queue:db.prepare('SELECT channel,state,COUNT(*) count FROM outbox GROUP BY channel,state').all()};
}
export function saveNotifications(b){
 const old=notificationConfig();if(b.revision!==old.revision)throw fail(409,'Настройки изменены в другой вкладке. Обновите раздел.');
 const out={};
 for(const k of ['emailEnabled','telegramEnabled','remindersEnabled'])out[k]=b[k]===true;
 for(const k of ['smtpHost','smtpFrom','smtpUser','leadTo','telegramChat','timezone','smtpSecurity'])out[k]=text(b[k]??old[k],250);
 const password=b.smtpPassword||old.smtpPassword;
 if(typeof password!=='string'||password.length>500||/[\r\n\u0000]/.test(password))throw fail(422,'Проверьте пароль SMTP.');
 out.smtpPassword=b.clearPassword?'':password;
 out.telegramToken=b.clearToken?'':text(b.telegramToken||old.telegramToken,180);
 out.smtpPort=Number(b.smtpPort);out.reminderMinutes=Number(b.reminderMinutes);
 if(!Number.isInteger(out.smtpPort)||out.smtpPort<1||out.smtpPort>65535||!Number.isInteger(out.reminderMinutes)||out.reminderMinutes<15||out.reminderMinutes>1440)throw fail(422,'Проверьте порт SMTP и интервал напоминания (15–1440 минут).');
 const testMode=process.env.NODE_ENV!=='production'&&out.smtpSecurity==='local-test'&&['127.0.0.1','localhost'].includes(out.smtpHost);
 if(!['tls','starttls'].includes(out.smtpSecurity)&&!testMode)throw fail(422,'Выберите TLS или STARTTLS.');
 if(out.smtpHost&&!/^[a-zA-Z0-9.-]{1,253}$/.test(out.smtpHost))throw fail(422,'Укажите имя SMTP-сервера без протокола и пути.');
 if(out.emailEnabled&&(!out.smtpHost||!emailOK(out.smtpFrom)||!emailOK(out.leadTo)||(out.smtpUser&&!out.smtpPassword)))throw fail(422,'Заполните SMTP-сервер, адрес отправителя и получателя, логин и пароль почты.');
 if(out.telegramToken&&!/^\d{5,16}:[a-zA-Z0-9_-]{20,120}$/.test(out.telegramToken))throw fail(422,'Проверьте токен Telegram-бота.');
 if(out.telegramChat&&!/^-?\d{1,20}$/.test(out.telegramChat))throw fail(422,'Chat ID должен быть числом.');
 if(out.telegramEnabled&&(!out.telegramToken||!out.telegramChat))throw fail(422,'Для Telegram нужны токен бота и Chat ID.');
 try{new Intl.DateTimeFormat('en',{timeZone:out.timezone}).format();}catch{throw fail(422,'Проверьте часовой пояс.');}
 db.prepare('INSERT INTO notification_settings VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,sealed=excluded.sealed').run(old.revision+1,seal(out));
 if(out.leadTo!==old.leadTo&&out.leadTo)db.prepare("UPDATE outbox SET recipient=? WHERE channel='email' AND kind<>'receipt' AND state IN ('pending','failed')").run(out.leadTo);
 if(out.telegramChat!==old.telegramChat&&out.telegramChat)db.prepare("UPDATE outbox SET recipient=? WHERE channel='telegram' AND state IN ('pending','failed')").run(out.telegramChat);
 return notificationPublic();
}
export function smtpEnvironment(c){return {SMTP_HOST:c.smtpHost,SMTP_PORT:String(c.smtpPort),SMTP_SECURITY:c.smtpSecurity,SMTP_FROM:c.smtpFrom,SMTP_USER:c.smtpUser,SMTP_PASSWORD:c.smtpPassword};}
export async function telegramRequest(method,payload,c=notificationConfig(),fetcher=fetch){
 // Fixed provider origin; neither server replies nor token URLs enter logs.
 try{
  const r=await fetcher('https://api.telegram.org/bot'+c.telegramToken+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(12000)});
  const result=await r.json();if(!r.ok||!result.ok)throw Error('provider rejected');
  return result.result;
 }catch{throw fail(502,'Telegram не принял запрос. Проверьте токен, Chat ID и доступ бота к чату.');}
}
export async function sendTelegram(message,c=notificationConfig(),fetcher=fetch){
 return telegramRequest('sendMessage',{chat_id:c.telegramChat,text:message,link_preview_options:{is_disabled:true}},c,fetcher);
}
export function queueTelegram(leadId){
 const c=notificationConfig();if(!c.telegramEnabled)return;
 db.prepare("INSERT OR IGNORE INTO outbox(id,lead_id,recipient,kind,channel,dedupe) VALUES(?,?,?,'manager','telegram',?)").run(randomUUID(),leadId,c.telegramChat,'telegram-new:'+leadId);
}
export function localClock(now,c){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:c.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now),get=t=>parts.find(p=>p.type===t).value;
 return {day:get('year')+'-'+get('month')+'-'+get('day'),hour:Number(get('hour'))};
}
export function scheduleReminders(now=new Date()){
 const c=notificationConfig();if(!c.remindersEnabled)return;
 const {day,hour}=localClock(now,c);if(hour<9||hour>=19)return;
 const leads=db.prepare("SELECT * FROM leads WHERE status NOT IN ('won','closed') AND ((status='new' AND created<=?) OR (next_contact<>'' AND next_contact<=?))").all(new Date(now.getTime()-c.reminderMinutes*60000).toISOString(),day);
 for(const lead of leads){
  const kind=lead.next_contact&&lead.next_contact<=day?'reminder_due':'reminder_new';
  for(const channel of ['email','telegram']){
   if(channel==='email'?!c.emailEnabled:!c.telegramEnabled)continue;
   const recipient=channel==='email'?c.leadTo:c.telegramChat,dedupe=[kind,lead.id,day,channel].join(':');
   db.prepare("INSERT OR IGNORE INTO outbox(id,lead_id,recipient,kind,channel,dedupe) VALUES(?,?,?,?,?,?)").run(randomUUID(),lead.id,recipient,kind,channel,dedupe);
  }
 }
}
export function reminderStillRelevant(row,lead,now=new Date()){
 if(!row.kind.startsWith('reminder_'))return true;
 const c=notificationConfig(),{day}=localClock(now,c);
 if(!c.remindersEnabled||['won','closed'].includes(lead.status)||row.dedupe?.split(':')[2]!==day)return false;
 if(row.kind==='reminder_due')return Boolean(lead.next_contact&&lead.next_contact<=day);
 return lead.status==='new'&&new Date(lead.created).getTime()<=now.getTime()-c.reminderMinutes*60000;
}
export function telegramMessage(row,lead){
 const title=row.kind==='reminder_new'?'Заявка ещё не обработана':row.kind==='reminder_due'?'Напоминание о контакте':'Новая заявка';
 return title+' '+lead.reference+'\n'+(lead.assignee?'Ответственный: '+lead.assignee+'\n':'')+(process.env.PUBLIC_URL||'')+'/admin/#leads/'+lead.id;
}
