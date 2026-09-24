'use strict';
(()=>{
 function uuid(){if(crypto.randomUUID)return crypto.randomUUID();const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const h=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);}
 const offline=Boolean(window.facadeOffline)||location.protocol==='file:';
 const serviceIds=['glazing','windows','repair','engineering','supply','height'];
 const route=window.facadePath||location.pathname;
 const path=route==='/'?'/':('/'+route.replace(/^\//,'')).split('?')[0];
 const ready=offline?Promise.resolve(null):fetch('/api/public/config',{credentials:'omit',signal:AbortSignal.timeout(6000)}).then(r=>r.ok?r.json():null).catch(()=>null);
 let choice='';try{choice=localStorage.getItem('facade_statistics')||'';}catch{}
 function getSession(){if(choice!=='yes'||offline)return '';try{const old=JSON.parse(sessionStorage.getItem('facade_visit')||'null'),now=Date.now(),data=old&&now-old.touched<1800000?old:{id:uuid()};data.touched=now;if(!data.entry)data.entry=path;if(!/\/(request|quote)\.html$/.test(path))data.lastPage=path;sessionStorage.setItem('facade_visit',JSON.stringify(data));return data.id;}catch{return '';}}
 function source(){const q=new URLSearchParams(window.facadeQuery??location.search),utm=q.get('utm_source');if(utm&&/^[a-zA-Z0-9_.-]{1,80}$/.test(utm))return utm;try{const r=new URL(document.referrer);return r.origin!==location.origin?r.hostname:'direct';}catch{return 'direct';}}
 async function track(event,detail=''){const sid=getSession();if(!sid||!await ready)return;fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sid,event,page:path,detail,source:source()}),keepalive:true,credentials:'omit'}).catch(()=>{});}
 function attribution(){try{if(choice==='yes'){const visit=JSON.parse(sessionStorage.getItem('facade_visit')||'null');if(visit?.lastPage)return visit.lastPage;}const ref=new URL(document.referrer);if(ref.origin===location.origin&&!ref.pathname.startsWith('/admin'))return ref.pathname;}catch{}return path;}
 window.facade={ready,offline,track,getSession,path,uuid,attribution};
 const panel=document.createElement('section');panel.className='consent-banner';panel.setAttribute('aria-label','Настройки статистики');panel.hidden=Boolean(choice)||offline;
 panel.innerHTML='<div><strong>Разрешить статистику посещений?</strong><p>Она помогает понять, какие разделы полезны. Текст заявок и файлы в статистику не попадают. <a href="'+document.body.dataset.base+'privacy.html">Подробнее</a></p></div><div class="consent-actions"><button class="button" type="button" data-consent="yes">Разрешить</button><button class="button button-outline" type="button" data-consent="no">Только необходимые</button></div>';
 document.body.append(panel);
 panel.querySelectorAll('[data-consent]').forEach(b=>b.addEventListener('click',()=>{choice=b.dataset.consent;try{localStorage.setItem('facade_statistics',choice);if(choice==='no')sessionStorage.removeItem('facade_visit');}catch{}panel.hidden=true;if(choice==='yes'){track('page_view');const id=path.match(/\/services\/([a-z]+)\.html$/)?.[1];if(serviceIds.includes(id))track('service_interest',id);}}));
 document.querySelectorAll('.analytics-settings').forEach(b=>b.addEventListener('click',()=>{panel.hidden=false;panel.querySelector('button').focus();}));
 if(choice==='yes'){track('page_view');const id=path.match(/\/services\/([a-z]+)\.html$/)?.[1];if(serviceIds.includes(id))track('service_interest',id);}
 document.addEventListener('click',event=>{const a=event.target.closest('a');if(!a)return;const href=a.getAttribute('href')||'';if(href.startsWith('tel:'))track('contact_click','phone');if(href.startsWith('mailto:'))track('contact_click','email');if(a.classList.contains('portfolio-download'))track('portfolio_download');});
 const range=document.querySelector('.comparison-control input');if(range&&!document.querySelector('.visual-comparison')){const draw=()=>{document.querySelector('.photo-comparison').style.setProperty('--split',range.value+'%');range.setAttribute('aria-valuetext',range.value+'% фотографии каркаса');};range.addEventListener('input',draw);draw();}
})();
