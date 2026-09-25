(() => {
 'use strict';
 const dialog=document.querySelector('#contact-dialog');let opener=null;
 if(dialog&&typeof dialog.showModal==='function'){
  document.querySelectorAll('[data-contact-open]').forEach(link=>link.addEventListener('click',event=>{
   if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
   event.preventDefault();opener=link;
   const toggle=document.querySelector('.menu-toggle');if(toggle?.getAttribute('aria-expanded')==='true')toggle.click();
   dialog.showModal();document.body.classList.add('contact-open');dialog.querySelector('[data-contact-close]').focus();
  }));
  dialog.querySelector('[data-contact-close]').onclick=()=>dialog.close();
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
  dialog.addEventListener('close',()=>{document.body.classList.remove('contact-open');if(opener?.getClientRects().length)opener.focus();else document.querySelector('.menu-toggle')?.focus();});
 }
 const data=document.querySelector('#period-data');
 if(data){
  const rows=JSON.parse(data.textContent),selects=[...document.querySelectorAll('[data-period-select]')];
  const draw=select=>{const row=rows[Number(select.value)],panel=select.closest('.period-panel');if(!row)return;const image=panel.querySelector('img');image.src=row.image;image.alt=row.caption;panel.querySelector('[data-period-name]').textContent=row.period;panel.querySelector('[data-period-caption]').textContent=row.caption;panel.querySelector('[data-period-date]').textContent=row.date;panel.querySelector('[data-period-credit]').textContent=row.credit;};
  selects.forEach(select=>select.addEventListener('change',()=>draw(select)));
  document.querySelector('[data-period-swap]').onclick=()=>{[selects[0].value,selects[1].value]=[selects[1].value,selects[0].value];selects.forEach(draw);};
 }
 const credits=document.querySelector('#gallery-credits'),stage=document.querySelector('.gallery-stage>img');
 if(credits&&stage){const values=JSON.parse(credits.textContent),label=document.querySelector('[data-gallery-credit]');const draw=()=>{const key=stage.src.split('/').pop().replace(/\.webp$/,'');label.textContent=values[key]?'Фото: '+values[key]:'';label.hidden=!label.textContent;};new MutationObserver(draw).observe(stage,{attributes:true,attributeFilter:['src']});draw();}
})();
