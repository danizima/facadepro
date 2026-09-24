(() => {
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const image=key=>!key?'/assets/project-summary.svg':key.startsWith('media/')?'/'+key:'/assets/'+key+'.webp';
 const download=async(ids,status)=>{status.textContent='Готовим PDF…';const r=await fetch('/api/portfolio',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projects:ids,recipient:''}),signal:AbortSignal.timeout(65000)});if(!r.ok)throw Error((await r.json()).error||'Не удалось подготовить PDF.');const url=URL.createObjectURL(await r.blob()),a=document.createElement('a');a.href=url;a.download='ФАСАД_PRO_проекты.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);status.textContent='PDF готов.';};
 const callbackSection=document.querySelector('.callback-section');
 if(callbackSection&&'IntersectionObserver' in window)new IntersectionObserver(entries=>document.body.classList.toggle('callback-in-view',entries[0].isIntersecting),{threshold:0}).observe(callbackSection);
 document.querySelectorAll('.callback-form').forEach(form=>{
  const status=form.querySelector('.callback-status'),button=form.querySelector('[type=submit]');let key=window.facade.uuid(),busy=false;
  form.addEventListener('input',()=>{if(!busy)key=window.facade.uuid();});
  form.addEventListener('submit',async event=>{event.preventDefault();if(busy||!form.reportValidity())return;busy=true;button.disabled=true;status.textContent='Отправляем…';
   try{if(!await window.facade.ready)throw Error('Отправка сейчас недоступна. Позвоните по номеру внизу страницы.');const values=Object.fromEntries(new FormData(form)),r=await fetch('/api/callback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...values,consent:form.elements.consent.checked?'yes':'',idempotency:key,sourcePage:window.facade.attribution(),analyticsSession:window.facade.getSession()})});const result=await r.json();if(!r.ok)throw Error(result.error||'Не удалось отправить обращение.');status.textContent='Запрос '+result.reference+' получен. Менеджер свяжется с вами для уточнения задачи.';form.reset();key=window.facade.uuid();status.focus();}
   catch(error){status.textContent=error.message;status.focus();}finally{busy=false;button.disabled=false;}
  });
 });
 const picker=document.querySelector('#compare-picker');if(!picker)return;
 const status=document.querySelector('#compare-status'),result=document.querySelector('#compare-result'),pdf=document.querySelector('#compare-pdf'),copy=document.querySelector('#compare-copy'),checks=[...picker.querySelectorAll('input[type=checkbox]')];
 let projects=[],selected=[];
 const serviceNames={glazing:'Фасадное остекление',windows:'Оконные системы',repair:'Ремонт и восстановление',engineering:'Инженерная подготовка',supply:'Производство и снабжение',height:'Работы на высоте'};
 function draw(){
  checks.forEach(c=>{c.checked=selected.includes(c.value);c.disabled=!projects.some(p=>p.id===c.value)||(!c.checked&&selected.length>=3);});
  pdf.disabled=copy.disabled=selected.length<2;status.textContent='Выбрано: '+selected.length+' из 3. '+(selected.length<2?'Добавьте хотя бы два проекта.':'Можно сравнить данные ниже.');
  const url=new URL(location.href);if(selected.length)url.searchParams.set('projects',selected.join(','));else url.searchParams.delete('projects');history.replaceState(null,'',url);
  try{localStorage.setItem('facade_compare',JSON.stringify(selected));}catch{}
  if(selected.length<2){result.replaceChildren();return;}
  const rows=selected.map(id=>projects.find(p=>p.id===id));
  const fields=[['Тип объекта',p=>p.type],['Расположение',p=>p.location],['Период',p=>p.period],['Ключевой показатель',p=>p.volume],['Что делали',p=>p.work],['Направления',p=>p.serviceIds.map(id=>serviceNames[id]).join(', ')],['Особенности',p=>p.case?.challenge],['Результат / участие',p=>p.case?.result]];
  result.innerHTML='<div class="compare-table-wrap" tabindex="0" role="region" aria-label="Таблица сравнения проектов"><table class="compare-table"><caption>Состав участия ФАСАД.PRO в выбранных проектах</caption><thead><tr><th scope="col">Параметр</th>'+rows.map(p=>'<th scope="col"><a href="/projects/'+p.id+'.html"><img src="'+image(p.image)+'" alt="" loading="lazy"><span>'+esc(p.title)+'</span></a></th>').join('')+'</tr></thead><tbody>'+fields.map(([label,get])=>'<tr><th scope="row">'+label+'</th>'+rows.map(p=>'<td>'+esc(get(p)||'Нет данных')+'</td>').join('')+'</tr>').join('')+'</tbody></table></div><p class="compare-mobile-hint">На небольшом экране таблицу можно прокрутить в сторону.</p><a class="button" href="/request.html?compare='+selected.join(',')+'">Обсудить похожий объект ↗</a>';
 }
 async function load(){try{status.textContent='Загружаем актуальные проекты…';const response=await fetch('/api/public/projects');if(!response.ok)throw Error();projects=(await response.json()).projects;let ids=(new URLSearchParams(location.search).get('projects')||'').split(',');if(ids.length===1&&!ids[0]){try{ids=JSON.parse(localStorage.getItem('facade_compare')||'[]');}catch{ids=[];}}selected=Array.isArray(ids)?[...new Set(ids)].filter(id=>projects.some(p=>p.id===id)).slice(0,3):[];draw();}catch{status.textContent='Не удалось загрузить проекты. Обновите страницу или откройте каталог.';checks.forEach(c=>c.disabled=true);}}
 checks.forEach(c=>c.addEventListener('change',()=>{if(c.checked&&selected.length<3)selected.push(c.value);else selected=selected.filter(id=>id!==c.value);draw();}));
 document.querySelector('#compare-clear').onclick=()=>{selected=[];draw();};
 copy.onclick=async()=>{try{await navigator.clipboard.writeText(location.href);status.textContent='Ссылка на сравнение скопирована.';}catch{status.textContent='Ссылка: '+location.href;}};
 pdf.onclick=async()=>{pdf.disabled=true;try{await download(selected,status);}catch(e){status.textContent=e.message;}finally{pdf.disabled=selected.length<2;}};
 void load();
})();
