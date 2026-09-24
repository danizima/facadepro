(() => {
 'use strict';
 const form=document.querySelector('#contractor-kit');if(!form)return;
 const status=form.querySelector('.kit-status'),submit=form.querySelector('[type=submit]'),count=form.querySelector('[data-kit-count]'),retry=form.querySelector('[data-kit-retry]'),again=form.querySelector('[data-kit-download]');
 let ready=false,busy=false,downloadURL='';
 const selected=()=>({profile:form.elements.profile.checked,projects:[...form.querySelectorAll('[name=project]:checked')].map(c=>c.value),documents:[...form.querySelectorAll('[name=document]:checked')].map(c=>c.value)});
 function resetDownload(){if(downloadURL)URL.revokeObjectURL(downloadURL);downloadURL='';again.hidden=true;again.removeAttribute('href');}
 function draw(){const s=selected();count.textContent=(s.profile?'Карточка компании · ':'')+'Объектов: '+s.projects.length+' · Документов: '+s.documents.length;submit.disabled=busy||!ready||(!s.profile&&!s.projects.length&&!s.documents.length);form.querySelectorAll('[name=project]').forEach(c=>c.disabled=busy||(!c.checked&&s.projects.length>=20));form.querySelectorAll('[name=document]').forEach(c=>c.disabled=busy||(!c.checked&&s.documents.length>=10));form.elements.profile.disabled=busy;}
 function checkbox(row,name,checked,detail){const label=document.createElement('label');label.className='kit-check';const input=document.createElement('input');input.type='checkbox';input.name=name;input.value=row.id;input.checked=checked;const span=document.createElement('span'),title=document.createElement('strong');title.textContent=row.title;span.append(title);if(detail){const small=document.createElement('small');small.textContent=detail;span.append(small);}label.append(input,span);return label;}
 async function load(){ready=false;retry.hidden=true;submit.disabled=true;status.textContent='Загружаем материалы…';
  try{if(window.facade.offline)throw Error('Сборка пакета доступна на facadepro.ru.');const r=await fetch('/api/public/contractor-kit',{credentials:'omit',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Не удалось загрузить материалы. Повторите попытку.');const data=await r.json();const projects=form.querySelector('[data-kit-projects]'),docs=form.querySelector('[data-kit-documents]');projects.replaceChildren(...data.projects.map(p=>checkbox(p,'project',['museum','burny','restaurant'].includes(p.id),p.location)));docs.replaceChildren(...data.documents.map(d=>checkbox(d,'document',false,'')));if(!data.projects.length)projects.textContent='Портфолио обновляется. Пока можно скачать карточку компании.';if(!data.documents.length)docs.textContent='Документы пока предоставляются по запросу. Менеджер поможет собрать материалы для проверки подрядчика.';ready=true;status.textContent='Выберите материалы и скачайте пакет.';draw();}
  catch(error){status.textContent=error.name==='TimeoutError'?'Не удалось загрузить материалы. Повторите попытку.':error.message;count.textContent='Материалы ещё не загружены';retry.hidden=false;}
 }
 retry.addEventListener('click',load);
 form.addEventListener('change',()=>{resetDownload();status.textContent='Состав пакета обновлён.';draw();});
 form.addEventListener('submit',async event=>{event.preventDefault();if(busy||!ready||submit.disabled)return;const payload=selected();busy=true;resetDownload();draw();status.textContent='Готовим пакет. Это может занять до минуты…';
  try{const r=await fetch('/api/contractor-kit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(65000)});if(!r.ok){let message='Не удалось собрать пакет. Попробуйте ещё раз.';try{message=(await r.json()).error||message;}catch{}throw Error(message);}downloadURL=URL.createObjectURL(await r.blob());again.href=downloadURL;again.download='ФАСАД_PRO_пакет_подрядчика.zip';again.hidden=false;again.click();status.textContent='Пакет готов. Если загрузка не началась, нажмите «Скачать ещё раз».';}
  catch(error){status.textContent=error.name==='TimeoutError'?'Подготовка заняла слишком много времени. Выберите меньше объектов и повторите.':error.message;}
  finally{busy=false;draw();status.focus({preventScroll:true});}
 });
 addEventListener('pagehide',resetDownload);void load();
})();
