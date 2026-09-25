import {allContentImages} from './backend/content6.mjs';
import {publicMaterials} from './backend/content7.mjs';
import {saveShowcase,listShowcases,getShowcase,showcaseHTML,closedShowcaseHTML} from './backend/showcases.mjs';
import {notificationConfig,notificationPublic,saveNotifications,smtpEnvironment,sendTelegram,telegramRequest,queueTelegram,scheduleReminders,reminderStillRelevant,telegramMessage,localClock} from './backend/notifications.mjs';
import http from 'node:http';
import {readFile,writeFile,stat,mkdir,rm,readdir,rename} from 'node:fs/promises';
import {existsSync,createReadStream} from 'node:fs';
import {spawn} from 'node:child_process';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import path from 'node:path';
import {ROOT,DATA,db,content,hash,passwordValid,passwordHash,rate,audit,transaction,cleanSession,fail,text,emailOK,validateContent,SERVICE_IDS,STATUSES} from './backend/store.mjs';
import {createPortfolio} from './backend/portfolio.mjs';
import {selectKit,createKit,kitDocuments} from './backend/kit.mjs';
import {servePublicFile} from './backend/public-files.mjs';
import {listLeads,updateFollowup,reminders,todayParam,staff} from './backend/followups.mjs';
const solutionCatalog=JSON.parse(await readFile(path.join(ROOT,'source/solutions.json'),'utf8'));
const site=path.join(ROOT,'site');
const VERSION=JSON.parse(await readFile(path.join(ROOT,'package.json'),'utf8')).version;
await mkdir(path.join(DATA,'materials'),{recursive:true,mode:0o700});
const production=process.env.NODE_ENV==='production';
const PUBLIC_URL=process.env.PUBLIC_URL||'';
if(production&&!/^https:\/\/[^/]+\/?$/.test(PUBLIC_URL))throw Error('Set PUBLIC_URL to the HTTPS origin before production startup.');
const secureCookie=production||process.env.COOKIE_SECURE==='true';
const TRUST_PROXY=process.env.TRUST_PROXY==='1';
const argPort=process.argv.indexOf('--port');const port=Number(argPort>=0?process.argv[argPort+1]:process.env.PORT||4173);
const BODY_LIMIT=27*1024*1024,FILE_LIMIT=10*1024*1024,TOTAL_LIMIT=25*1024*1024;
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.pdf':'application/pdf','.xml':'application/xml; charset=utf-8','.txt':'text/plain; charset=utf-8'};
let activePublic=site,publishQueue=Promise.resolve(),mailWorking=false;
const serviceNames={glazing:'Фасадное остекление',windows:'Оконные системы',repair:'Ремонт и восстановление',engineering:'Инженерная подготовка',supply:'Производство и снабжение',height:'Работы на высоте'};
function runPython(script,input,env={},timeout=30000){return new Promise((resolve,reject)=>{const p=spawn(process.env.PYTHON||'python3',[script],{cwd:ROOT,env:{...process.env,...env},stdio:['pipe','pipe','pipe']});let out='',err='';const timer=setTimeout(()=>{p.kill();reject(Error('Python timeout'));},timeout);p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',e=>{clearTimeout(timer);reject(e)});p.on('close',code=>{clearTimeout(timer);code===0?resolve(out):reject(Error(script.endsWith('mail.py')?'SMTP delivery failed: '+(out.match(/"error": \"([A-Za-z]+)\"/)?.[1]||'UnknownError'):err.slice(0,400)));});p.stdin.end(input||'');});}
async function render(next){const id=randomUUID(),dir=path.join(DATA,'render-'+id);await mkdir(dir);await writeFile(path.join(dir,'content.json'),JSON.stringify(next));try{await runPython(path.join(ROOT,'build.py'),'',{FACADE_CONTENT:path.join(dir,'content.json'),FACADE_OUTPUT:path.join(dir,'public')});return dir;}catch(e){await rm(dir,{recursive:true,force:true});throw e;}}
const initialRender=await render(content());activePublic=path.join(initialRender,'public');
for(const entry of await readdir(DATA)){if(entry.startsWith('render-')&&entry!==path.basename(initialRender))await rm(path.join(DATA,entry),{recursive:true,force:true});}
function headers(res){res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('X-Frame-Options','SAMEORIGIN');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data: blob: https://tile.openstreetmap.org; media-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'");if(production)res.setHeader('Strict-Transport-Security','max-age=31536000');}
function json(res,status,data,extra={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra});res.end(JSON.stringify(data));}
function ip(req){return TRUST_PROXY?String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',').at(-1).trim():req.socket.remoteAddress;}
function origin(req){return PUBLIC_URL?new URL(PUBLIC_URL).origin:'http://'+req.headers.host;}
function sameOrigin(req){const incoming=req.headers.origin;if(!incoming||incoming!==origin(req)||req.headers['sec-fetch-site']==='cross-site')throw fail(403,'Запрос с другого сайта отклонён.');}
async function body(req,max=BODY_LIMIT){const length=Number(req.headers['content-length']||0);if(length>max)throw fail(413,'Слишком большой запрос.');let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>max)throw fail(413,'Превышен допустимый размер.');chunks.push(chunk);}return Buffer.concat(chunks);}
async function jsonBody(req,max=4*1024*1024){if(!String(req.headers['content-type']).includes('application/json'))throw fail(415,'Нужен JSON.');try{return JSON.parse((await body(req,max)).toString());}catch(e){if(e.status)throw e;throw fail(400,'Некорректный запрос.');}}
async function multipart(req,max=BODY_LIMIT){if(!String(req.headers['content-type']).startsWith('multipart/form-data;'))throw fail(415,'Нужна форма с файлами.');const bytes=await body(req,max);try{return await new Request('http://localhost/',{method:'POST',headers:{'Content-Type':req.headers['content-type']},body:bytes}).formData();}catch{throw fail(400,'Не удалось прочитать файлы.');}}
function session(req,write=false){const token=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('fp_session='))?.slice(11);if(!token)throw fail(401,'Войдите в панель управления.');const row=db.prepare('SELECT * FROM sessions WHERE hash=? AND expires>?').get(hash(token),Date.now());if(!row)throw fail(401,'Сессия завершена. Войдите снова.');if(write&&req.headers['x-csrf-token']!==row.csrf)throw fail(403,'Обновите страницу и повторите действие.');return row;}
const disposition=name=>'attachment; filename="document"; filename*=UTF-8\'\''+encodeURIComponent(name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16));
const serveFile=(req,res,file,extra={})=>servePublicFile(req,res,file,types,extra);
function signature(buf,ext){const b=buf.subarray(0,256);if(ext==='pdf')return b.subarray(0,5).toString()==='%PDF-';if(['jpg','jpeg'].includes(ext))return b[0]===255&&b[1]===216&&b[2]===255;if(ext==='png')return b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));if(ext==='webp')return b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP';if(['zip','docx','xlsx'].includes(ext))return b[0]===80&&b[1]===75&&[3,5,7].includes(b[2]);if(ext==='dwg')return /^AC10\d{2}/.test(b.toString());if(ext==='dxf')return /SECTION|AutoCAD Binary DXF/.test(b.toString());if(ext==='txt')return !buf.includes(0);return false;}
async function getFiles(form,imagesOnly=false,maxCount=imagesOnly?1:5){const entries=form.getAll('files').filter(f=>typeof f!=='string'&&f.size);if(entries.length>maxCount)throw fail(422,'Допустимо не более '+maxCount+' файлов.');let total=0;const files=[];for(const f of entries){total+=f.size;if(f.size>FILE_LIMIT||total>TOTAL_LIMIT)throw fail(413,'Не более 10 МБ на файл и 25 МБ суммарно.');const name=path.basename(f.name.replaceAll('\\','/')).replace(/[\r\n\u0000-\u001f]/g,'').slice(0,180),ext=name.split('.').at(-1).toLowerCase(),bytes=Buffer.from(await f.arrayBuffer());if((imagesOnly&&!['jpg','jpeg','png','webp'].includes(ext))||!signature(bytes,ext))throw fail(422,'Неподдерживаемый или повреждённый файл: '+name);files.push({id:randomUUID(),name,size:f.size,ext,bytes});}return files;}
function leadPayload(f){const get=(name,max,required=false)=>text(f.get(name)||'',max,required);const services=[...new Set(f.getAll('service'))];if(!services.length||services.some(s=>!SERVICE_IDS.includes(s)))throw fail(422,'Выберите направление работ.');const p={services,kind:get('kind',20)||'request',object:get('object',100,true),city:get('city',120,true),area:get('area',30),timing:get('timing',100,true),documents:get('documents',150),comment:get('comment',3000),name:get('name',100,true),company:get('company',150),phone:get('phone',40),email:get('email',200),height:get('height',80),system:get('system',150),deadline:get('deadline',30),solution:get('solution',20),audience:get('audience',20),selection:get('selection',48)};
 if(p.audience&&!['contractor','developer','owner'].includes(p.audience))throw fail(422,'Проверьте выбранный сценарий.');if(p.selection){const shared=getShowcase(p.selection);p.selectionTitle=shared.title;} 
 if(p.solution&&!solutionCatalog.some(s=>s.id===p.solution))throw fail(422,'Неизвестная задача.');if(!['request','quote'].includes(p.kind))throw fail(422,'Неизвестный тип заявки.');if(!p.email&&!p.phone)throw fail(422,'Укажите телефон или email.');if(p.email&&!emailOK(p.email))throw fail(422,'Проверьте email.');if(p.phone&&(!/^[+\d\s().-]+$/.test(p.phone)||p.phone.replace(/\D/g,'').length<7||p.phone.replace(/\D/g,'').length>15))throw fail(422,'Проверьте телефон.');if(p.area&&(!Number.isFinite(Number(p.area))||Number(p.area)<1||Number(p.area)>1e7))throw fail(422,'Проверьте площадь.');if(f.get('consent')!=='yes')throw fail(422,'Подтвердите согласие на обработку данных заявки.');if(p.kind==='quote'&&!p.company)throw fail(422,'Для запроса КП укажите компанию или «Частный заказчик».');p.consentAt=new Date().toISOString();p.policyVersion='2026-09-23';p.comparedProjects=comparedProjects(f.get('comparedProjects'));p.sourcePage=cleanPage(get('sourcePage',150)||'/request.html');return p;}
function comparedProjects(value){
 const ids=typeof value==='string'&&value?value.split(','):[];
 if(ids.length>3||new Set(ids).size!==ids.length)throw fail(422,'Выберите до трёх разных проектов.');
 const c=content(),rows=ids.map(id=>c.projects.find(p=>p.id===id&&p.published!==false));
 if(rows.some(p=>!p))throw fail(422,'Обновите сравнение: один из проектов больше не опубликован.');
 return rows.map(p=>({id:p.id,title:p.title}));
}
function callbackPayload(f){
 const name=text(f.get('name')||'',100,true),phone=text(f.get('phone')||'',40,true),preferredTime=text(f.get('preferredTime')||'',160);
 if(!/^[+\d\s().-]+$/.test(phone)||phone.replace(/\D/g,'').length<7||phone.replace(/\D/g,'').length>15)throw fail(422,'Проверьте номер телефона.');
 if(f.get('consent')!=='yes')throw fail(422,'Подтвердите согласие на обработку данных.');
 return {kind:'callback',services:[],object:'Обратный звонок',city:'Не указан',timing:preferredTime||'Уточнить',preferredTime,name,phone,email:'',company:'',comment:'Запрос обратного звонка',comparedProjects:comparedProjects(f.get('comparedProjects')),consentAt:new Date().toISOString(),policyVersion:'2026-09-23',sourcePage:cleanPage(text(f.get('sourcePage')||'/',150))};
}
function photoPayload(f){
 const phone=text(f.get('phone')||'',40,true),email=text(f.get('email')||'',200);
 if(!/^[+\d\s().-]+$/.test(phone)||phone.replace(/\D/g,'').length<7||phone.replace(/\D/g,'').length>15)throw fail(422,'Проверьте номер телефона.');
 if(email&&!emailOK(email))throw fail(422,'Проверьте email.');
 if(f.get('consent')!=='yes')throw fail(422,'Подтвердите согласие на обработку данных.');
 return {kind:'photo',services:[],object:'Обращение с фотографиями',city:text(f.get('city')||'',120)||'Не указан',timing:'Уточнить',name:text(f.get('name')||'',100)||'Не указано',phone,email,company:'',comment:text(f.get('comment')||'',1500),comparedProjects:[],consentAt:new Date().toISOString(),policyVersion:'2026-09-23',sourcePage:cleanPage(text(f.get('sourcePage')||'/photo-request.html',150))};
}
async function materialFile(req,res,key){
 if(!/^materials\/[a-f0-9-]{36}\.(pdf|mp4|webm)$/.test(key))throw fail(404,'Файл не найден.');
 let allowed=publicMaterials(content()).some(r=>r.file===key);if(!allowed){try{session(req);allowed=true;}catch{}}
 if(!allowed)throw fail(404,'Файл не найден.');
 const file=path.join(DATA,key);let info;try{info=await stat(file);}catch{throw fail(404,'Файл не найден.');}
 const mime=key.endsWith('.pdf')?'application/pdf':key.endsWith('.webm')?'video/webm':'video/mp4';
 const extra={'Content-Type':mime,'Accept-Ranges':'bytes','Cache-Control':'private, no-store','Content-Disposition':(mime==='application/pdf'?'inline':'inline')};
 let start=0,end=info.size-1,code=200;
 if(req.headers.range){const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);if(!m||(!m[1]&&!m[2])){res.writeHead(416,{'Content-Range':'bytes */'+info.size});res.end();return;}
  if(!m[1])start=Math.max(0,info.size-Number(m[2]));else{start=Number(m[1]);if(m[2])end=Math.min(end,Number(m[2]));}
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=info.size){res.writeHead(416,{'Content-Range':'bytes */'+info.size});res.end();return;}
  code=206;extra['Content-Range']='bytes '+start+'-'+end+'/'+info.size;
 }
 extra['Content-Length']=end-start+1;res.writeHead(code,extra);if(req.method==='HEAD'){res.end();return;}
 const stream=createReadStream(file,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
}
function cleanPage(s){const p=String(s).split('?')[0].split('#')[0];return /^\/(?:[a-z0-9-]+\/)?[a-z0-9-]*\.?[a-z]*$/.test(p)&&p.length<=150&&!p.startsWith('/admin')?p:'/';}
function mailMessage(row){const lead=db.prepare('SELECT * FROM leads WHERE id=?').get(row.lead_id),p=JSON.parse(lead.payload),settings=content().settings,base=PUBLIC_URL||'';
 if(row.kind.startsWith('reminder_'))return {to:row.recipient,subject:'ФАСАД.PRO: напоминание '+lead.reference,body:telegramMessage(row,lead)+'\n\nСледующее действие: '+(lead.next_action||'Взять заявку в работу'),message_id:'<'+row.id+'@facadepro.ru>'};
 if(row.kind==='receipt')return {to:row.recipient,subject:'ФАСАД.PRO: заявка '+lead.reference+' принята',body:`Здравствуйте, ${p.name}!\n\nМы получили вашу заявку ${lead.reference}. Менеджер свяжется с вами для уточнения деталей.\n\n${settings.manager}\n${settings.phone}\n${settings.email}\n\nЭто подтверждение получения заявки, а не согласование цены или срока.`,message_id:`<${row.id}@facadepro.ru>`};
 const files=db.prepare('SELECT name,size FROM files WHERE lead_id=?').all(lead.id);return {to:row.recipient,reply_to:p.email||undefined,subject:`${p.kind==='quote'?'Запрос КП':p.kind==='callback'?'Обратный звонок':p.kind==='photo'?'Фотографии объекта':'Новая заявка'} ${lead.reference} — ФАСАД.PRO`,body:[`Заявка: ${lead.reference}`,`Работы: ${p.services.map(s=>serviceNames[s]).join(', ')||'Уточнить при звонке'}`,`Объект: ${p.object}`,`Город: ${p.city}`,`Площадь: ${p.area||'Уточнить'}`,`Начало: ${p.timing}`,`Имя: ${p.name}`,`Компания: ${p.company||'—'}`,`Телефон: ${p.phone||'—'}`,`Email: ${p.email||'—'}`,`Комментарий: ${p.comment||'—'}`,`Файлы: ${files.map(f=>f.name).join(', ')||'Нет'}`,'',`Открыть в панели: ${base}/admin/#leads/${lead.id}`].join('\n'),message_id:`<${row.id}@facadepro.ru>`};}
async function flushMail(){
 if(mailWorking)return;mailWorking=true;
 try{
  scheduleReminders();
  const cfg=notificationConfig();
  const channels=[...(cfg.emailEnabled?['email']:[]),...(cfg.telegramEnabled?['telegram']:[])];
  if(!channels.length)return;
  const rows=db.prepare("SELECT * FROM outbox WHERE state='pending' AND next_try<=? AND channel IN ("+channels.map(()=>'?').join(',')+") ORDER BY kind LIKE 'reminder_%',rowid LIMIT 10").all(Date.now(),...channels);
  for(const row of rows){
   const lead=db.prepare('SELECT * FROM leads WHERE id=?').get(row.lead_id);if(!lead)continue;
   if(!reminderStillRelevant(row,lead)){db.prepare("UPDATE outbox SET state='cancelled' WHERE id=?").run(row.id);continue;}
   if(row.kind.startsWith('reminder_')){const {hour}=localClock(new Date(),cfg);if(hour<9||hour>=19)continue;}
   try{
    if(row.channel==='telegram')await sendTelegram(telegramMessage(row,lead),{...cfg,telegramChat:row.recipient});
    else await runPython(path.join(ROOT,'backend/mail.py'),JSON.stringify(mailMessage(row)),smtpEnvironment(cfg),45000);
    db.prepare("UPDATE outbox SET state='sent',sent_at=?,last_error='' WHERE id=?").run(new Date().toISOString(),row.id);
   }catch{
    const n=row.attempts+1;
    db.prepare('UPDATE outbox SET attempts=?,state=?,next_try=?,last_error=? WHERE id=?').run(n,n>=5?'failed':'pending',Date.now()+Math.min(3600000,30000*2**n),row.channel==='telegram'?'Проверьте настройки Telegram и доступ бота к чату.':'Проверьте настройки SMTP и адрес получателя.',row.id);
   }
  }
 }finally{mailWorking=false;}
}
async function cleanup(){cleanSession();db.prepare('DELETE FROM events WHERE created<?').run(new Date(Date.now()-90*86400000).toISOString());const stale=db.prepare('SELECT id FROM leads WHERE created<?').all(new Date(Date.now()-180*86400000).toISOString());for(const row of stale){const files=db.prepare('SELECT id FROM files WHERE lead_id=?').all(row.id);transaction(()=>db.prepare('DELETE FROM leads WHERE id=?').run(row.id));for(const f of files)await rm(path.join(DATA,'uploads',f.id),{force:true});}db.prepare('DELETE FROM audit WHERE created<?').run(new Date(Date.now()-365*86400000).toISOString());}
function stats(days){const since=new Date(Date.now()-days*86400000).toISOString(),get=(sql,...args)=>db.prepare(sql).all(...args);const sessions=db.prepare("SELECT COUNT(DISTINCT session_id) n FROM events WHERE event='page_view' AND created>=?").get(since).n;const stages=['page_view','request_start','step_2','step_3'];const funnel=stages.map(event=>({event,count:db.prepare('SELECT COUNT(DISTINCT session_id) n FROM events WHERE event=? AND created>=?').get(event,since).n}));funnel.push({event:'submitted',count:db.prepare('SELECT COUNT(DISTINCT session_id) n FROM leads WHERE created>=? AND session_id IS NOT NULL').get(since).n});return {days,sessions,leadPages:get("SELECT json_extract(payload,'$.sourcePage') page,COUNT(*) count FROM leads WHERE created>=? GROUP BY page ORDER BY count DESC",since),totalLeads:db.prepare('SELECT COUNT(*) n FROM leads WHERE created>=?').get(since).n,funnel,pages:get("SELECT page,COUNT(*) views,COUNT(DISTINCT session_id) visitors FROM events WHERE event='page_view' AND created>=? GROUP BY page ORDER BY views DESC LIMIT 15",since),services:get("SELECT detail service,COUNT(DISTINCT session_id) visitors FROM events WHERE event='service_interest' AND created>=? GROUP BY detail ORDER BY visitors DESC",since),sources:get("SELECT source,COUNT(DISTINCT session_id) visitors FROM events WHERE event='page_view' AND created>=? GROUP BY source ORDER BY visitors DESC LIMIT 10",since),leadsByDay:get('SELECT substr(created,1,10) day,COUNT(*) count FROM leads WHERE created>=? GROUP BY day ORDER BY day',since)};}
const server=http.createServer(async(req,res)=>{headers(res);let url;try{url=new URL(req.url,origin(req));const route=decodeURIComponent(url.pathname);if(['POST','PUT','DELETE','PATCH'].includes(req.method))sameOrigin(req);if(req.method==='OPTIONS')throw fail(405,'Метод не поддерживается.');
 if(route==='/healthz'){json(res,200,{ok:true,version:VERSION});return;}
 if(route.startsWith('/materials/')&&['GET','HEAD'].includes(req.method)){await materialFile(req,res,route.slice(1));return;}
 if(route==='/api/public/projects'&&req.method==='GET'){json(res,200,{projects:content().projects.filter(p=>p.published!==false).map(p=>({id:p.id,title:p.title,type:p.type,location:p.location,period:p.period,volume:p.volume,work:p.work,serviceIds:p.serviceIds,case:p.case,image:p.images[0]}))});return;}
 if(route==='/api/public/config'&&req.method==='GET'){const s=content().settings;json(res,200,{forms:true,photoRequests:true,portfolio:true,contact:{email:s.email,phone:s.phone,manager:s.manager},uploads:{count:5,fileBytes:FILE_LIMIT,totalBytes:TOTAL_LIMIT},policyVersion:'2026-09-23'});return;}
 const selectionMatch=route.match(/^\/selection\/([a-f0-9]{48})(\/pdf)?$/);
 if(selectionMatch){
  res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('Referrer-Policy','no-referrer');
  let selection;try{selection=getShowcase(selectionMatch[1]);}catch(e){if(e.status===410&&!selectionMatch[2]&&['GET','HEAD'].includes(req.method)){res.writeHead(410,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:closedShowcaseHTML());return;}throw e;}
  if(!selectionMatch[2]&&['GET','HEAD'].includes(req.method)){const html=showcaseHTML(selection);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:html);return;}
  if(selectionMatch[2]&&req.method==='POST'){
   if(!rate('portfolio:'+ip(req),12,600000))throw fail(429,'Подождите несколько минут перед новой загрузкой.');
   const pdf=await createPortfolio({projects:selection.projects,settings:{...selection.settings,manager:selection.manager,phone:selection.phone,email:selection.email},recipient:selection.recipient});
   res.writeHead(200,{'Content-Type':'application/pdf','Content-Length':pdf.length,'Content-Disposition':disposition('ФАСАД_PRO_подборка.pdf'),'Cache-Control':'no-store'});res.end(pdf);return;
  }throw fail(405,'Метод не поддерживается.');
 }
 const selectionAPI=route.match(/^\/api\/selection\/([a-f0-9]{48})$/);
 if(selectionAPI&&req.method==='GET'){const selection=getShowcase(selectionAPI[1]);res.setHeader('Referrer-Policy','no-referrer');json(res,200,{title:selection.title,projects:selection.projects.map(p=>p.id)});return;}
 if(route==='/api/public/contractor-kit'&&req.method==='GET'){
  const c=content();json(res,200,{projects:c.projects.filter(p=>p.published!==false).map(p=>({id:p.id,title:p.title,location:p.location})),documents:kitDocuments(c).map(d=>({id:d.id,title:d.title}))});return;
 }
 if(route==='/api/contractor-kit'&&req.method==='POST'){
  if(!rate('portfolio:'+ip(req),12,600000))throw fail(429,'Слишком много подборок. Попробуйте через несколько минут.');
  const input=await jsonBody(req,5000),job=await selectKit(input,content()),zip=await createKit({...job,version:VERSION});
  const latest=await selectKit(input,content());
  if(latest.documents.some((d,i)=>d.file!==job.documents[i].file))throw fail(422,'Документы обновились. Повторите сборку пакета.');
  res.writeHead(200,{'Content-Type':'application/zip','Content-Length':zip.length,'Content-Disposition':disposition('ФАСАД_PRO_пакет_подрядчика.zip'),'Cache-Control':'no-store'});res.end(zip);return;
 }
 if(route==='/api/portfolio'&&req.method==='POST'){
  if(!rate('portfolio:'+ip(req),12,600000))throw fail(429,'Слишком много подборок. Попробуйте через несколько минут.');
  const input=await jsonBody(req,5000),ids=input.projects;
  if(!Array.isArray(ids)||ids.length<1||ids.length>20||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'))throw fail(422,'Выберите от 1 до 20 разных объектов.');
  const current=content(),projects=ids.map(id=>current.projects.find(p=>p.id===id&&p.published!==false));if(projects.some(p=>!p))throw fail(422,'Один из объектов больше не опубликован. Обновите подборку.');
  const recipient=text(input.recipient||'',140),pdf=await createPortfolio({projects,settings:current.settings,recipient});
  res.writeHead(200,{'Content-Type':'application/pdf','Content-Length':pdf.length,'Content-Disposition':disposition('Портфолио_ФАСАД_PRO_подборка.pdf'),'Cache-Control':'no-store'});res.end(pdf);return;
 }
 if(['/api/requests','/api/callback','/api/photo-request'].includes(route)&&req.method==='POST'){
  if(!rate('lead:'+ip(req),10,3600000))throw fail(429,'Слишком много заявок. Попробуйте позже или позвоните менеджеру.');
  const callback=route==='/api/callback',photo=route==='/api/photo-request';let f;if(callback){const b=await jsonBody(req,6000);f=new FormData();for(const k of ['name','phone','preferredTime','consent','website','idempotency','sourcePage','comparedProjects','analyticsSession']){if(b[k]!==undefined&&typeof b[k]!=='string')throw fail(422,'Проверьте поля формы.');f.set(k,b[k]??'');}}else f=await multipart(req);if(f.get('website'))throw fail(422,'Проверьте форму.');const key=text(f.get('idempotency')||'',80,true);if(!/^[a-f0-9-]{36}$/.test(key))throw fail(422,'Обновите страницу формы.');const p=callback?callbackPayload(f):photo?photoPayload(f):leadPayload(f),files=callback?[]:await getFiles(f,photo,5);if(photo&&!files.length)throw fail(422,'Добавьте хотя бы одну фотографию объекта.');const digest=hash(JSON.stringify(p).replace(/"consentAt":"[^"]+",/,'')+files.map(x=>x.name+hash(x.bytes)).join('|'));const prior=db.prepare('SELECT reference,digest FROM leads WHERE idempotency=?').get(key);if(prior){if(prior.digest!==digest)throw fail(409,'Данные изменились. Обновите форму и повторите отправку.');json(res,200,{reference:prior.reference,received:true});return;}
  const id=randomUUID(),reference='FP-'+new Date().toISOString().slice(0,10).replaceAll('-','')+'-'+randomBytes(4).toString('hex').toUpperCase();const sid=/^[a-f0-9-]{36}$/.test(f.get('analyticsSession')||'')?f.get('analyticsSession'):null;
  try{for(const file of files)await writeFile(path.join(DATA,'uploads',file.id),file.bytes,{mode:0o600,flag:'wx'});transaction(()=>{db.prepare('INSERT INTO leads(id,reference,created,kind,payload,idempotency,digest,session_id) VALUES(?,?,?,?,?,?,?,?)').run(id,reference,new Date().toISOString(),p.kind,JSON.stringify(p),key,digest,sid);for(const file of files)db.prepare('INSERT INTO files VALUES(?,?,?,?,?)').run(file.id,id,file.name,file.size,file.ext);db.prepare('INSERT INTO outbox(id,lead_id,recipient,kind) VALUES(?,?,?,?)').run(randomUUID(),id,notificationConfig().leadTo,'manager');if(p.email)db.prepare('INSERT INTO outbox(id,lead_id,recipient,kind) VALUES(?,?,?,?)').run(randomUUID(),id,p.email,'receipt');queueTelegram(id);});}catch(e){for(const file of files)await rm(path.join(DATA,'uploads',file.id),{force:true});throw e;}
  json(res,201,{reference,received:true});void flushMail();return;
 }
 if(route==='/api/events'&&req.method==='POST'){
  if(!rate('events:'+ip(req),200,60000))throw fail(429,'Лимит статистики.');const b=await jsonBody(req,4000);if(!/^[a-f0-9-]{36}$/.test(b.session||'')||!['page_view','request_start','step_2','step_3','service_interest','contact_click','portfolio_download'].includes(b.event))throw fail(422,'Некорректное событие.');const detail=SERVICE_IDS.includes(b.detail)?b.detail:['request','quote','phone','email'].includes(b.detail)?b.detail:'';const source=/^[a-zA-Z0-9_.-]{1,80}$/.test(b.source||'')?b.source:'direct';db.prepare('INSERT INTO events(created,session_id,event,page,detail,source) VALUES(?,?,?,?,?,?)').run(new Date().toISOString(),b.session,b.event,cleanPage(b.page||'/'),detail,source);json(res,202,{ok:true});return;
 }
 if(route==='/api/admin/login'&&req.method==='POST'){
  if(!rate('login:'+ip(req),10,900000))throw fail(429,'Слишком много попыток. Подождите 15 минут.');const b=await jsonBody(req,4000),username=text(b.username,60,true),password=text(b.password,300,true),admin=db.prepare('SELECT * FROM admins WHERE username=?').get(username);const dummy='0123456789abcdef0123456789abcdef:'+ '0'.repeat(128);if(!passwordValid(password,admin?.password||dummy)||!admin)throw fail(401,'Неверный логин или пароль.');const token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(hash(token),username,csrf,Date.now()+8*3600000);audit(username,'login');json(res,200,{username,csrf},{'Set-Cookie':`fp_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${secureCookie?'; Secure':''}`});return;
 }
 if(route.startsWith('/api/admin/')){
  const s=session(req,!['GET','HEAD'].includes(req.method));
  if(route==='/api/admin/session'&&req.method==='GET'){json(res,200,{username:s.username,csrf:s.csrf,smtpConfigured:notificationConfig().emailEnabled});return;}
  if(route==='/api/admin/logout'&&req.method==='POST'){db.prepare('DELETE FROM sessions WHERE hash=?').run(s.hash);json(res,200,{ok:true},{'Set-Cookie':'fp_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'+(secureCookie?'; Secure':'')});return;}
  if(route==='/api/admin/password'&&req.method==='POST'){const b=await jsonBody(req,4000);if(!passwordValid(text(b.current,300,true),db.prepare('SELECT password FROM admins WHERE username=?').get(s.username).password))throw fail(422,'Текущий пароль неверен.');const pass=text(b.password,300,true);if(pass.length<14)throw fail(422,'Минимум 14 символов.');db.prepare('UPDATE admins SET password=? WHERE username=?').run(passwordHash(pass),s.username);db.prepare('DELETE FROM sessions WHERE username=? AND hash<>?').run(s.username,s.hash);audit(s.username,'password_changed');json(res,200,{ok:true});return;}
  if(route==='/api/admin/content'&&req.method==='GET'){json(res,200,content());return;}
  if(route==='/api/admin/content'&&req.method==='PUT'){
   const b=await jsonBody(req),next=validateContent(b);for(const r of next.materials){if(r.file&&!existsSync(path.join(DATA,r.file)))throw fail(422,'Файл материала не найден. Загрузите его снова.');}for(const key of allContentImages(next)){const file=key.startsWith('media/')?path.join(DATA,key):path.join(site,'assets',key+'.webp');if(!existsSync(file))throw fail(422,'Фотография не найдена. Загрузите её снова.');}
   const task=publishQueue.then(async()=>{const current=content();if(b.revision!==current.revision)throw fail(409,'Сайт изменён в другой вкладке. Обновите данные.');const dir=await render(next),old=activePublic;transaction(()=>{db.prepare('UPDATE content SET revision=revision+1,json=? WHERE id=1').run(JSON.stringify(next));audit(s.username,'content_published');});activePublic=path.join(dir,'public');setTimeout(()=>rm(path.dirname(old),{recursive:true,force:true}).catch(()=>{}),30000).unref();return current.revision+1;});publishQueue=task.catch(()=>{});const revision=await task;json(res,200,{...next,revision});return;
  }
  if(route==='/api/admin/preview'&&req.method==='POST'){
   if(!rate('preview:'+s.username,20,60000))throw fail(429,'Подождите перед следующим предпросмотром.');
   const b=await jsonBody(req),next=validateContent(b.content),project=next.projects.find(p=>p.id===b.project);
   if(!project)throw fail(422,'Сначала укажите адрес проекта.');project.published=true;
   const dir=await render(next);
   try{
    let html=await readFile(path.join(dir,'public','projects',project.id+'.html'),'utf8');
    // Draft previews can require a script combination absent from published pages.
    const css=['styles','enhancements','business','release4','visual5','museum','release6','release7','release8','release9','visual10','release103'];
    const js=['app','public','request','release4','visual5','museum','release6','release7','release8','release9','visual10'];
    html=html.replace(/<link rel="stylesheet" href="[^"]*bundles\/site-[a-f0-9]+\.css">/,css.map(n=>'<link rel="stylesheet" href="/'+n+'.css">').join(''));
    html=html.replace(/<script src="[^"]*bundles\/page-[a-f0-9]+\.js" defer><\/script>/,js.map(n=>'<script src="/'+n+'.js" defer></script>').join(''));
    json(res,200,{html:html.replace('<head>','<head><base href="'+origin(req)+'/projects/">')});
   }finally{await rm(dir,{recursive:true,force:true});}
   return;
  }
  if(route==='/api/admin/showcases'){
   if(req.method==='GET'){json(res,200,{rows:listShowcases()});return;}
   if(req.method==='POST'){const token=saveShowcase(await jsonBody(req,20000));audit(s.username,'showcase_created',token);json(res,201,{token,url:origin(req)+'/selection/'+token});return;}
  }
  const shareMatch=route.match(/^\/api\/admin\/showcases\/([a-f0-9]{48})$/);
  if(shareMatch){
   if(req.method==='PUT'){saveShowcase(await jsonBody(req,20000),shareMatch[1]);audit(s.username,'showcase_updated',shareMatch[1]);json(res,200,{ok:true});return;}
   if(req.method==='PATCH'){const b=await jsonBody(req,2000),row=db.prepare('SELECT revision FROM showcases WHERE token=?').get(shareMatch[1]);if(!row)throw fail(404,'Подборка не найдена.');if(b.revision!==row.revision)throw fail(409,'Подборка изменена. Обновите список.');db.prepare('UPDATE showcases SET revoked=?,revision=revision+1 WHERE token=?').run(b.revoked===true?1:0,shareMatch[1]);audit(s.username,'showcase_access_changed',shareMatch[1]);json(res,200,{ok:true});return;}
  }
  if(route==='/api/admin/notifications'){
   if(req.method==='GET'){json(res,200,notificationPublic());return;}
   if(req.method==='PUT'){const result=saveNotifications(await jsonBody(req,10000));audit(s.username,'notification_settings_saved');json(res,200,result);void flushMail();return;}
  }
  if(route==='/api/admin/notifications/test'&&req.method==='POST'){
   if(!rate('notification-test:'+s.username,10,3600000))throw fail(429,'Не более 10 проверок за час.');
   const b=await jsonBody(req,1000),c=notificationConfig();
   try{
    if(b.channel==='email'){if(!c.emailEnabled)throw fail(422,'Сначала включите и сохраните почту.');await runPython(path.join(ROOT,'backend/mail.py'),JSON.stringify({to:c.leadTo,subject:'ФАСАД.PRO — проверка уведомлений',body:'Почта сайта подключена. Это проверочное сообщение из панели управления.',message_id:'<'+randomUUID()+'@facadepro.ru>'}),smtpEnvironment(c),45000);}
    else if(b.channel==='telegram'){if(!c.telegramEnabled)throw fail(422,'Сначала включите и сохраните Telegram.');await sendTelegram('ФАСАД.PRO: проверка уведомлений. Новые заявки будут доступны в панели '+origin(req)+'/admin/',c);}
    else throw fail(422,'Выберите канал уведомлений.');
   }catch(error){if(error.status)throw error;throw fail(502,'SMTP не принял письмо. Проверьте сервер, порт, пароль и адреса отправителя и получателя.');}
   audit(s.username,'notification_test',b.channel);json(res,200,{ok:true});return;
  }
  if(route==='/api/admin/notifications/chats'&&req.method==='POST'){
   const c=notificationConfig();if(!c.telegramToken)throw fail(422,'Сначала сохраните токен бота.');
   if(!rate('telegram-chats:'+s.username,10,60000))throw fail(429,'Повторите через минуту.');
   const updates=await telegramRequest('getUpdates',{limit:30,timeout:0},c),chats=new Map();
   for(const u of updates){const chat=u.message?.chat||u.my_chat_member?.chat;if(chat)chats.set(String(chat.id),{id:String(chat.id),title:chat.title||chat.first_name||chat.username||String(chat.id)});}
   json(res,200,{chats:[...chats.values()]});return;
  }
  if(route==='/api/admin/materials/upload'&&req.method==='POST'){
   const f=await multipart(req,61*1024*1024),files=f.getAll('files');
   if(files.length!==1||typeof files[0]==='string')throw fail(422,'Загрузите один файл.');
   const file=files[0],ext=file.name.split('.').at(-1).toLowerCase();
   if(!['pdf','mp4','webm'].includes(ext)||!file.size||file.size>(ext==='pdf'?15:60)*1024*1024)throw fail(422,'PDF — до 15 МБ; MP4 и WebM — до 60 МБ.');
   const bytes=Buffer.from(await file.arrayBuffer()),valid=ext==='pdf'?bytes.subarray(0,5).toString()==='%PDF-':ext==='mp4'?bytes.subarray(4,8).toString()==='ftyp':bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]));
   if(!valid)throw fail(422,'Формат файла не соответствует расширению.');
   const key='materials/'+randomUUID()+'.'+ext;await writeFile(path.join(DATA,key),bytes,{mode:0o600,flag:'wx'});audit(s.username,'material_uploaded',key);json(res,201,{key,url:'/'+key});return;
  }
  if(route==='/api/admin/media'&&req.method==='POST'){const form=await multipart(req,FILE_LIMIT+65536),files=await getFiles(form,true);if(files.length!==1)throw fail(422,'Выберите фотографию.');const f=files[0],ext=f.ext==='jpeg'?'jpg':f.ext,key='media/'+f.id+'.'+ext;await writeFile(path.join(DATA,key),f.bytes,{mode:0o600,flag:'wx'});audit(s.username,'photo_uploaded',key);json(res,201,{key,url:'/'+key});return;}
  if(route==='/api/admin/stats'&&req.method==='GET'){const days=[7,30,90].includes(Number(url.searchParams.get('days')))?Number(url.searchParams.get('days')):30;json(res,200,stats(days));return;}
  if(route==='/api/admin/staff'&&req.method==='GET'){json(res,200,{staff:staff()});return;}
  if(route==='/api/admin/reminders'&&req.method==='GET'){json(res,200,reminders(todayParam(url.searchParams.get('today')),url.searchParams.get('mine')==='1'?s.username:''));return;}
  if(route==='/api/admin/leads'&&req.method==='GET'){json(res,200,listLeads(url.searchParams,s.username));return;}
  const match=route.match(/^\/api\/admin\/leads\/([a-f0-9-]{36})(\/retry)?$/);
  if(match){const lead=db.prepare('SELECT * FROM leads WHERE id=?').get(match[1]);if(!lead)throw fail(404,'Заявка не найдена.');
   if(req.method==='GET'){json(res,200,{...lead,payload:JSON.parse(lead.payload),files:db.prepare('SELECT id,name,size FROM files WHERE lead_id=?').all(lead.id),notifications:db.prepare('SELECT id,kind,channel,state,attempts,last_error,sent_at FROM outbox WHERE lead_id=?').all(lead.id)});return;}
   if(req.method==='PATCH'){const b=await jsonBody(req,15000);if(!STATUSES[b.status])throw fail(422,'Выберите статус.');const note=text(b.note||'',10000);if(b.revision!==lead.revision)throw fail(409,'Заявка изменена в другой вкладке. Откройте её заново.');const f=updateFollowup(lead,b);db.prepare('UPDATE leads SET status=?,note=?,assignee=?,next_contact=?,next_action=?,revision=revision+1 WHERE id=?').run(b.status,note,f.assignee,f.nextContact,f.nextAction,lead.id);audit(s.username,'lead_updated',lead.id);json(res,200,{ok:true,revision:lead.revision+1});return;}
   if(req.method==='POST'&&match[2]){db.prepare("UPDATE outbox SET state='pending',attempts=0,next_try=0,last_error='' WHERE lead_id=? AND state IN ('failed','pending')").run(lead.id);audit(s.username,'notification_retry',lead.id);void flushMail();json(res,200,{ok:true});return;}
   if(req.method==='DELETE'){const files=db.prepare('SELECT id FROM files WHERE lead_id=?').all(lead.id);transaction(()=>{db.prepare('DELETE FROM leads WHERE id=?').run(lead.id);audit(s.username,'lead_deleted',lead.id);});for(const f of files)await rm(path.join(DATA,'uploads',f.id),{force:true});json(res,200,{ok:true});return;}
  }
  const fileMatch=route.match(/^\/api\/admin\/files\/([a-f0-9-]{36})$/);if(fileMatch&&req.method==='GET'){const f=db.prepare('SELECT * FROM files WHERE id=?').get(fileMatch[1]);if(!f)throw fail(404,'Файл не найден.');audit(s.username,'file_downloaded',f.lead_id);if(await serveFile(req,res,path.join(DATA,'uploads',f.id),{'Content-Disposition':disposition(f.name),'Content-Type':'application/octet-stream','Cache-Control':'no-store'}))return;throw fail(404,'Файл недоступен.');}
  throw fail(404,'Действие не найдено.');
 }
 if(route.startsWith('/api/'))throw fail(404,'Метод API не найден.');
 if(!['GET','HEAD'].includes(req.method))throw fail(405,'Метод не поддерживается.');
 if(route.startsWith('/media/')){if(!/^\/media\/[a-f0-9-]+\.(jpg|png|webp)$/.test(route))throw fail(404,'Файл не найден.');if(await serveFile(req,res,path.join(DATA,route.slice(1))))return;}
 else{
  if(route==='/admin'){res.writeHead(308,{Location:'/admin/'});res.end();return;}
  const relative=route==='/'?'index.html':route==='/admin/'?'admin/index.html':route.slice(1);
  if(relative.split('/').some(p=>p.startsWith('.')||p==='..')||relative.includes('\0')||relative.includes('\\'))throw fail(404,'Страница не найдена.');
  const generated=relative.endsWith('.html')&&!relative.startsWith('admin/')||relative==='sitemap.xml'||relative.startsWith('bundles/');
  const root=generated?activePublic:site;
  const file=path.resolve(root,relative);if(file.startsWith(root+path.sep)&&await serveFile(req,res,file,relative.startsWith('admin/')?{'X-Robots-Tag':'noindex, nofollow','Cache-Control':'no-store'}:{}))return;
 }
 res.writeHead(404,{'Content-Type':'text/html; charset=utf-8'});res.end(await readFile(path.join(activePublic,'404.html')));
 }catch(e){if(res.headersSent){res.end();return;}const status=e.status||500;json(res,status,{error:status<500?e.message:'Не удалось выполнить действие. Попробуйте ещё раз.'});if(status>=500)console.error('Request failed:',e.name);}});
server.requestTimeout=60000;server.headersTimeout=15000;server.maxRequestsPerSocket=100;
server.listen(port,'0.0.0.0',()=>console.log('Local: http://localhost:'+port+'/'));
const mailTimer=setInterval(()=>void flushMail(),30000);mailTimer.unref();const cleanupTimer=setInterval(()=>void cleanup().catch(()=>{}),3600000);cleanupTimer.unref();await cleanup();void flushMail();
process.on('SIGTERM',()=>server.close(()=>{db.close();process.exit(0)}));
