'use strict';
(()=>{
 const $=s=>document.querySelector(s),all=s=>[...document.querySelectorAll(s)];
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const asset=key=>window.facadeAsset?.(key)||(!key?'assets/project-summary.svg':key.startsWith('media/')?key:'assets/'+key+'.webp');
 const data=$('#release-data')?JSON.parse($('#release-data').textContent):null;
 const offline=window.facade?.offline;
 const tabs=all('[data-slide]');
 if(tabs.length){let index=0;const show=(n,focus=false)=>{index=(n+tabs.length)%tabs.length;tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;$('#'+tab.getAttribute('aria-controls')).hidden=i!==index;});$('#showcase-count').textContent=String(index+1).padStart(2,'0')+' / '+String(tabs.length).padStart(2,'0');if(focus)tabs[index].focus();};tabs.forEach((tab,i)=>{tab.onclick=()=>show(i);tab.onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();show(event.key==='Home'?0:event.key==='End'?tabs.length-1:index+(event.key==='ArrowRight'?1:-1),true);}};});$('[data-slide-prev]').onclick=()=>show(index-1);$('[data-slide-next]').onclick=()=>show(index+1);}
 if(!data)return;
 const projects=(data.projects||[]).filter(p=>p.published!==false),names=Object.fromEntries((data.services||[]).map(s=>[s.id,s.title]));
 function projectCard(p,request=''){return `<article class="project-card"><a class="project-open" href="projects/${p.id}.html"><span class="project-image"><img src="${asset(p.images[0])}" alt="${esc(p.title)}" loading="lazy" width="1200" height="775"><span class="project-tag">${esc(p.volume)}</span></span><span class="project-meta">${esc(p.type)}</span><h3>${esc(p.title)}</h3><span class="project-description">${esc(p.work)}</span></a>${request?`<a class="text-button solution-project-request" data-solution-project="${esc(p.id)}" href="${esc(request)}">Обсудить похожий объект ↗</a>`:''}</article>`;}
 if($('#project-map')){
  let map=null,layer=null,city='',selected='',filtered=[],tileLayer=null;const groupKey=p=>p.geo?`${p.geo.lat},${p.geo.lng}`:'unmapped';
  if(window.L){map=L.map('project-map',{scrollWheelZoom:false,minZoom:3,maxZoom:17,zoomControl:false}).setView([43.23,131.97],10);layer=L.layerGroup().addTo(map);L.control.zoom({zoomInTitle:'Приблизить',zoomOutTitle:'Отдалить'}).addTo(map);map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');map.attributionControl.addAttribution('Метки по населённым пунктам');}
  const open=id=>{const p=filtered.find(p=>p.id===id);if(!p)return;selected=p.id;all('#map-list button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.id===id)));$('#map-detail').innerHTML=`<img src="${asset(p.images[0])}" alt="${esc(p.title)}" width="1000" height="625"><p class="eyebrow">${esc(p.type)}</p><h2>${esc(p.title)}</h2><p>${esc(p.work)}</p><dl><dt>Место</dt><dd>${esc(p.location)}</dd><dt>Объём</dt><dd>${esc(p.volume)}</dd><dt>Период</dt><dd>${esc(p.period)}</dd>${p.client?'<dt>Заказчик</dt><dd>'+esc(p.client)+'</dd>':''}</dl><div class="map-detail-links"><a class="text-button" href="projects/${p.id}.html">Открыть кейс ↗</a><a class="text-button" href="portfolio.html?projects=${p.id}">В подборку PDF +</a><a class="text-button" href="https://yandex.ru/maps/?text=${encodeURIComponent(p.location)}" target="_blank" rel="noopener">Открыть адрес ↗</a></div>`;if(p.geo&&map)map.panTo([p.geo.lat,p.geo.lng],{animate:!matchMedia('(prefers-reduced-motion: reduce)').matches});};
  function render(){const service=$('#map-service').value,type=$('#map-type').value,q=$('#map-search').value.trim().toLocaleLowerCase('ru');const base=projects.filter(p=>(!service||(p.serviceIds||[]).includes(service))&&(!type||p.type===type)&&(!q||[p.title,p.location,p.work].join(' ').toLocaleLowerCase('ru').includes(q)));const groups=new Map();for(const p of base){const key=groupKey(p);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);}if(city&&!groups.has(city))city='';filtered=base.filter(p=>!city||groupKey(p)===city);
   $('#map-count').textContent=`Показано объектов: ${filtered.length} из ${projects.length}`;$('#map-places').replaceChildren();const addPlace=(label,key)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-pressed',String(city===key));b.onclick=()=>{city=city===key?'':key;render();};$('#map-places').append(b);};addPlace('Все населённые пункты','');
   layer?.clearLayers();for(const [key,ps] of groups){const geo=ps[0].geo,label=geo?.label||'Без отметки на карте';addPlace(`${label} · ${ps.length}`,key||'unmapped');if(map&&geo){const labelNode=document.createElement('span');labelNode.textContent=`${label} · ${ps.length} объектов · ${geo.precision==='exact'?'Адрес':'Город'}`;const marker=L.marker([geo.lat,geo.lng],{title:labelNode.textContent,keyboard:true,icon:L.divIcon({className:'map-city-icon',html:`<span class="map-bubble">${ps.length}</span>`,iconSize:[45,45],iconAnchor:[22,22]})}).addTo(layer);marker.bindTooltip(labelNode,{direction:'top',offset:[0,-20]});marker.on('click',()=>{city=key;render();});}}
   $('#map-list').replaceChildren();for(const p of filtered){const b=document.createElement('button');b.type='button';b.dataset.id=p.id;b.innerHTML=esc(p.title)+'<span>'+esc(p.location)+'</span>';b.onclick=()=>open(p.id);$('#map-list').append(b);}if(filtered.length)open(filtered.some(p=>p.id===selected)?selected:filtered[0].id);else{$('#map-detail').innerHTML='<h2>Объектов не найдено</h2><p>Измените фильтры или сбросьте поиск.</p>';}
  }
  $('#map-service').onchange=()=>{city='';render();};$('#map-type').onchange=()=>{city='';render();};$('#map-search').oninput=()=>{city='';render();};$('#map-reset').onclick=()=>{$('#map-service').value='';$('#map-type').value='';$('#map-search').value='';city='';render();if(map)map.setView([43.23,131.97],10);};
  $('#map-load').onclick=()=>{if(offline){$('#map-message').textContent='Карта улиц доступна на размещённом сайте. В автономной версии работают метки, фильтры и карточки.';return;}if(!map||tileLayer)return;tileLayer=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'}).addTo(map);$('#map-load').hidden=true;$('#map-message').textContent='Загружаем карту OpenStreetMap…';tileLayer.on('load',()=>$('#map-message').textContent='Карта OpenStreetMap. Метки объединяют объекты в одном населённом пункте.');tileLayer.on('tileerror',()=>$('#map-message').textContent='Карта улиц недоступна. Метки, фильтры и карточки продолжают работать.');};render();
 }
 if($('#solution-result')){
  const types=['Жилой комплекс','Гостиница','Общественное здание','Коммерческое здание','Частный объект','Другой объект'];let selected=null,selectedObject='';
  const requestURL=(s,object='',project='')=>'request.html?'+new URLSearchParams({solution:s.id,...(['installation','supply-installation','engineering','supply','height'].includes(s.scope)?{scope:s.scope}:{}),...(types.includes(object)?{object}:{}),...(projects.some(p=>p.id===project)&&s.projects.includes(project)?{project}:{})});
  const query=()=>new URLSearchParams(window.facadeQuery??location.search);
  function writeURL(push=false){
   if(typeof URL==='undefined')return;
   const url=new URL(location.href);url.searchParams.delete('solution');url.searchParams.delete('object');
   if(selected){url.searchParams.set('solution',selected.id);if(selectedObject)url.searchParams.set('object',selectedObject);}
   try{if(window.facadeUpdateSearch)window.facadeUpdateSearch(url.searchParams.toString());else if(url.href!==location.href)window.history[push?'pushState':'replaceState'](null,'',url);}catch{/* A local preview may not allow navigation state. */}
  }
  function moveTo(element,scrollTarget=element){
   if(!element)return;element.focus?.({preventScroll:true});
   if(!scrollTarget.getBoundingClientRect||!window.scrollTo)return;
   const header=$('.header')?.getBoundingClientRect().height||0;
   window.scrollTo({top:Math.max(0,scrollTarget.getBoundingClientRect().top+window.scrollY-header-20),behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  }
  function show(id,focus=false,push=false){
   const s=data.solutions.find(s=>s.id===id);if(!s)return;selected=s;
   all('[data-solution]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.solution===id)));
   const related=s.projects.map(id=>projects.find(p=>p.id===id)).filter(Boolean);
   const directions=s.consultation?'':`<div class="solution-directions">${s.services.map(id=>`<a href="services/${id}.html">${esc(names[id])} ↗</a>`).join('')}</div>`;
   const detail=s.detail===false?'':`<a class="solution-detail-link" href="tasks/${id}.html">Подробнее о задаче ↗</a>`;
   $('#solution-result').hidden=false;
   $('#solution-result').innerHTML=`<div class="solution-result-actions"><button type="button" class="text-button" id="solution-change">← Изменить задачу</button><button type="button" class="text-button" id="solution-share">Поделиться решением ↗</button></div><p id="solution-share-status" role="status" aria-live="polite"></p><a id="solution-share-link" class="solution-share-link" hidden></a><div class="solution-result-grid"><div><p class="eyebrow">${s.consultation?'Уточним направление вместе':'Подход к вашей задаче'}</p><h2 tabindex="-1">${esc(s.title)}</h2><p>${esc(s.text)}</p>${directions}${detail}<label class="solution-object">Тип вашего объекта<select id="solution-object"><option value="">Укажу в заявке</option>${types.map(t=>'<option>'+t+'</option>').join('')}</select></label><a id="solution-request" class="button" href="${esc(requestURL(s,selectedObject))}">${s.consultation?'Обсудить задачу с менеджером':'Обсудить эту задачу'} ↗</a></div><aside class="brief-panel"><p class="eyebrow">К первому разговору</p><h3>Что подготовить</h3><ul>${s.inputs.map(t=>'<li>'+esc(t)+'</li>').join('')}</ul><p>Если части материалов нет, начнём с описания. Точный состав работ определим после изучения объекта.</p></aside></div>${related.length?'<div class="solution-projects"><h3>Опыт по связанным направлениям</h3><p>Примеры работ с подобными системами. Состав вашего проекта обсудим отдельно.</p><div class="project-grid">'+related.map(p=>projectCard(p,requestURL(s,selectedObject,p.id))).join('')+'</div></div>':''}`;
   $('#solution-object').value=selectedObject;
   $('#solution-object').onchange=()=>{selectedObject=types.includes($('#solution-object').value)?$('#solution-object').value:'';$('#solution-request').href=requestURL(s,selectedObject);all('[data-solution-project]').forEach(link=>link.href=requestURL(s,selectedObject,link.dataset.solutionProject));writeURL(true);const status=$('#solution-share-status'),link=$('#solution-share-link');if(status)status.textContent='';if(link)link.hidden=true;};
   const change=$('#solution-change'),share=$('#solution-share');
   if(change)change.onclick=()=>moveTo(all('[data-solution]').find(b=>b.dataset.solution===selected.id));
   if(share)share.onclick=async()=>{
    const url=new URL('https://facadepro.ru/solutions.html');url.searchParams.set('solution',selected.id);if(selectedObject)url.searchParams.set('object',selectedObject);
    const status=$('#solution-share-status'),link=$('#solution-share-link');share.disabled=true;
    try{if(!window.navigator?.clipboard?.writeText)throw Error();await window.navigator.clipboard.writeText(url.href);status.textContent='Ссылка на выбранную задачу скопирована.';link.hidden=true;}
    catch{status.textContent='Скопируйте ссылку на выбранную задачу:';link.href=link.textContent=url.href;link.hidden=false;}
    finally{share.disabled=false;}
   };
   writeURL(push);if(focus)moveTo($('#solution-result h2'),$('#solution-result'));
  }
  function restore(focus=false){
   const q=query(),id=q.get('solution');selectedObject=types.includes(q.get('object'))?q.get('object'):'';
   if(data.solutions.some(s=>s.id===id)){
    show(id);
    if(focus){const reveal=()=>{if(selected?.id===id)moveTo($('#solution-result h2'),$('#solution-result'));};if(window.requestAnimationFrame)window.requestAnimationFrame(reveal);else reveal();}
   }
   else{selected=null;selectedObject='';$('#solution-result').hidden=true;$('#solution-result').replaceChildren?.();all('[data-solution]').forEach(b=>b.setAttribute('aria-pressed','false'));writeURL();}
  }
  all('[data-solution]').forEach(b=>b.onclick=()=>show(b.dataset.solution,true,true));
  window.addEventListener?.('popstate',()=>restore(true));restore(true);
 }
 if($('#portfolio-form')){
  let selected=[],busy=false,pdfUrl='',generation=0,pending=null,shareGeneration=0;
  const query=()=>new URLSearchParams(window.facadeQuery??location.search);
  const readSelection=()=>[...new Set((query().get('projects')||'').split(',').filter(id=>projects.some(p=>p.id===id)))].slice(0,20);
  const selectionURL=()=>{const url=new URL('https://facadepro.ru/portfolio.html');if(selected.length)url.searchParams.set('projects',selected.join(','));return url;};
  function writeURL(push=false){
   if(typeof URL==='undefined')return;
   const url=new URL(location.href);url.searchParams.delete('projects');if(selected.length)url.searchParams.set('projects',selected.join(','));
   try{if(window.facadeUpdateSearch)window.facadeUpdateSearch(url.searchParams.toString());else if(url.href!==location.href)window.history[push?'pushState':'replaceState'](null,'',url);}catch{/* A local preview may not allow navigation state. */}
  }
  function setBusy(value){busy=value;$('#portfolio-build').disabled=busy||!selected.length;}
  function invalidate(){
   generation++;pending?.abort();pending=null;setBusy(false);shareGeneration++;
   if(pdfUrl){URL.revokeObjectURL(pdfUrl);pdfUrl='';}
   $('#portfolio-ready').replaceChildren();$('#portfolio-status').textContent='';
   $('#portfolio-share-status').textContent='';$('#portfolio-share-link').hidden=true;$('#portfolio-share').disabled=!selected.length;
   const preview=$('.portfolio-print-dialog');if(preview){preview.close();preview.remove();}
  }
  function changed(push=true){invalidate();update();writeURL(push);}
  const shown=()=>projects.filter(p=>!$('#portfolio-service').value||(p.serviceIds||[]).includes($('#portfolio-service').value));
  function update(){
   const ps=shown();$('#portfolio-cards').innerHTML=ps.map(p=>`<label class="portfolio-item ${selected.includes(p.id)?'selected':''}"><img src="${asset(p.images[0])}" alt="${esc(p.title)}" width="1000" height="606" loading="lazy"><span class="portfolio-check"><input type="checkbox" value="${esc(p.id)}" ${selected.includes(p.id)?'checked':''} aria-label="Добавить ${esc(p.title)}">В подборку</span><div><h2>${esc(p.title)}</h2><p>${esc(p.volume)} · ${esc(p.location)}</p></div></label>`).join('');
   all('#portfolio-cards input').forEach(input=>input.onchange=()=>{
    if(input.checked){if(selected.length>=20){input.checked=false;$('#portfolio-status').textContent='В одной подборке может быть до 20 объектов.';return;}selected.push(input.value);}
    else selected=selected.filter(id=>id!==input.value);
    const value=input.value;changed();all('#portfolio-cards input').find(el=>el.value===value)?.focus({preventScroll:true});
   });
   $('#portfolio-count').textContent=`Выбрано объектов: ${selected.length}`;setBusy(busy);$('#portfolio-share').disabled=!selected.length;
   $('#portfolio-order').innerHTML=selected.map((id,i)=>{const p=projects.find(p=>p.id===id);return `<li><span>${String(i+1).padStart(2,'0')} / ${esc(p.title)}</span><button type="button" data-move="${i}" data-delta="-1" aria-label="Переместить ${esc(p.title)} выше" ${i===0?'disabled':''}>↑</button><button type="button" data-move="${i}" data-delta="1" aria-label="Переместить ${esc(p.title)} ниже" ${i===selected.length-1?'disabled':''}>↓</button><button type="button" class="remove" data-remove="${esc(id)}" aria-label="Убрать ${esc(p.title)}">×</button></li>`;}).join('');
   all('[data-move]').forEach(button=>button.onclick=()=>{const i=Number(button.dataset.move),j=i+Number(button.dataset.delta);[selected[i],selected[j]]=[selected[j],selected[i]];changed();all('[data-move]').find(el=>Number(el.dataset.move)===j&&el.dataset.delta===button.dataset.delta)?.focus({preventScroll:true});});
   all('[data-remove]').forEach(button=>button.onclick=()=>{selected=selected.filter(id=>id!==button.dataset.remove);changed();});
  }
  $('#portfolio-service').onchange=()=>changed(false);
  $('#portfolio-select').onclick=()=>{selected=[...new Set([...selected,...shown().map(p=>p.id)])].slice(0,20);changed();};
  $('#portfolio-clear').onclick=()=>{selected=[];changed();};
  $('#portfolio-form input[name=recipient]').oninput=invalidate;
  $('#portfolio-share').onclick=async()=>{
   if(!selected.length)return;const url=selectionURL(),version=++shareGeneration,button=$('#portfolio-share'),status=$('#portfolio-share-status'),link=$('#portfolio-share-link');button.disabled=true;
   try{if(!window.navigator?.clipboard?.writeText)throw Error();await window.navigator.clipboard.writeText(url.href);if(version!==shareGeneration)return;status.textContent='Ссылка на подборку скопирована.';link.hidden=true;}
   catch{if(version!==shareGeneration)return;status.textContent='Скопируйте ссылку на подборку:';link.href=link.textContent=url.href;link.hidden=false;}
   finally{if(version===shareGeneration)button.disabled=!selected.length;}
  };
  if(offline)$('#portfolio-build').textContent='Открыть печатную версию ↗';
  $('#portfolio-form').onsubmit=async event=>{
   event.preventDefault();if(busy||!selected.length)return;
   const ids=selected.slice(),recipient=event.target.elements.recipient.value.trim();invalidate();
   if(offline){printPreview(ids.map(id=>projects.find(p=>p.id===id)),recipient);return;}
   const version=generation,controller=new AbortController();pending=controller;let timedOut=false;
   const timer=setTimeout(()=>{timedOut=true;controller.abort();},60000);setBusy(true);$('#portfolio-status').textContent='Собираем PDF с выбранными объектами…';
   try{
    const response=await fetch('/api/portfolio',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projects:ids,recipient}),signal:controller.signal});
    if(version!==generation)return;if(timedOut||controller.signal.aborted)throw Error();
    if(!response.ok){const err=await response.json();throw Error(err.error||'Не удалось создать PDF.');}
    const blob=await response.blob();if(version!==generation)return;if(timedOut||controller.signal.aborted)throw Error();if(!/^application\/pdf(?:;|$)/i.test(blob.type)||!blob.size)throw Error('Сервер вернул неподходящий формат.');
    pdfUrl=URL.createObjectURL(blob);$('#portfolio-ready').replaceChildren();const link=document.createElement('a');link.href=pdfUrl;link.download='Портфолио_ФАСАД_PRO_подборка.pdf';link.textContent='Скачать готовый PDF ещё раз ↓';$('#portfolio-ready').append(link);link.click();$('#portfolio-status').textContent='PDF готов. Файл содержит выбранные объекты в заданном порядке.';window.facade?.track('portfolio_download');
   }catch(err){if(version===generation)$('#portfolio-status').textContent=timedOut?'Подготовка заняла больше времени. Повторите попытку.':err.message;}
   finally{clearTimeout(timer);if(version===generation){pending=null;setBusy(false);}}
  };
  function restore(){selected=readSelection();invalidate();update();writeURL();}
  window.addEventListener?.('popstate',restore);restore();
  function printPreview(ps,recipient){$('.portfolio-print-dialog')?.remove();const d=document.createElement('dialog');d.className='portfolio-print-dialog';d.setAttribute('aria-label','Печатное портфолио');const s=data.settings;d.innerHTML=`<div class="print-toolbar"><p>В окне печати выберите «Сохранить как PDF».</p><button type="button" class="button" id="portfolio-print">Печать / сохранить PDF</button><button type="button" class="text-button" id="portfolio-print-close">Закрыть ×</button></div><div class="print-pages"><section class="print-page print-cover"><p class="print-brand">ФАСАД.PRO</p><p class="eyebrow">Персональное портфолио</p><h1>${esc(s.slogan)}</h1>${recipient?'<p class="print-recipient">'+esc(recipient)+'</p>':''}<img src="${asset(ps[0].images[0])}" alt=""><p>Объектов в подборке: ${ps.length}</p><p>${esc(s.manager)}<br>${esc(s.phone)}<br>${esc(s.email)}</p></section>${ps.map(p=>`<section class="print-page"><p class="print-brand">ФАСАД.PRO</p><p class="eyebrow">${esc(p.type)}</p><h2>${esc(p.title)}</h2><p>${esc(p.location)}</p><img src="${asset(p.images[0])}" alt="${esc(p.title)}"><div class="print-facts"><strong>${esc(p.volume)}</strong><span>${esc(p.period)}</span></div><p>${esc(p.work)}</p>${p.client?'<p class="print-client">Заказчик: '+esc(p.client)+'</p>':''}<p class="print-contact">${esc(s.manager)} · ${esc(s.phone)} · ${esc(s.email)}</p></section>`).join('')}</div>`;document.body.append(d);d.querySelector('#portfolio-print-close').onclick=()=>{d.close();d.remove();};d.querySelector('#portfolio-print').onclick=()=>window.print();d.showModal();}
 }
})();
