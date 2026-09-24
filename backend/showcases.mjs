import {randomBytes} from 'node:crypto';
import {db,content,fail,text,emailOK} from './store.mjs';
db.exec("CREATE TABLE IF NOT EXISTS showcases(token TEXT PRIMARY KEY,title TEXT NOT NULL,message TEXT NOT NULL,recipient TEXT NOT NULL,projects TEXT NOT NULL,manager TEXT NOT NULL,phone TEXT NOT NULL,email TEXT NOT NULL,created TEXT NOT NULL,expires TEXT NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 1)");
export function saveShowcase(b,token=null){
 const current=content(),ids=b.projects;
 if(!Array.isArray(ids)||!ids.length||ids.length>20||new Set(ids).size!==ids.length||ids.some(id=>!current.projects.some(p=>p.id===id&&p.published!==false)))throw fail(422,'Выберите от 1 до 20 опубликованных проектов.');
 const title=text(b.title,180,true),message=text(b.message||'',2500),recipient=text(b.recipient||'',140),manager=text(b.manager,150,true),phone=text(b.phone,40),email=text(b.email,200,true);
 if(!emailOK(email)||!/^\+?[\d\s().-]{7,40}$/.test(phone))throw fail(422,'Проверьте контакты менеджера.');
 const days=Number(b.days);if(!Number.isInteger(days)||days<1||days>365)throw fail(422,'Срок действия — от 1 до 365 дней.');
 const expires=new Date(Date.now()+days*86400000).toISOString(),created=new Date().toISOString();
 if(token){
  const old=db.prepare('SELECT * FROM showcases WHERE token=?').get(token);
  if(!old)throw fail(404,'Подборка не найдена.');
  if(old.revision!==b.revision)throw fail(409,'Подборка изменена. Обновите список.');
  db.prepare('UPDATE showcases SET title=?,message=?,recipient=?,projects=?,manager=?,phone=?,email=?,expires=?,revision=revision+1 WHERE token=?').run(title,message,recipient,JSON.stringify(ids),manager,phone,email,expires,token);
 }else{
  if(db.prepare('SELECT COUNT(*) n FROM showcases').get().n>=1000)throw fail(422,'Достигнут предел: 1000 подборок.');
  token=randomBytes(24).toString('hex');
  db.prepare('INSERT INTO showcases(token,title,message,recipient,projects,manager,phone,email,created,expires) VALUES(?,?,?,?,?,?,?,?,?,?)').run(token,title,message,recipient,JSON.stringify(ids),manager,phone,email,created,expires);
 }
 return token;
}
export function listShowcases(){return db.prepare('SELECT * FROM showcases ORDER BY created DESC LIMIT 1000').all().map(s=>({...s,projects:JSON.parse(s.projects)}));}
export function getShowcase(token){
 if(!/^[a-f0-9]{48}$/.test(token||''))throw fail(404,'Подборка не найдена.');
 const row=db.prepare('SELECT * FROM showcases WHERE token=?').get(token);
 if(!row||row.revoked||row.expires<=new Date().toISOString())throw fail(410,'Срок действия этой подборки закончился. Запросите новую ссылку у менеджера.');
 const all=content(),projects=JSON.parse(row.projects).map(id=>all.projects.find(p=>p.id===id&&p.published!==false)).filter(Boolean);
 if(!projects.length)throw fail(410,'Подборка сейчас недоступна. Свяжитесь с менеджером.');
 return {...row,projects,settings:all.settings};
}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const photo=key=>key.startsWith('media/')?'/'+key:'/assets/'+key+'.webp';
export function closedShowcaseHTML(){return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Подборка недоступна — ФАСАД.PRO</title><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/enhancements.css"><link rel="stylesheet" href="/release6.css"></head><body><main class="selection-intro"><p class="eyebrow">ФАСАД.PRO</p><h1>Эта подборка уже недоступна</h1><p>Свяжитесь с менеджером, чтобы получить актуальное портфолио для вашего объекта.</p><div class="selection-actions"><a class="button" href="/request.html">Запросить подборку ↗</a><a class="text-button" href="/projects.html">Посмотреть проекты</a></div></main></body></html>';}
export function showcaseHTML(s){
 const cards=s.projects.map((p,i)=>'<article class="selection-card"><a href="/projects/'+p.id+'.html"><img src="'+photo(p.images[0])+'" alt="'+esc(p.title)+'" loading="lazy" width="1200" height="800"></a><div><span class="eyebrow">'+String(i+1).padStart(2,'0')+' / '+esc(p.type)+'</span><h2>'+esc(p.title)+'</h2><p>'+esc(p.location)+'</p><strong>'+esc(p.volume)+'</strong><p>'+esc(p.work)+'</p><a class="text-button" href="/projects/'+p.id+'.html">История проекта ↗</a></div></article>').join('');
 return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>'+esc(s.title)+' — ФАСАД.PRO</title><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/enhancements.css"><link rel="stylesheet" href="/release6.css"><script src="/release6.js" defer></script></head><body><header class="selection-site-header"><a href="/" aria-label="ФАСАД.PRO — главная"><img src="/assets/logo.svg" alt="ФАСАД.PRO"></a><span>Персональное портфолио</span></header><main><section class="selection-intro"><p class="eyebrow">'+esc(s.recipient||'Для вашего проекта')+'</p><h1>'+esc(s.title)+'</h1><p class="selection-message">'+esc(s.message)+'</p><div class="selection-actions"><a class="button" href="/quote.html?selection='+s.token+'">Обсудить похожий проект ↗</a><button class="text-button" type="button" data-selection-pdf>Скачать подборку PDF ↓</button></div><p class="selection-status" role="status"></p></section><section class="section">'+cards+'<aside class="selection-contact"><p class="eyebrow">Ваш менеджер</p><h2>'+esc(s.manager)+'</h2><a href="tel:'+s.phone.replace(/[^+0-9]/g,'')+'">'+esc(s.phone)+'</a><a href="mailto:'+esc(s.email)+'">'+esc(s.email)+'</a></aside></section></main></body></html>';
}
