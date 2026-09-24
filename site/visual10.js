(() => {
 'use strict';
 const mobile=matchMedia('(max-width:800px)'),filters=document.querySelector('.catalog-more');
 if(filters){
  let expanded=false;
  const hasSelection=()=>[...filters.querySelectorAll('select')].some(s=>s.value);
  const sync=()=>{filters.open=!mobile.matches||expanded||hasSelection();};
  filters.addEventListener('toggle',()=>{if(mobile.matches)expanded=filters.open;});
  document.querySelector('#reset-filters')?.addEventListener('click',()=>{expanded=false;sync();});
  document.querySelector('[data-reset-filters]')?.addEventListener('click',()=>{expanded=false;sync();});
  filters.querySelectorAll('select').forEach(s=>s.addEventListener('change',()=>{const summary=filters.querySelector('summary');const total=[...filters.querySelectorAll('select')].filter(x=>x.value).length;summary.firstChild.textContent='Направление и город'+(total?' · '+total:'')+' ';}));
  mobile.addEventListener('change',sync);sync();
 }
 const stage=document.querySelector('.architecture-stage');
 if(stage){
  let gesture=null,suppressClick=false;
  stage.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse')return;gesture={x:event.clientX,y:event.clientY,id:event.pointerId};suppressClick=false;});
  stage.addEventListener('pointerup',event=>{if(!gesture||gesture.id!==event.pointerId)return;const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5){suppressClick=true;document.querySelector(dx<0?'[data-hero-next]':'[data-hero-prev]')?.click();setTimeout(()=>suppressClick=false,400);}gesture=null;});
  stage.addEventListener('pointercancel',()=>gesture=null);
  stage.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopImmediatePropagation();suppressClick=false;}},true);
 }
 // Keep the active photo's thumbnail visible without moving the page vertically.
 document.querySelectorAll('.gallery-thumb').forEach(button=>button.addEventListener('click',()=>{
  const list=button.parentElement;if(list.scrollWidth>list.clientWidth)list.scrollTo({left:button.offsetLeft-list.offsetLeft-(list.clientWidth-button.offsetWidth)/2,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
 }));
 const nav=document.querySelector('.case-page-nav,.museum-nav');
 if(nav){
  const anchors=[...nav.querySelectorAll('a[href^="#"]')],sections=anchors.map(a=>document.getElementById(a.hash.slice(1))).filter(Boolean);
  if(sections.length&&'IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>{const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top);if(!visible.length)return;for(const a of anchors)if(a.hash==='#'+visible[0].target.id)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');},{rootMargin:'-90px 0px -45% 0px',threshold:0});sections.forEach(s=>observer.observe(s));}
 }
})();
