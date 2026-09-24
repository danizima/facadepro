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
 const params=new URLSearchParams(location.search),form=document.querySelector('#request-form');
 const labels={contractor:'Генподрядчик',developer:'Девелопер',owner:'Собственник здания'};
 if(form&&labels[params.get('audience')]){
  const input=document.createElement('input');input.type='hidden';input.name='audience';input.value=params.get('audience');form.append(input);
  const note=document.createElement('p');note.className='audience-context';note.textContent='Ваш сценарий: '+labels[input.value]+'. Расскажите о задаче ниже.';form.prepend(note);
 }
 const token=params.get('selection');
 if(form&&/^[a-f0-9]{48}$/.test(token||'')){
  fetch('/api/selection/'+token,{credentials:'omit'}).then(async r=>{if(!r.ok)return;const s=await r.json(),input=document.createElement('input');input.type='hidden';input.name='selection';input.value=token;form.append(input);const box=document.createElement('p');box.className='selection-context';box.textContent='Обращение по подборке «'+s.title+'». ';const a=document.createElement('a');a.href='/selection/'+token;a.textContent='Посмотреть подборку';box.append(a);form.prepend(box);}).catch(()=>{});
 }
 const pdf=document.querySelector('[data-selection-pdf]');
 if(pdf)pdf.addEventListener('click',async()=>{
  const status=document.querySelector('.selection-status');pdf.disabled=true;status.textContent='Готовим PDF…';
  try{const r=await fetch(location.pathname+'/pdf',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(65000)});if(!r.ok)throw Error((await r.json()).error||'Не удалось собрать PDF.');const url=URL.createObjectURL(await r.blob()),a=document.createElement('a');a.href=url;a.download='ФАСАД_PRO_подборка.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);status.textContent='PDF готов.';}catch(err){status.textContent=err.message;}finally{pdf.disabled=false;}
 });
})();
