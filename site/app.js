'use strict';
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
const menuButton=$('.menu-toggle');
const navigation=$('.navigation');
function closeMenu(){navigation.classList.remove('open');menuButton.setAttribute('aria-expanded','false');menuButton.setAttribute('aria-label','Открыть меню');document.body.classList.remove('menu-open');for(const el of document.querySelectorAll('main,.site-footer,.consent-banner,.mobile-actions'))el.inert=false;}
menuButton.addEventListener('click',()=>{const open=menuButton.getAttribute('aria-expanded')!=='true';menuButton.setAttribute('aria-expanded',String(open));menuButton.setAttribute('aria-label',open?'Закрыть меню':'Открыть меню');navigation.classList.toggle('open',open);document.body.classList.toggle('menu-open',open);for(const el of document.querySelectorAll('main,.site-footer,.consent-banner,.mobile-actions'))el.inert=open;if(open)navigation.querySelector('.nav-primary a')?.focus({preventScroll:true});});
$$('a',navigation).forEach(a=>a.addEventListener('click',closeMenu));
matchMedia('(min-width:1101px)').addEventListener('change',event=>{if(event.matches)closeMenu();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&navigation.classList.contains('open')){closeMenu();menuButton.focus();}});
document.addEventListener('keydown',event=>{if(event.key!=='Tab'||!navigation.classList.contains('open'))return;const items=$$('a,button',$('.header')).filter(el=>el.getClientRects().length&&!el.disabled);const first=items[0],last=items[items.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}});
document.addEventListener('pointerdown',event=>{if(navigation.classList.contains('open')&&!event.target.closest('.header'))closeMenu();});
// Portfolio filters are reflected in the URL, so a selection can be shared.
if($('#project-search')){
 const search=$('#project-search'),cards=$$('.catalog-grid .project-card'),filters=$$('[data-filter]');
 const params=new URLSearchParams(window.facadeQuery??location.search);
 const service=$('#catalog-service'),city=$('#catalog-city');
 for(const [select,name] of [[service,'service'],[city,'city']])if(select&&[...select.options].some(o=>o.value===params.get(name)))select.value=params.get(name);
 let category=filters.some(b=>b.dataset.filter===params.get('type'))?params.get('type'):'all';
 search.value=params.get('q')||'';
 const normalize=s=>s.toLocaleLowerCase('ru').replaceAll('ё','е').trim();
 function filter(updateURL=true){
  const query=normalize(search.value);let count=0;
  cards.forEach(card=>{const show=(category==='all'||card.dataset.category===category)&&normalize(card.dataset.search).includes(query)&&(!service?.value||(card.dataset.services||'').split(' ').includes(service.value))&&(!city?.value||card.dataset.city===city.value);card.hidden=!show;if(show){card.dataset.slot=String(count%4);count++;}});
  filters.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===category)));
  $('#results-count').textContent=`Показано проектов: ${count} из ${cards.length}`;
  $('#empty-results').hidden=count>0;$('#reset-filters').hidden=category==='all'&&!query&&!service?.value&&!city?.value;
  if(updateURL){const next=new URLSearchParams(window.facadeQuery??location.search);for(const key of ['type','q','service','city'])next.delete(key);if(service?.value)next.set('service',service.value);if(city?.value)next.set('city',city.value);if(category!=='all')next.set('type',category);if(search.value.trim())next.set('q',search.value.trim());try{if(window.facadeUpdateSearch)window.facadeUpdateSearch(next.toString());else history.replaceState(null,'',location.pathname+(next.size?'?'+next:'')+location.hash);}catch{/* Local previews may not expose a writable URL. */}}
 }
 filters.forEach(b=>b.addEventListener('click',()=>{category=b.dataset.filter;filter();}));
 search.addEventListener('input',()=>filter());
 service?.addEventListener('change',()=>filter());city?.addEventListener('change',()=>filter());
 const reset=()=>{category='all';search.value='';if(service)service.value='';if(city)city.value='';filter();search.focus();};
 $('#reset-filters').addEventListener('click',reset);$('[data-reset-filters]').addEventListener('click',reset);filter(false);
}
// Project photography: thumbnails and a keyboard-accessible native dialog.
if($('.project-gallery[data-gallery]')){
 const gallery=$('.project-gallery[data-gallery]'),keys=JSON.parse(gallery.dataset.gallery),dialog=$('.lightbox');
 const stage=$('.gallery-stage>img'),large=$('.lightbox-image'),thumbs=$$('[data-image]');let index=0,opener=$('.gallery-zoom');
 const asset=key=>window.facadeAsset?window.facadeAsset(key):document.body.dataset.base+(key.startsWith('media/')?key:'assets/'+key+'.webp');
 function display(next){index=(next+keys.length)%keys.length;stage.removeAttribute('srcset');stage.removeAttribute('sizes');stage.src=asset(keys[index]);large.src=stage.src;stage.alt=large.alt=gallery.dataset.title+`. Фотография ${index+1}`;$('.gallery-position').textContent=$('.lightbox-counter').textContent=`${index+1} / ${keys.length}`;thumbs.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));}
 thumbs.forEach(b=>b.addEventListener('click',()=>display(Number(b.dataset.image))));
 $$('[data-gallery-step]').forEach(b=>{b.hidden=keys.length<2;b.addEventListener('click',()=>display(index+Number(b.dataset.galleryStep)));});
 function openPhoto(next,trigger){opener=trigger;closeMenu();display(next);dialog.showModal();document.body.classList.add('modal-open');}
 $('.gallery-zoom').addEventListener('click',event=>openPhoto(index,event.currentTarget));
 $$('[data-gallery-open]').forEach(button=>button.addEventListener('click',()=>openPhoto(Number(button.dataset.galleryOpen),button)));
 const stageBox=$('.gallery-stage');stageBox.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();display(event.key==='Home'?0:event.key==='End'?keys.length-1:index+(event.key==='ArrowRight'?1:-1));});
 function swipe(element){let start=null;element.addEventListener('pointerdown',event=>{if(event.button!==0||event.target.closest('button'))return;start={x:event.clientX,y:event.clientY,time:performance.now(),id:event.pointerId};element.setPointerCapture(event.pointerId);});element.addEventListener('pointerup',event=>{if(!start||start.id!==event.pointerId)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.4&&performance.now()-start.time<1200)display(index+(dx<0?1:-1));start=null;});element.addEventListener('pointercancel',()=>start=null);element.addEventListener('dragstart',event=>event.preventDefault());}
 swipe(stageBox);swipe(large);
 $('.lightbox-close').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>{document.body.classList.remove('modal-open');opener?.focus({preventScroll:true});});
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
 dialog.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();display(index+(event.key==='ArrowLeft'?-1:1));}});
}
async function copyText(text,output,fallback){
 try{if(!navigator.clipboard)throw new Error('Clipboard unavailable');await navigator.clipboard.writeText(text);output.textContent='Скопировано.';}
 catch{if(fallback){fallback.focus();fallback.select();output.textContent='Выделили текст. Скопируйте его сочетанием Ctrl+C или через меню браузера.';}else{output.textContent=text+' — выделите и скопируйте текст.';}}
}
$('[data-copy-legal]')?.addEventListener('click',()=>copyText($('.legal-section .fact-list').innerText,$('.copy-status')));
