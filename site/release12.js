(() => {
 'use strict';
 document.querySelectorAll('.service-guide').forEach(guide=>{
  const steps=[...guide.querySelectorAll('[data-guide-step]')],diagram=guide.querySelector('.guide-diagram');
  steps.forEach(step=>step.addEventListener('toggle',()=>{if(!step.open)return;diagram.dataset.guideActive=step.dataset.guideStep;for(const other of steps)if(other!==step)other.open=false;}));
 });
 document.querySelectorAll('[data-project-pdf]').forEach(button=>button.addEventListener('click',async()=>{
  const status=button.parentElement.querySelector('.project-pdf-status');button.disabled=true;status.textContent='Готовим карточку проекта…';
  try{
   const response=await fetch('/api/portfolio',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projects:[button.dataset.projectPdf]}),signal:AbortSignal.timeout(65000)});
   if(!response.ok){let data;try{data=await response.json();}catch{}throw Error(data?.error||'Не удалось подготовить PDF. Повторите попытку.');}
   if(!response.headers.get('content-type')?.includes('application/pdf'))throw Error('Получен неожиданный ответ. Повторите попытку.');
   const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=url;a.download='ФАСАД_PRO_'+button.dataset.projectPdf+'.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);status.textContent='Карточка готова. Загрузка началась.';
  }catch(error){status.textContent=error.name==='TimeoutError'?'Подготовка заняла слишком много времени. Попробуйте ещё раз.':error.message;}
  finally{button.disabled=false;}
 }));
 // Only one film plays at a time; native controls retain keyboard/fullscreen support.
 const videos=[...document.querySelectorAll('video')];videos.forEach(video=>video.addEventListener('play',()=>videos.forEach(other=>{if(other!==video)other.pause();})));
 if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(!entry.isIntersecting)entry.target.pause();}),{threshold:0});videos.forEach(video=>observer.observe(video));}
 document.addEventListener('visibilitychange',()=>{if(document.hidden)videos.forEach(video=>video.pause());});
 // Center the active thumbnail for arrow, swipe and thumbnail navigation alike.
 const thumbs=document.querySelector('.gallery-thumbs');
 if(thumbs){const sync=()=>{const active=thumbs.querySelector('[aria-pressed="true"]');if(active&&thumbs.scrollWidth>thumbs.clientWidth)thumbs.scrollTo({left:thumbs.scrollLeft+active.getBoundingClientRect().left-thumbs.getBoundingClientRect().left-(thumbs.clientWidth-active.offsetWidth)/2,behavior:'instant'});};new MutationObserver(sync).observe(thumbs,{subtree:true,attributes:true,attributeFilter:['aria-pressed']});}
})();
