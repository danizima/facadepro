import {upgradeContent,validateExtras,validateWorkflow} from './content6.mjs';
import {validateMaterials} from './content7.mjs';
import {applyPortfolioUpdate} from './portfolio-update.mjs';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,scryptSync,timingSafeEqual,createHash,createHmac} from 'node:crypto';
export const ROOT=fileURLToPath(new URL('../',import.meta.url));
export const DATA=path.resolve(process.env.DATA_DIR||path.join(ROOT,'data'));
mkdirSync(DATA,{recursive:true,mode:0o700});
for(const dir of ['uploads','media'])mkdirSync(path.join(DATA,dir),{recursive:true,mode:0o700});
const secretPath=path.join(DATA,'secret');
if(!existsSync(secretPath))writeFileSync(secretPath,randomBytes(48).toString('hex'),{mode:0o600,flag:'wx'});
export const secret=readFileSync(secretPath,'utf8');
export const db=new DatabaseSync(path.join(DATA,'facadepro.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS admins(username TEXT PRIMARY KEY,password TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,username TEXT NOT NULL,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS content(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS leads(id TEXT PRIMARY KEY,reference TEXT UNIQUE NOT NULL,created TEXT NOT NULL,kind TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'new',payload TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 1,idempotency TEXT UNIQUE NOT NULL,digest TEXT NOT NULL,session_id TEXT);
CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,name TEXT NOT NULL,size INTEGER NOT NULL,ext TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,recipient TEXT NOT NULL,kind TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_try INTEGER NOT NULL DEFAULT 0,last_error TEXT NOT NULL DEFAULT '',sent_at TEXT);
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,created TEXT NOT NULL,session_id TEXT NOT NULL,event TEXT NOT NULL,page TEXT NOT NULL,detail TEXT NOT NULL DEFAULT '',source TEXT NOT NULL DEFAULT 'direct');
CREATE INDEX IF NOT EXISTS events_date ON events(created);
CREATE INDEX IF NOT EXISTS events_session ON events(session_id,event);
CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,created TEXT NOT NULL,username TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL);
`);
// Idempotent migration: keep existing v3 leads and their history.
const leadColumns=new Set(db.prepare('PRAGMA table_info(leads)').all().map(c=>c.name));
for(const column of ['assignee','next_contact','next_action'])if(!leadColumns.has(column))db.exec(`ALTER TABLE leads ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);
db.exec('CREATE INDEX IF NOT EXISTS leads_followup ON leads(next_contact,status,assignee)');
const seedContent=JSON.parse(readFileSync(path.join(ROOT,'source/content.json'),'utf8'));
if(!db.prepare('SELECT id FROM content WHERE id=1').get())db.prepare('INSERT INTO content VALUES(1,1,?)').run(readFileSync(path.join(ROOT,'source/content.json'),'utf8'));
applyPortfolioUpdate(db,JSON.parse(readFileSync(path.join(ROOT,'source/portfolio-update10-2.json'),'utf8')));
applyPortfolioUpdate(db,JSON.parse(readFileSync(path.join(ROOT,'source/portfolio-update11.json'),'utf8')));
export const hash=x=>createHash('sha256').update(x).digest('hex');
export const privateHash=x=>createHmac('sha256',secret).update(x).digest('hex');
export function passwordHash(password){const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(password,salt,64).toString('hex');}
export function passwordValid(password,stored){try{const [salt,digest]=stored.split(':');return timingSafeEqual(scryptSync(password,salt,64),Buffer.from(digest,'hex'));}catch{return false;}}
export function content(){const row=db.prepare('SELECT * FROM content WHERE id=1').get(),value=JSON.parse(row.json);value.projects=value.projects.map(p=>{const seed=seedContent.projects.find(x=>x.id===p.id);return {...p,serviceIds:p.serviceIds??seed?.serviceIds??[],geo:p.geo===undefined&&(p.location===seed?.location)?seed.geo:p.geo??null};});return {revision:row.revision,...upgradeContent(value)};}
export function audit(user,action,target=''){db.prepare('INSERT INTO audit(created,username,action,target) VALUES(?,?,?,?)').run(new Date().toISOString(),user,action,target);}
export function rate(key,max,windowMs){const now=Date.now(),k=privateHash(key);let row=db.prepare('SELECT * FROM rate_limits WHERE key=?').get(k);if(!row||row.expires<=now){db.prepare('INSERT OR REPLACE INTO rate_limits VALUES(?,1,?)').run(k,now+windowMs);return true;}if(row.count>=max)return false;db.prepare('UPDATE rate_limits SET count=count+1 WHERE key=?').run(k);return true;}
export function cleanSession(){db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());db.prepare('DELETE FROM rate_limits WHERE expires<?').run(Date.now());}
export function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}
export const SERVICE_IDS=['glazing','windows','repair','engineering','supply','height'];
export const CATEGORIES=['Культурная инфраструктура','Гостиничные комплексы','Жилые комплексы','Строительство','Общественные объекты'];
export const STATUSES={new:'Новая',review:'На рассмотрении',estimate:'Готовим КП',sent:'КП отправлено',won:'Договор',closed:'Закрыта'};
export function fail(status,message){return Object.assign(new Error(message),{status});}
export function text(value,max,required=false){if(typeof value!=='string'||value.length>max||(required&&!value.trim())||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw fail(422,'Проверьте заполнение полей.');return value.trim();}
export const emailOK=s=>/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s)&&s.length<=200&&!/[\r\n]/.test(s);
export function validateContent(input){
 if(!input||!Array.isArray(input.projects)||input.projects.length>100)throw fail(422,'Допустимо до 100 проектов.');
 const s=input.settings||{},settings={};
 for(const key of ['slogan','manager','phone','email','vladivostok','moscow','legalName','inn','kpp'])settings[key]=text(s[key],250,true);
 if(!emailOK(settings.email)||!/^[+\d\s().-]{7,40}$/.test(settings.phone)||!/^\d{10}$/.test(settings.inn)||!/^\d{9}$/.test(settings.kpp))throw fail(422,'Проверьте телефон, email и реквизиты.');
 const ids=new Set();const projects=input.projects.map(p=>{
  if(!/^[a-z0-9][a-z0-9-]{1,59}$/.test(p.id)||ids.has(p.id))throw fail(422,'Адреса проектов должны быть уникальными: латинские буквы, цифры и дефис.');ids.add(p.id);
  const out={id:p.id,published:p.published!==false};
  for(const key of ['title','type','location','period','volume','work','client'])out[key]=text(p[key]||'',key==='work'?2000:250,['title','type','location','work'].includes(key));
  if(!CATEGORIES.includes(out.type))throw fail(422,'Выберите тип объекта.');
  const serviceList=p.serviceIds??[];if(!Array.isArray(serviceList)||serviceList.length>6||serviceList.some(x=>!SERVICE_IDS.includes(x)))throw fail(422,'Выберите направления проекта.');out.serviceIds=[...new Set(serviceList)];
  out.geo=null;if(p.geo!==undefined&&p.geo!==null){const g=p.geo;if(typeof g.lat!=='number'||typeof g.lng!=='number'||!Number.isFinite(g.lat)||!Number.isFinite(g.lng)||Math.abs(g.lat)>90||Math.abs(g.lng)>180||!['city','exact'].includes(g.precision))throw fail(422,'Проверьте координаты и точность отметки.');out.geo={lat:g.lat,lng:g.lng,label:text(g.label,100,true),precision:g.precision};}
  if(!Array.isArray(p.images)||p.images.length>12||p.images.some(x=>!/^([a-z0-9-]+|media\/[a-f0-9-]+\.(png|jpg|webp))$/.test(x)))throw fail(422,'Допустимо до 12 фотографий.');
  out.images=p.images;out.case={};for(const key of ['task','challenge','solution','result'])out.case[key]=text(p.case?.[key]||'',2500);
  Object.assign(out,validateExtras(p));
  return out;
 });
 if(!projects.some(p=>p.published))throw fail(422,'Оставьте хотя бы один опубликованный проект.');
 const workflow=validateWorkflow(input.workflow);
 for(const row of workflow){const project=projects.find(p=>p.id===row.project);if(!project||!project.images.includes(row.image))throw fail(422,'Фотография этапа должна принадлежать выбранному проекту.');}
 return {schemaVersion:6,settings,projects,workflow,materials:validateMaterials(input.materials,projects)};
}
