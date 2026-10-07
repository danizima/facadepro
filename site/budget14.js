'use strict';
(()=>{
 const services={glazing:'Фасадное остекление',windows:'Оконные системы',repair:'Ремонт и восстановление'},scopes={installation:'Только монтаж','supply-installation':'Поставка и монтаж'};
 const query=new URLSearchParams(window.facadeQuery??location.search);
 // Only object parameters are carried into a quote. Prices in a URL are ignored.
 const quote=document.querySelector('#request-form');
 if(quote&&query.get('budget')==='1'){
  const field=name=>quote.elements.namedItem(name),area=Number(query.get('area'));
  if(Number.isFinite(area)&&area>=1&&area<=10000000&&field('area'))field('area').value=String(area);
  const region=(query.get('regionLabel')||'').slice(0,120),height=(query.get('heightLabel')||'').slice(0,80);
  if(region&&field('city'))field('city').value=region;
  if(height&&field('height')){const el=field('height');if(el.tagName==='SELECT'){const option=[...el.options].find(o=>o.value===height||o.textContent===height);if(option)el.value=option.value;}else el.value=height;}
  const lines=['Параметры из предварительного расчёта:',height?'Высота работ: '+height:''].filter(Boolean);
  if(field('comment'))field('comment').value=lines.join('\n')+'\n'+field('comment').value;
  const notice=document.createElement('div');notice.className='budget-context';const title=document.createElement('strong'),note=document.createElement('p');title.textContent='Параметры объекта уже перенесены';note.textContent='Проверьте объём, состав работ и регион. Менеджер подготовит точное КП по проекту.';notice.append(title,note);quote.prepend(notice);
 }
 const forms=[...document.querySelectorAll('[data-budget-form]')];if(!forms.length)return;
 const configPromise=fetch('/api/budget/config',{credentials:'omit',signal:AbortSignal.timeout(15000)}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||'Не удалось загрузить настройки.');return d;});
 const formatter=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0});
 for(const form of forms){
  const section=form.closest('.budget-section'),pick=s=>section.querySelector(s),el=n=>form.elements.namedItem(n),button=pick('.budget-submit'),message=pick('.budget-message'),title=pick('[data-budget-title]'),value=pick('[data-budget-value]'),note=pick('[data-budget-note]'),link=pick('[data-budget-quote]'),summary=pick('[data-budget-summary]');let config=null,busy=false,sequence=0;
  function inputs(){const fd=new FormData(form);return {service:fd.get('service'),scope:fd.get('scope'),area:Number(fd.get('area')),region:fd.get('region'),height:fd.get('height')};}
  function factorLabel(kind,id){const list=config?.[kind]||[];return list.find(row=>row.id===id)?.label||'';}
  function updateLink(){const p=inputs(),params=new URLSearchParams({budget:'1',service:p.service,scope:p.scope});if(Number.isFinite(p.area)&&p.area>=1&&p.area<=10000000)params.set('area',p.area);const region=factorLabel('regions',p.region),height=factorLabel('heights',p.height);if(region){params.set('region',p.region);params.set('regionLabel',region);}if(height){params.set('height',p.height);params.set('heightLabel',height);}link.href='quote.html?'+params;return p;}
  function showSummary(p){summary.replaceChildren();const rows=[['Работы',services[p.service]],['Состав',scopes[p.scope]],['Объём',Number.isFinite(p.area)&&p.area>0?formatter.format(p.area)+' м²':''],['Регион',factorLabel('regions',p.region)],['Высота',factorLabel('heights',p.height)]];for(const [k,v] of rows){if(!v)continue;const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=v;row.append(dt,dd);summary.append(row);}summary.hidden=false;}
  function unavailable(p){title.textContent='Оставьте объём — менеджер подготовит расчёт';value.hidden=true;note.textContent='Передайте параметры объекта и проект. Менеджер уточнит состав работ и подготовит КП.';showSummary(p);}
  function options(name,rows){const select=el(name);select.replaceChildren();if(Array.isArray(rows)&&rows.length){for(const row of rows){const option=document.createElement('option');option.value=row.id;option.textContent=row.label;select.append(option);}}else{const option=document.createElement('option');option.value='';option.textContent='Уточнить в заявке';select.append(option);select.required=false;}}
  form.addEventListener('input',()=>{sequence++;updateLink();value.hidden=true;title.textContent='Параметры изменены';note.textContent=config?.configured?'Рассчитайте бюджет для выбранных условий.':'Оставьте объём — менеджер подготовит расчёт';message.textContent='';message.classList.remove('is-error');});
  form.addEventListener('submit',async event=>{event.preventDefault();if(busy||!form.reportValidity())return;const p=updateLink(),version=++sequence;message.classList.remove('is-error');message.textContent='';
   if(!config?.configured||!p.region||!p.height){unavailable(p);link.focus({preventScroll:true});return;}
   busy=true;button.disabled=true;button.textContent='Считаем…';
   try{const r=await fetch('/api/budget/estimate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p),credentials:'omit',signal:AbortSignal.timeout(15000)}),d=await r.json();if(!r.ok)throw Error(d.error||'Не удалось рассчитать бюджет.');if(version!==sequence)return;
    if(d.available&&Number.isFinite(d.min)&&Number.isFinite(d.max)&&d.min>0&&d.max>=d.min){title.textContent='Ориентир для вашего объекта';value.textContent=formatter.format(d.min)+' — '+formatter.format(d.max)+' ₽';value.hidden=false;note.textContent='Предварительный диапазон по выбранным условиям. Точный состав, стоимость и сроки закрепим в КП после изучения проекта.';showSummary(p);}else unavailable(p);
   }catch(error){if(version!==sequence)return;unavailable(p);message.textContent='Сейчас расчёт недоступен. Параметры можно передать менеджеру.';message.classList.add('is-error');}
   finally{busy=false;button.disabled=false;button.textContent=config?.configured?'Рассчитать бюджет ↗':'Подготовить запрос КП ↗';}
  });
  configPromise.then(d=>{config=d;options('region',d.regions);options('height',d.heights);button.textContent=d.configured?'Рассчитать бюджет ↗':'Подготовить запрос КП ↗';if(d.configured){title.textContent='Бюджет вашего проекта';note.textContent='Укажите объём и нажмите «Рассчитать бюджет».';}updateLink();}).catch(()=>{options('region',[]);options('height',[]);button.textContent='Подготовить запрос КП ↗';message.textContent='Условия уточним при подготовке предложения.';updateLink();});
 }
})();
