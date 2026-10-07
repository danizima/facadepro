(() => {
 'use strict';
 const tabs=[...document.querySelectorAll('[data-audience]')],panels=[...document.querySelectorAll('[data-audience-panel]')];
 function audience(index,focus=false){
  tabs.forEach((b,i)=>{b.setAttribute('aria-selected',String(i===index));b.tabIndex=i===index?0:-1;});
  panels.forEach(p=>p.hidden=p.dataset.audiencePanel!==tabs[index].dataset.audience);
  if(focus)tabs[index].focus();
 }
 tabs.forEach((b,i)=>{
  b.addEventListener('click',()=>audience(i));
  b.addEventListener('keydown',event=>{const key=event.key;let n;if(key==='Home')n=0;else if(key==='End')n=tabs.length-1;else if(key==='ArrowRight')n=(i+1)%tabs.length;else if(key==='ArrowLeft')n=(i+tabs.length-1)%tabs.length;else return;event.preventDefault();audience(n,true);});
 });
 if(tabs.length)audience(0);
 document.querySelectorAll('.detail-explorer').forEach(root=>{
  root.querySelectorAll('[data-detail-pin]').forEach(pin=>pin.addEventListener('click',event=>{
   event.preventDefault();
   root.querySelectorAll('[data-detail-pin]').forEach(p=>p.setAttribute('aria-current',String(p===pin)));
   root.querySelectorAll('.detail-note').forEach(n=>n.classList.toggle('is-active',n.id===pin.dataset.detailPin));
   const note=document.getElementById(pin.dataset.detailPin);note?.focus({preventScroll:true});
   if(innerWidth<901)note?.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  }));
 });
 const params=new URLSearchParams(window.facadeQuery??location.search),form=document.querySelector('#request-form');
 const labels={contractor:'Генподрядчик',developer:'Девелопер',owner:'Собственник здания'};
 if(form){
  let token='',state='ready',operation=0;
  const field=(name,value)=>{form.querySelectorAll('input[name="'+name+'"]').forEach(input=>input.remove());if(!value)return;const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.append(input);};
  function writeURL(name,value){const url=new URL(location.href);if(value)url.searchParams.set(name,value);else url.searchParams.delete(name);try{if(window.facadeUpdateSearch)window.facadeUpdateSearch(url.searchParams.toString());else history.replaceState(null,'',url);}catch{}}
  const notify=()=>form.dispatchEvent(new Event('change',{bubbles:true}));
  function drawAudience(value){form.querySelectorAll('.audience-context').forEach(note=>note.remove());const valid=Object.hasOwn(labels,value)?value:'';field('audience',valid);writeURL('audience',valid);if(valid){const note=document.createElement('p');note.className='audience-context';note.textContent='Ваш сценарий: '+labels[valid]+'. Расскажите о задаче ниже.';form.prepend(note);}}
  function drawSelection(message,selection=null,retry=false){form.querySelectorAll('.selection-context').forEach(box=>box.remove());if(!token&&!message)return;const box=document.createElement('div');box.className='selection-context';box.setAttribute('aria-label','Подборка для обращения');const note=document.createElement('p');note.setAttribute('role','status');note.textContent=message;box.append(note);if(selection){const a=document.createElement('a');a.href='/selection/'+token;a.textContent='Посмотреть подборку';box.append(a);}if(retry){const button=document.createElement('button');button.type='button';button.className='text-button';button.dataset.selectionContextRetry='';button.textContent='Повторить проверку';button.addEventListener('click',()=>{void applySelection(token);});box.append(button);}if(token){const remove=document.createElement('button');remove.type='button';remove.className='text-button';remove.dataset.selectionContextRemove='';remove.textContent='Убрать привязку к подборке ×';remove.addEventListener('click',()=>{operation++;token='';state='ready';field('selection','');writeURL('selection','');drawSelection('');notify();form.querySelector('input[name=service]')?.focus();});box.append(remove);}form.prepend(box);}
  async function applySelection(raw){const version=++operation;token=typeof raw==='string'&&/^[a-f0-9]{48}$/.test(raw)?raw:'';field('selection',token);if(!token){state='ready';writeURL('selection','');drawSelection('');return;}state='pending';drawSelection('Проверяем выбранную подборку…');writeURL('selection','');try{const r=await fetch('/api/selection/'+token,{credentials:'omit',signal:AbortSignal.timeout(12000)});if(version!==operation)return;if(r.status===404||r.status===410){token='';state='ready';field('selection','');writeURL('selection','');drawSelection('Подборка больше недоступна. Обращение сохранено без привязки к ней.');notify();return;}if(!r.ok)throw Error();const selection=await r.json();if(version!==operation)return;if(typeof selection.title!=='string'||!Array.isArray(selection.projects))throw Error();state='ready';writeURL('selection',token);drawSelection('Обращение по подборке «'+selection.title+'».',selection);notify();}catch{if(version!==operation)return;state='failed';drawSelection('Не удалось проверить подборку. Повторите проверку или уберите привязку, чтобы продолжить.',null,true);}}
  form.facadeSecondaryContext={restore:values=>{drawAudience(values.audience);void applySelection(values.selection);},blocked:()=>state!=='ready'};
  drawAudience(params.get('audience')||'');if(params.has('selection'))void applySelection(params.get('selection'));
 }

 const pdf=document.querySelector('[data-selection-pdf]');
 if(pdf)pdf.addEventListener('click',async()=>{
  const status=document.querySelector('.selection-status');pdf.disabled=true;status.textContent='Готовим PDF…';
  try{const r=await fetch(location.pathname+'/pdf',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(65000)});if(!r.ok)throw Error((await r.json()).error||'Не удалось собрать PDF.');const url=URL.createObjectURL(await r.blob()),a=document.createElement('a');a.href=url;a.download='ФАСАД_PRO_подборка.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);status.textContent='PDF готов.';}catch(err){status.textContent=err.message;}finally{pdf.disabled=false;}
 });
})();
