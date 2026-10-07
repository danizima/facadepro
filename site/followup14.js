'use strict';
(() => {
  const q=selector=>document.querySelector(selector),form=q('#followup-form');if(!form)return;
  const token=location.hash.slice(1),privateURL=location.origin+location.pathname+'#'+token;
  const status=q('#followup-load-status'),content=q('#followup-content'),retry=q('#followup-retry');
  const refresh=q('#followup-refresh'),refreshStatus=q('#followup-refresh-status');
  const sendStatus=q('#followup-send-status'),fieldset=form.querySelector('fieldset'),submit=q('#followup-submit');
  const picker=q('#followup-files'),drop=q('#followup-drop'),fileError=q('#followup-file-error');
  const quoteCard=q('#followup-quote'),quoteDownload=q('#followup-quote-download'),quoteFeedback=q('#followup-quote-feedback');
  const responseCard=q('#followup-response'),responseForm=q('#followup-response-form'),responseFieldset=responseForm.querySelector('fieldset'),responseComment=q('#followup-response-comment'),responseStatus=q('#followup-response-status'),responseSubmit=q('#followup-response-submit');
  const responseChoices=[...responseForm.querySelectorAll('[data-quote-choice]')],responseLabels={discuss:'Обсудить условия',reprice:'Нужен пересчёт',proceed:'Готов перейти к договору'};
  const responseDraft=q('#followup-response-draft'),responseDraftMessage=q('#followup-response-draft-message'),responseDraftActions=q('#followup-response-draft-actions'),responseTransfer=q('#followup-response-transfer'),responseDiscard=q('#followup-response-discard');
  const requests=new Set(),blobURLs=new Set(),quoteViewed=new Set(),quoteViewing=new Set();
  let files=[],busy=false,loaded=false,key=uuid(),generation=0,currentQuote=null,quoteBusy=false,activeUpload=null,responseChoice='',responseKey=uuid(),responseBusy=false,responseEpoch=0,refreshing=false,refreshEpoch=0,responseDetached=false;
  const unauthorized=response=>[401,403,404,410].includes(response.status);
  const accessDenied=response=>[401,403,410].includes(response.status);
  const sameQuote=quote=>currentQuote?.id===quote.id&&currentQuote?.publishedAt===quote.publishedAt;
  function clearPrivate(){
    generation++;refreshEpoch++;loaded=false;currentQuote=null;quoteBusy=false;busy=false;refreshing=false;
    for(const controller of requests)controller.abort();requests.clear();activeUpload?.abort();activeUpload=null;
    for(const url of blobURLs)URL.revokeObjectURL(url);blobURLs.clear();quoteViewed.clear();quoteViewing.clear();
    content.hidden=true;quoteCard.hidden=true;quoteDownload.disabled=false;quoteDownload.textContent='Скачать КП · PDF ↓';
    resetQuoteResponse();responseCard.hidden=true;
    for(const selector of ['#followup-reference','#followup-status','#followup-next','#followup-manager','#followup-expires','#followup-link-status','#followup-quote-version','#followup-quote-amount','#followup-quote-timeframe','#followup-quote-date','#followup-quote-name','#followup-quote-size','#followup-quote-feedback'])q(selector).textContent='';
    for(const selector of ['#followup-phone','#followup-email']){const link=q(selector);link.hidden=true;link.textContent='';link.removeAttribute('href');}
    q('#followup-updates').replaceChildren();form.reset();files=[];draw();fieldset.disabled=false;submit.textContent='Отправить дополнение ↗';
    fileError.textContent='';sendStatus.textContent='';q('#followup-transfer').hidden=true;key=uuid();
    refreshStatus.textContent='';refresh.textContent='Обновить статус';syncControls();
  }
  function unavailable(){clearPrivate();retry.hidden=true;status.hidden=false;status.textContent='Не удалось открыть обращение. Ссылка недоступна или срок её действия закончился. Свяжитесь с менеджером.';}
  async function privateFetch(url,options={}){
    const controller=new AbortController();requests.add(controller);
    try{return await fetch(url,{...options,headers:{...options.headers,Authorization:'Bearer '+token},credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});}
    finally{requests.delete(controller);}
  }
  // Hide personal data immediately when changing links or entering the back/forward cache.
  addEventListener('hashchange',()=>{clearPrivate();location.reload();});
  addEventListener('pagehide',clearPrivate);
  function uuid(){if(crypto.randomUUID)return crypto.randomUUID();const values=crypto.getRandomValues(new Uint8Array(16));values[6]=(values[6]&15)|64;values[8]=(values[8]&63)|128;const hex=[...values].map(value=>value.toString(16).padStart(2,'0')).join('');return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);}
  function https(value){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&value.length<=2000&&url.href.length<=2000?url.href:'';}catch{return '';}}
  function date(value){const parsed=new Date(value);return Number.isNaN(parsed.getTime())?'':parsed.toLocaleString('ru-RU',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});}
  function syncControls(){
    refresh.disabled=!loaded||refreshing||busy||responseBusy;
    submit.disabled=!loaded||refreshing||busy;
    responseSubmit.disabled=!loaded||refreshing||responseBusy||!currentQuote?.responseApi||!responseChoice;
    responseTransfer.disabled=refreshing||busy||responseBusy;responseDiscard.disabled=refreshing||busy||responseBusy;
  }
  function resetQuoteResponse({preserveComment=false}={}){
    const comment=preserveComment?responseComment.value:'';
    responseEpoch++;
    responseBusy=false;responseChoice='';responseKey=uuid();responseForm.reset();responseFieldset.disabled=false;responseSubmit.disabled=true;responseSubmit.textContent='Отправить ответ ↗';responseStatus.textContent='';
    responseComment.value=comment;responseDetached=false;responseDraft.hidden=true;responseDraftActions.hidden=true;responseDraftMessage.textContent='';responseSubmit.hidden=false;q('.followup-response-choices').hidden=false;
    responseChoices.forEach(button=>button.setAttribute('aria-pressed','false'));q('#followup-response-latest').hidden=true;
    for(const selector of ['#followup-response-last-choice','#followup-response-last-date','#followup-response-last-comment'])q(selector).textContent='';q('#followup-response-last-date').removeAttribute('datetime');
  }
  function retainQuoteDraft(available){
    resetQuoteResponse({preserveComment:true});responseDetached=!available;
    responseDraft.hidden=false;responseDraftActions.hidden=available;
    responseDraftMessage.textContent=available?'КП обновлено. Прежний выбор ответа сброшен. Комментарий сохранён: проверьте его и выберите следующий шаг заново.':'Менеджер убрал КП со страницы. Комментарий сохранён. Его можно перенести в дополнение или удалить.';
    responseCard.hidden=!available&&!responseComment.value;responseSubmit.hidden=!available;q('.followup-response-choices').hidden=!available;
  }
  function renderQuote(value){
    const prior=currentQuote;currentQuote=null;quoteCard.hidden=true;responseCard.hidden=true;quoteFeedback.textContent='';
    for(const selector of ['#followup-quote-version','#followup-quote-amount','#followup-quote-timeframe','#followup-quote-date','#followup-quote-name','#followup-quote-size'])q(selector).textContent='';
    const hasDraft=Boolean(responseComment.value||responseChoice),retain=Boolean((prior||responseDetached)&&hasDraft);
    if(!value||typeof value.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(value.id)||!Number.isInteger(value.version)||value.version<1||typeof value.name!=='string'||!value.name){if(retain)retainQuoteDraft(false);else resetQuoteResponse();q('#followup-response-intro').textContent='Сохранённый комментарий к прежнему КП.';return;}
    const route='/api/client/lead/quotes/'+encodeURIComponent(value.id);
    if(value.downloadApi!==route+'/file'||value.viewApi!==route+'/view'){if(retain)retainQuoteDraft(false);else resetQuoteResponse();return;}
    if(prior?.id!==value.id||prior?.publishedAt!==value.publishedAt){if(retain)retainQuoteDraft(true);else resetQuoteResponse();}
    currentQuote={id:value.id,version:value.version,name:value.name,publishedAt:value.publishedAt,downloadApi:value.downloadApi,viewApi:value.viewApi,responseApi:value.responseApi===route+'/response'?value.responseApi:null};q('#followup-quote-version').textContent='Версия '+value.version;
    const amount=typeof value.amount==='number'?value.amount:typeof value.amount==='string'&&/^\d{1,12}(?:\.\d{1,2})?$/.test(value.amount)?Number(value.amount):NaN;
    q('#followup-quote-amount').textContent=Number.isFinite(amount)&&amount>=0?amount.toLocaleString('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2}):'Указана в КП';
    q('#followup-quote-timeframe').textContent=typeof value.timeframe==='string'&&value.timeframe?value.timeframe:'Указан в КП';
    q('#followup-quote-date').textContent=date(value.publishedAt)||'—';q('#followup-quote-name').textContent=value.name;
    q('#followup-quote-size').textContent='PDF'+(Number.isFinite(value.size)?' · '+(value.size<1024*1024?Math.max(1,Math.ceil(value.size/1024)).toLocaleString('ru-RU')+' КБ':(value.size/1024/1024).toLocaleString('ru-RU',{maximumFractionDigits:2})+' МБ'):'');
    quoteDownload.disabled=quoteBusy;quoteCard.hidden=false;
    q('#followup-response-intro').textContent='Выберите следующий шаг. Менеджер получит ваш ответ и свяжется с вами.';
    if(currentQuote.responseApi){
      responseCard.hidden=false;const saved=value.response;
      const valid=saved&&saved.quoteId===value.id&&Object.hasOwn(responseLabels,saved.choice)&&typeof saved.comment==='string';
      q('#followup-response-latest').hidden=!valid;
      q('#followup-response-last-choice').textContent=valid?'Ваш последний ответ: '+responseLabels[saved.choice]:'';
      q('#followup-response-last-date').textContent=valid?date(saved.createdAt):'';if(valid)q('#followup-response-last-date').dateTime=saved.createdAt;else q('#followup-response-last-date').removeAttribute('datetime');
      q('#followup-response-last-comment').textContent=valid?saved.comment:'';
    }else if(retain)retainQuoteDraft(false);else resetQuoteResponse();
  }
  function renderLead(lead){
    if(!lead||typeof lead.reference!=='string'||typeof lead.statusLabel!=='string')throw Error('Не удалось загрузить обращение.');
    q('#followup-reference').textContent=lead.reference;q('#followup-status').textContent=lead.statusLabel;
    q('#followup-next').textContent=lead.customerMessage||'Менеджер уточнит задачу и согласует следующий шаг.';
    q('#followup-manager').textContent=lead.manager?.name||'Команда ФАСАД.PRO';
    const phone=typeof lead.manager?.phone==='string'?lead.manager.phone:'',phoneLink=q('#followup-phone');
    phoneLink.hidden=!/^[+\d\s().-]{7,40}$/.test(phone);if(!phoneLink.hidden){phoneLink.textContent=phone;phoneLink.href='tel:'+phone.replace(/[^+\d]/g,'');}
    const email=typeof lead.manager?.email==='string'?lead.manager.email:'',emailLink=q('#followup-email');
    emailLink.hidden=!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);if(!emailLink.hidden){emailLink.textContent=email;emailLink.href='mailto:'+email;}
    const expires=date(lead.expiresAt);q('#followup-expires').textContent=expires?'Личная ссылка действует до '+expires+'.':'';
    const history=q('#followup-updates');history.replaceChildren();
    for(const row of Array.isArray(lead.updates)?lead.updates:[]){
      const article=document.createElement('article'),time=document.createElement('time');article.className='followup-update';time.textContent=date(row.createdAt||row.created);if(row.createdAt||row.created)time.dateTime=row.createdAt||row.created;article.append(time);
      if(row.comment){const p=document.createElement('p');p.textContent=row.comment;article.append(p);}
      const link=typeof row.projectLink==='string'?https(row.projectLink):'';
      if(link){const a=document.createElement('a');a.textContent='Ссылка на проект ↗';a.href=link;a.target='_blank';a.rel='noopener noreferrer';article.append(a);}
      if(Array.isArray(row.files)&&row.files.length){const ul=document.createElement('ul');for(const file of row.files){const li=document.createElement('li');li.textContent=String(file.name||'Файл')+(Number.isFinite(file.size)?' · '+(file.size/1024/1024).toLocaleString('ru-RU',{maximumFractionDigits:2})+' МБ':'');ul.append(li);}article.append(ul);}else if(row.fileCount){const p=document.createElement('p');p.textContent='Файлов получено: '+row.fileCount;article.append(p);}
      history.append(article);
    }
    if(!history.children.length){const p=document.createElement('p');p.textContent='Дополнений пока нет. Исходные материалы уже находятся в обращении.';history.append(p);}
    renderQuote(lead.quote);loaded=true;content.hidden=false;status.hidden=true;retry.hidden=true;syncControls();
  }
  async function load({preserve=false}={}){
    if(refreshing)return;
    const keep=preserve&&loaded;if(!keep)clearPrivate();const expected=generation,expectedRefresh=++refreshEpoch;
    if(!/^[a-f0-9]{64}$/.test(token)){status.textContent='Не удалось открыть обращение. Проверьте личную ссылку или свяжитесь с менеджером.';return;}
    refreshing=true;retry.disabled=true;syncControls();
    if(keep){refresh.textContent='Обновляем…';refreshStatus.textContent='Проверяем статус обращения…';}else{status.hidden=false;status.textContent='Открываем обращение…';}
    try{const response=await privateFetch('/api/client/lead');if(expected!==generation||expectedRefresh!==refreshEpoch)return;if(!response.ok){if(unauthorized(response)){unavailable();return;}throw Error();}const lead=await response.json();if(expected===generation&&expectedRefresh===refreshEpoch){renderLead(lead);if(keep)refreshStatus.textContent='Статус обновлён.';}}
    catch{if(expected!==generation||expectedRefresh!==refreshEpoch)return;if(keep)refreshStatus.textContent='Не удалось обновить статус. Прежние данные и ваш ввод сохранены. Проверьте подключение и нажмите «Обновить статус» ещё раз.';else{status.textContent='Не удалось загрузить обращение. Проверьте подключение и повторите попытку.';retry.hidden=false;}}
    finally{if(expected===generation&&expectedRefresh===refreshEpoch){refreshing=false;retry.disabled=false;refresh.textContent='Обновить статус';syncControls();}}
  }
  retry.addEventListener('click',()=>void load());
  refresh.addEventListener('click',()=>{if(loaded&&!refreshing&&!busy&&!responseBusy)void load({preserve:true});});
  addEventListener('pageshow',event=>{if(event.persisted)void load();});
  async function recordQuoteView(quote,expected){
    const publication=quote.id+':'+quote.publishedAt;
    if(quoteViewed.has(publication)||quoteViewing.has(publication)||expected!==generation||!sameQuote(quote))return;quoteViewing.add(publication);
    try{const response=await privateFetch(quote.viewApi,{method:'POST'});if(expected!==generation)return;if(accessDenied(response)){unavailable();return;}if(!sameQuote(quote))return;if(unauthorized(response)){unavailable();return;}if(response.ok)quoteViewed.add(publication);}
    catch{/* The PDF download succeeds independently of the view receipt. */}
    finally{if(expected===generation)quoteViewing.delete(publication);}
  }
  quoteDownload.addEventListener('click',async()=>{
    if(!loaded||!currentQuote||quoteBusy)return;const quote=currentQuote,expected=generation;quoteBusy=true;quoteDownload.disabled=true;quoteDownload.textContent='Готовим PDF…';quoteFeedback.textContent='Загружаем коммерческое предложение…';
    try{
      const response=await privateFetch(quote.downloadApi);if(expected!==generation)return;if(accessDenied(response)){unavailable();return;}if(!sameQuote(quote))return;
      if(!response.ok){if(unauthorized(response)){unavailable();return;}throw Error();}
      if(!/^application\/pdf(?:;|$)/i.test(response.headers.get('Content-Type')||''))throw Error();
      const blob=await response.blob();if(expected!==generation||currentQuote?.id!==quote.id||currentQuote?.publishedAt!==quote.publishedAt)return;if(!blob.size)throw Error();
      const url=URL.createObjectURL(blob),link=document.createElement('a');blobURLs.add(url);link.href=url;link.download=quote.name;link.rel='noreferrer';link.click();
      setTimeout(()=>{URL.revokeObjectURL(url);blobURLs.delete(url);},2000);quoteFeedback.textContent='PDF подготовлен к скачиванию.';
      void recordQuoteView(quote,expected);
    }catch{if(expected===generation&&sameQuote(quote))quoteFeedback.textContent='Не удалось скачать КП. Проверьте подключение и повторите попытку.';}
    finally{if(expected===generation){quoteBusy=false;quoteDownload.disabled=false;quoteDownload.textContent='Скачать КП · PDF ↓';}}
  });
  q('#followup-quote-question').addEventListener('click',()=>{if(!loaded||!currentQuote)return;const comment=form.elements.comment;if(!comment.value.trim()){comment.value='Вопрос по КП, версия '+currentQuote.version+': ';comment.dispatchEvent(new Event('input',{bubbles:true}));}comment.focus();comment.scrollIntoView({block:'center',behavior:'smooth'});});
  function responseChanged(){if(responseBusy)return;responseKey=uuid();responseStatus.textContent='';if(currentQuote&&responseChoice){responseDraft.hidden=true;responseDraftMessage.textContent='';}syncControls();}
  for(const button of responseChoices)button.addEventListener('click',()=>{
    if(!loaded||!currentQuote?.responseApi||responseBusy)return;responseChoice=button.dataset.quoteChoice;
    responseChoices.forEach(choice=>choice.setAttribute('aria-pressed',String(choice===button)));responseChanged();
  });
  responseComment.addEventListener('input',responseChanged);
  responseForm.addEventListener('submit',async event=>{
    event.preventDefault();if(!loaded||refreshing||!currentQuote?.responseApi||responseBusy||!Object.hasOwn(responseLabels,responseChoice))return;
    if(!responseForm.reportValidity())return;const quote=currentQuote,expected=generation,expectedResponse=responseEpoch;
    const payload={quoteId:quote.id,choice:responseChoice,comment:responseComment.value.trim(),idempotency:responseKey};
    responseBusy=true;responseFieldset.disabled=true;responseSubmit.textContent='Отправляем…';responseStatus.textContent='Передаём ответ менеджеру…';syncControls();
    try{
      const response=await privateFetch(quote.responseApi,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(expected!==generation||expectedResponse!==responseEpoch)return;
      if(unauthorized(response)){unavailable();return;}const result=await response.json();if(expected!==generation||expectedResponse!==responseEpoch)return;
      if(!response.ok)throw Object.assign(Error(result.error||'Не удалось передать ответ. Повторите попытку.'),{customerMessage:true});
      if(result.received!==true||!result.lead)throw Object.assign(Error('Не удалось подтвердить получение. Повторите отправку — ответ не будет продублирован.'),{customerMessage:true});
      if(currentQuote?.id!==quote.id||currentQuote?.publishedAt!==quote.publishedAt)return;
      resetQuoteResponse();renderLead(result.lead);responseStatus.textContent='Ответ по КП, версия '+quote.version+', получен. Менеджер свяжется с вами.';
    }catch(error){if(expected===generation&&expectedResponse===responseEpoch){responseStatus.textContent=error.customerMessage?error.message:'Не удалось подтвердить получение. Данные остались в форме. Повторите отправку — ответ не будет продублирован.';responseStatus.focus();}}
    finally{if(expected===generation&&expectedResponse===responseEpoch){responseBusy=false;responseFieldset.disabled=false;responseSubmit.textContent='Отправить ответ ↗';syncControls();}}
  });
  responseTransfer.addEventListener('click',()=>{
    if(!loaded||!responseDetached||refreshing||busy||responseBusy)return;
    const comment=form.elements.comment,combined=[comment.value,responseComment.value].filter(Boolean).join('\n\n');
    if(combined.length>comment.maxLength){responseDraftMessage.textContent='В дополнении недостаточно места для этого комментария. Сократите текст или передайте его отдельным дополнением. Ваш комментарий сохранён.';return;}
    comment.value=combined;comment.dispatchEvent(new Event('input',{bubbles:true}));resetQuoteResponse();responseCard.hidden=true;comment.focus();syncControls();
  });
  responseDiscard.addEventListener('click',()=>{if(!loaded||!responseDetached||refreshing||busy||responseBusy)return;resetQuoteResponse();responseCard.hidden=true;syncControls();});
  function changed(){if(busy)return;key=uuid();sendStatus.textContent='';q('#followup-transfer').hidden=true;}
  function draw(){const list=q('#followup-selected-files');list.replaceChildren();files.forEach((file,index)=>{const li=document.createElement('li'),name=document.createElement('span'),remove=document.createElement('button');name.textContent=file.name+' · '+(file.size/1024/1024).toLocaleString('ru-RU',{maximumFractionDigits:2})+' МБ';remove.type='button';remove.textContent='Удалить ×';remove.setAttribute('aria-label','Удалить '+file.name);remove.disabled=busy;remove.onclick=()=>{if(busy)return;files.splice(index,1);changed();draw();};li.append(name,remove);list.append(li);});}
  function add(incoming){if(busy||!loaded)return;fileError.textContent='';const candidate=[...files];for(const file of incoming){if(candidate.some(item=>item.name===file.name&&item.size===file.size&&item.lastModified===file.lastModified))continue;if(!/\.(pdf|jpe?g|png|webp|dwg|dxf|xlsx|docx|txt|zip)$/i.test(file.name)){fileError.textContent='Неподдерживаемый формат: '+file.name;return;}if(!file.size||file.size>10*1024*1024){fileError.textContent='Файл должен быть непустым и не больше 10 МБ: '+file.name;return;}candidate.push(file);}if(candidate.length>5||candidate.reduce((sum,file)=>sum+file.size,0)>25*1024*1024){fileError.textContent='Допустимо до 5 файлов и до 25 МБ суммарно.';return;}files=candidate;changed();draw();}
  picker.addEventListener('change',()=>{add(picker.files);picker.value='';});
  for(const name of ['dragenter','dragover'])drop.addEventListener(name,event=>{event.preventDefault();if(!busy&&loaded)drop.classList.add('dragging');});
  for(const name of ['dragleave','drop'])drop.addEventListener(name,event=>{event.preventDefault();drop.classList.remove('dragging');});drop.addEventListener('drop',event=>add(event.dataTransfer.files));
  form.addEventListener('input',event=>{event.target.setCustomValidity?.('');event.target.removeAttribute('aria-invalid');changed();});
  function upload(payload,expected){return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest(),bar=q('#followup-progress'),label=q('#followup-progress-text');activeUpload=xhr;
    q('#followup-transfer').hidden=false;bar.value=0;label.textContent='Загрузка материалов…';xhr.open('POST','/api/client/lead/append');xhr.setRequestHeader('Authorization','Bearer '+token);xhr.timeout=90000;
    xhr.upload.onprogress=event=>{if(expected!==generation)return;if(event.lengthComputable){const percent=Math.min(100,Math.round(event.loaded/event.total*100));bar.value=percent;label.textContent=percent<100?'Загрузка материалов: '+percent+'%':'Материалы переданы. Ожидаем подтверждение сервера…';}else{bar.removeAttribute('value');label.textContent='Загрузка материалов…';}};
    xhr.onload=()=>{
      if(activeUpload===xhr)activeUpload=null;if(expected!==generation){reject(Error('Доступ к обращению изменился.'));return;}
      if(unauthorized(xhr)){unavailable();reject(Error('Личная ссылка недоступна.'));return;}
      let response;try{response=JSON.parse(xhr.responseText);}catch{reject(Error('Не удалось подтвердить получение. Повторите отправку — дополнение не будет продублировано.'));return;}
      if(xhr.status<200||xhr.status>=300){reject(Error(response.error||'Не удалось передать материалы. Повторите попытку.'));return;}
      if(response.received!==true){reject(Error('Не удалось подтвердить получение. Повторите отправку — дополнение не будет продублировано.'));return;}bar.value=100;label.textContent='Материалы получены.';resolve(response);
    };
    xhr.onerror=()=>reject(Error('Связь прервалась. Данные остались в форме. Повторите отправку — дополнение не будет продублировано.'));xhr.ontimeout=()=>reject(Error('Не удалось получить подтверждение вовремя. Данные остались в форме. Повторите отправку — дополнение не будет продублировано.'));xhr.onabort=()=>reject(Error('Доступ к обращению изменился.'));xhr.onloadend=()=>{if(activeUpload===xhr)activeUpload=null;};xhr.send(payload);
  });}
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||refreshing||!loaded)return;
    const link=form.elements.projectLink,comment=form.elements.comment;link.setCustomValidity('');comment.setCustomValidity('');
    if(link.value.trim()&&!https(link.value.trim()))link.setCustomValidity('Добавьте ссылку, которая начинается с https://, без логина и пароля.');
    if(!comment.value.trim()&&!link.value.trim()&&!files.length)comment.setCustomValidity('Добавьте комментарий, ссылку на проект или файл.');
    for(const input of [link,comment])input.setAttribute('aria-invalid',String(!input.checkValidity()));if(!form.reportValidity())return;
    const payload=new FormData(form);payload.set('comment',comment.value.trim());payload.set('projectLink',link.value.trim()?https(link.value.trim()):'');payload.set('idempotency',key);files.forEach(file=>payload.append('files',file,file.name));
    const expected=generation;busy=true;fieldset.disabled=true;submit.textContent='Отправляем…';sendStatus.textContent='Передаём материалы. Не закрывайте страницу.';draw();syncControls();
    try{const result=await upload(payload,expected);if(expected!==generation)return;files=[];form.reset();key=uuid();fileError.textContent='';sendStatus.textContent='Дополнение получено и сохранено в вашем обращении.';if(result.lead)renderLead(result.lead);else await load({preserve:true});}
    catch(error){if(expected===generation){sendStatus.textContent=error.message;sendStatus.focus();}}
    finally{if(expected===generation){busy=false;fieldset.disabled=false;submit.textContent='Отправить дополнение ↗';draw();syncControls();}}
  });
  q('#followup-copy-link').addEventListener('click',async()=>{if(!loaded)return;const output=q('#followup-link-status'),expected=generation;try{await navigator.clipboard.writeText(privateURL);if(expected===generation)output.textContent='Личная ссылка скопирована.';}catch{if(expected===generation)output.textContent=privateURL+' — выделите и скопируйте ссылку.';}});
  q('#followup-save-link').addEventListener('click',()=>{if(!loaded)return;const a=document.createElement('a'),url=URL.createObjectURL(new Blob(['Личная ссылка на обращение ФАСАД.PRO\n'+privateURL+'\n\nПередавайте её только участникам вашего проекта.'],{type:'text/plain;charset=utf-8'}));blobURLs.add(url);a.href=url;a.download='ФАСАД_PRO_личная_ссылка.txt';a.click();setTimeout(()=>{URL.revokeObjectURL(url);blobURLs.delete(url);},2000);q('#followup-link-status').textContent='Личная ссылка подготовлена к сохранению.';});
  void load();
})();
