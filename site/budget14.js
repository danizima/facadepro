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
 const formatter=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}),volumeFormatter=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:6}),validArea=area=>Number.isFinite(area)&&area>=1&&area<=1000000;
 for(const form of forms){
  const section=form.closest('.budget-section'),pick=s=>section.querySelector(s),el=n=>form.elements.namedItem(n),button=pick('.budget-submit'),message=pick('.budget-message'),title=pick('[data-budget-title]'),value=pick('[data-budget-value]'),note=pick('[data-budget-note]'),link=pick('[data-budget-quote]'),summary=pick('[data-budget-summary]'),share=pick('[data-budget-share]'),shareOutput=pick('[data-budget-share-output]'),shareLink=pick('[data-budget-share-link]'),shareStatus=pick('[data-budget-share-status]');let config=null,active=null,sequence=0,restored=false,userEdited=false;
  if(query.get('budget')==='1'){
   const service=query.get('service'),scope=query.get('scope'),area=Number(query.get('area'));
   if(Object.hasOwn(services,service)){el('service').value=service;restored=true;}
   if(Object.hasOwn(scopes,scope)){[...form.querySelectorAll('[name=scope]')].forEach(input=>input.checked=input.value===scope);restored=true;}
   if(validArea(area)){el('area').value=String(area);restored=true;}
  }
  function inputs(){const fd=new FormData(form);return {service:fd.get('service'),scope:fd.get('scope'),area:Number(fd.get('area')),region:fd.get('region'),height:fd.get('height')};}
  function factorLabel(kind,id){const list=config?.[kind]||[];return list.find(row=>row.id===id)?.label||'';}
  function updateLink(){const p=inputs(),params=new URLSearchParams({budget:'1'});if(Object.hasOwn(services,p.service))params.set('service',p.service);if(Object.hasOwn(scopes,p.scope))params.set('scope',p.scope);if(validArea(p.area))params.set('area',p.area);const region=factorLabel('regions',p.region),height=factorLabel('heights',p.height);if(region)params.set('region',p.region);if(height)params.set('height',p.height);
   const shared=new URL('budget.html',location.href);shared.search=params.toString();shareLink.value=shared.href;share.disabled=!validArea(p.area);
   if(region)params.set('regionLabel',region);if(height)params.set('heightLabel',height);link.href='quote.html?'+params;return p;
  }
  function showSummary(p){summary.replaceChildren();const rows=[['Работы',services[p.service]],['Состав',scopes[p.scope]],['Объём',validArea(p.area)?volumeFormatter.format(p.area)+' м²':''],['Регион',factorLabel('regions',p.region)],['Высота',factorLabel('heights',p.height)]];for(const [k,v] of rows){if(!v)continue;const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=v;row.append(dt,dd);summary.append(row);}summary.hidden=false;}
  function resetButton(){button.disabled=!!active;button.textContent=active?'Считаем…':config?.configured?'Рассчитать бюджет ↗':'Подготовить запрос КП ↗';}
  function clearValue(){value.hidden=true;value.textContent='';}
  function unavailable(p){title.textContent='Оставьте объём — менеджер подготовит расчёт';value.hidden=true;note.textContent='Передайте параметры объекта и проект. Менеджер уточнит состав работ и подготовит КП.';showSummary(p);}
  function options(name,rows){const select=el(name);select.replaceChildren();if(Array.isArray(rows)&&rows.length){for(const row of rows){const option=document.createElement('option');option.value=row.id;option.textContent=row.label;select.append(option);}}else{const option=document.createElement('option');option.value='';option.textContent='Уточнить в заявке';select.append(option);select.required=false;}}
  form.addEventListener('input',()=>{userEdited=true;sequence++;active?.abort();active=null;resetButton();const p=updateLink();clearValue();showSummary(p);title.textContent='Параметры изменены';note.textContent=config?.configured?'Рассчитайте бюджет для выбранных условий.':'Оставьте объём — менеджер подготовит расчёт';message.textContent='';message.classList.remove('is-error');shareOutput.hidden=true;shareStatus.textContent='';});
  share.addEventListener('click',async()=>{updateLink();if(share.disabled)return;const url=shareLink.value;shareOutput.hidden=false;shareStatus.textContent='Ссылка содержит только параметры объекта. Бюджет рассчитывается заново.';
   try{if(!navigator.clipboard?.writeText)throw Error('clipboard unavailable');await navigator.clipboard.writeText(url);if(!shareOutput.hidden&&shareLink.value===url)shareStatus.textContent='Ссылка скопирована. Бюджет рассчитывается заново по актуальным условиям.';}
   catch{if(!shareOutput.hidden&&shareLink.value===url){shareLink.focus({preventScroll:true});shareLink.select();shareStatus.textContent='Скопируйте ссылку. Она содержит только параметры объекта.';}}
  });
  shareLink.addEventListener('click',()=>shareLink.select());
  form.addEventListener('submit',async event=>{event.preventDefault();if(active||!form.reportValidity())return;const p=updateLink(),version=++sequence;message.classList.remove('is-error');message.textContent='';clearValue();showSummary(p);
   if(!config?.configured||!p.region||!p.height){unavailable(p);link.focus({preventScroll:true});return;}
   const controller=new AbortController();active=controller;resetButton();title.textContent='Рассчитываем бюджет…';note.textContent='Проверяем выбранные параметры по актуальным условиям.';
   try{const r=await fetch('/api/budget/estimate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p),credentials:'omit',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])}),d=await r.json();if(!r.ok)throw Error(d.error||'Не удалось рассчитать бюджет.');if(version!==sequence||active!==controller)return;
    if(d.available&&Number.isFinite(d.min)&&Number.isFinite(d.max)&&d.min>0&&d.max>=d.min){title.textContent='Ориентир для вашего объекта';value.textContent=formatter.format(d.min)+' — '+formatter.format(d.max)+' ₽';value.hidden=false;note.textContent='Предварительный диапазон по выбранным условиям. Точный состав, стоимость и сроки закрепим в КП после изучения проекта.';showSummary(p);}else unavailable(p);
   }catch(error){if(version!==sequence||active!==controller)return;unavailable(p);message.textContent='Сейчас расчёт недоступен. Параметры можно передать менеджеру.';message.classList.add('is-error');}
   finally{if(active===controller){active=null;resetButton();}}
  });
  configPromise.then(d=>{config=d;options('region',d.regions);options('height',d.heights);if(query.get('budget')==='1'&&!userEdited){for(const [name,kind] of [['region','regions'],['height','heights']]){const id=query.get(name);if(d[kind]?.some(row=>row.id===id)){el(name).value=id;restored=true;}}}resetButton();
   if(!userEdited&&d.configured){title.textContent='Бюджет вашего проекта';note.textContent='Укажите объём и нажмите «Рассчитать бюджет».';}const p=updateLink();if(restored||userEdited)showSummary(p);if(restored&&!userEdited)message.textContent='Параметры из ссылки загружены. Проверьте условия и рассчитайте бюджет заново.';
  }).catch(()=>{options('region',[]);options('height',[]);resetButton();message.textContent='Условия уточним при подготовке предложения.';const p=updateLink();if(restored||userEdited)showSummary(p);});
 }
})();
