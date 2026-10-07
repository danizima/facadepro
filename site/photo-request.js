(() => {
  'use strict';
  const form=document.querySelector('#photo-request-form');
  if(!form)return;
  const fieldset=form.querySelector('fieldset'),status=document.querySelector('#photo-send-status'),fileStatus=document.querySelector('#photo-file-status');
  const chooser=document.querySelector('#photo-files'),camera=document.querySelector('#photo-camera'),preview=document.querySelector('#photo-previews');
  const success=document.querySelector('#photo-success'),total=document.querySelector('#photo-total'),drop=document.querySelector('#photo-drop');
  const project=JSON.parse(document.querySelector('#photo-projects')?.textContent||'[]').find(p=>p.id===new URLSearchParams(location.search).get('project'));
  if(project){const context=document.querySelector('#photo-project-context');context.hidden=false;context.textContent='Интересует похожий объект: '+project.title;}
  const limits={count:5,fileBytes:10*1024*1024,totalBytes:25*1024*1024};
  let photos=[],busy=false,ready=false,key=window.facade.uuid(),continuation='';
  const size=bytes=>(bytes/1024/1024).toLocaleString('ru',{maximumFractionDigits:1})+' МБ';
  const changed=()=>{key=window.facade.uuid();status.textContent='';const transfer=document.querySelector('#photo-transfer');if(transfer)transfer.hidden=true;};
  function draw(){
    preview.replaceChildren();
    photos.forEach((row,index)=>{
      const li=document.createElement('li'),img=document.createElement('img'),name=document.createElement('p'),button=document.createElement('button');
      img.src=row.url;img.alt='Выбранное фото '+(index+1);name.textContent=row.file.name;name.title=row.file.name;
      button.type='button';button.textContent='Убрать фото ×';button.setAttribute('aria-label','Убрать фотографию '+row.file.name);
      button.onclick=()=>{if(busy)return;URL.revokeObjectURL(row.url);photos.splice(index,1);changed();fileStatus.textContent='';draw();(preview.querySelectorAll('button')[Math.min(index,photos.length-1)]||document.querySelector('#choose-photos')).focus();};
      li.append(img,name,button);preview.append(li);
    });
    total.textContent=photos.length?'Выбрано: '+photos.length+' из '+limits.count+' · '+size(photos.reduce((sum,row)=>sum+row.file.size,0)):'Фотографии пока не выбраны';
  }
  function add(files){
    if(busy||!ready)return;
    const errors=[];let added=0;
    for(const file of files){
      if(!/\.(jpe?g|png|webp)$/i.test(file.name)||!file.size){errors.push('«'+file.name+'»: нужен JPG, PNG или WebP. Фото HEIC/HEIF сохраните в формате JPG.');continue;}
      if(file.size>limits.fileBytes){errors.push('«'+file.name+'»: больше '+size(limits.fileBytes)+'.');continue;}
      if(photos.some(row=>row.file.name===file.name&&row.file.size===file.size&&row.file.lastModified===file.lastModified))continue;
      if(photos.length>=limits.count){errors.push('Можно добавить до '+limits.count+' фотографий.');break;}
      if(photos.reduce((sum,row)=>sum+row.file.size,0)+file.size>limits.totalBytes){errors.push('Общий размер фотографий — не больше '+size(limits.totalBytes)+'.');continue;}
      photos.push({file,url:URL.createObjectURL(file)});added++;
    }
    if(added)changed();draw();fileStatus.textContent=[...new Set(errors)].join(' ');
  }
  document.querySelector('#choose-photos').onclick=()=>chooser.click();
  document.querySelector('#take-photo').onclick=()=>camera.click();
  for(const input of [chooser,camera])input.onchange=()=>{add([...input.files]);input.value='';};
  for(const eventName of ['dragover','dragenter'])drop.addEventListener(eventName,event=>{event.preventDefault();if(!busy&&ready)drop.classList.add('is-dragging');});
  for(const eventName of ['dragleave','drop'])drop.addEventListener(eventName,event=>{event.preventDefault();drop.classList.remove('is-dragging');if(eventName==='drop')add([...event.dataTransfer.files]);});
  form.addEventListener('input',event=>{event.target.setCustomValidity?.('');event.target.removeAttribute('aria-invalid');if(!busy&&event.target.name)changed();});
  form.addEventListener('invalid',event=>{const details=event.target.closest('details');if(details)details.open=true;},true);
  function showContinuation(value){continuation=typeof value==='string'&&/^\/followup\.html#[a-f0-9]{64}$/.test(value)?new URL(value,location.origin).href:'';const panel=document.querySelector('#photo-continuation');if(!panel)return;panel.hidden=!continuation;document.querySelector('#photo-continuation-status').textContent='';if(continuation)document.querySelector('#photo-open-continuation').href=continuation;}
  document.querySelector('#photo-copy-continuation')?.addEventListener('click',()=>copyText(continuation,document.querySelector('#photo-continuation-status')));
  document.querySelector('#photo-save-continuation')?.addEventListener('click',()=>{if(!continuation)return;const a=document.createElement('a'),url=URL.createObjectURL(new Blob(['Личная ссылка на обращение ФАСАД.PRO\n'+continuation+'\n\nПередавайте её только участникам вашего проекта.'],{type:'text/plain;charset=utf-8'}));a.href=url;a.download='ФАСАД_PRO_личная_ссылка.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);document.querySelector('#photo-continuation-status').textContent='Личная ссылка подготовлена к сохранению.';});
  function upload(payload){return new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest(),panel=document.querySelector('#photo-transfer'),bar=document.querySelector('#photo-progress'),label=document.querySelector('#photo-progress-text');if(panel){panel.hidden=false;bar.value=0;label.textContent='Загрузка фотографий…';}xhr.open('POST','/api/photo-request');xhr.timeout=90000;xhr.upload.onprogress=event=>{if(!bar)return;if(event.lengthComputable){const percent=Math.min(100,Math.round(event.loaded/event.total*100));bar.value=percent;label.textContent=percent<100?'Загрузка фотографий: '+percent+'%':'Фотографии переданы. Ожидаем подтверждение сервера…';}else{bar.removeAttribute('value');label.textContent='Загрузка фотографий…';}};xhr.onload=()=>{let result;try{result=JSON.parse(xhr.responseText);}catch{reject(Error('Не удалось подтвердить получение. Фотографии остались в форме — повторите отправку.'));return;}if(xhr.status<200||xhr.status>=300){reject(Error(result.error||'Не удалось отправить обращение. Попробуйте ещё раз.'));return;}if(result.received!==true||typeof result.reference!=='string'){reject(Error('Не удалось подтвердить получение. Повторите отправку.'));return;}if(bar){bar.value=100;label.textContent='Фотографии получены.';}resolve(result);};xhr.onerror=()=>reject(new TypeError('Связь прервалась.'));xhr.ontimeout=()=>reject(new DOMException('Время ожидания истекло.','TimeoutError'));xhr.send(payload);});}
  form.onsubmit=async event=>{
    event.preventDefault();if(busy||!ready)return;
    if(!photos.length){fileStatus.textContent='Добавьте хотя бы одну фотографию объекта.';document.querySelector('#choose-photos').focus();return;}
    const projectLink=form.elements.projectLink;if(projectLink){projectLink.setCustomValidity('');if(projectLink.value.trim()){try{const url=new URL(projectLink.value.trim());if(url.protocol!=='https:'||url.username||url.password||projectLink.value.trim().length>2000||url.href.length>2000)throw Error();projectLink.value=url.href;}catch{projectLink.setCustomValidity('Добавьте ссылку, которая начинается с https://, без логина и пароля.');}}projectLink.setAttribute('aria-invalid',String(!projectLink.checkValidity()));}
    if(!form.reportValidity())return;
    const phone=form.elements.phone.value;
    if(!/^[+\d\s().-]+$/.test(phone)||phone.replace(/\D/g,'').length<7||phone.replace(/\D/g,'').length>15){status.textContent='Проверьте номер телефона.';form.elements.phone.focus();return;}
    const payload=new FormData(form);payload.set('consent','yes');payload.set('idempotency',key);payload.set('sourcePage',window.facade.attribution());payload.set('analyticsSession',window.facade.getSession());
    if(project)payload.set('project',project.id);
    photos.forEach(row=>payload.append('files',row.file,row.file.name));
    busy=true;fieldset.disabled=true;status.textContent='Отправляем фотографии…';
    try{
      const result=await upload(payload);showContinuation(result.continuationUrl);
      document.querySelector('#photo-reference').textContent='Обращение '+result.reference+' · фотографий: '+photos.length;
      photos.forEach(row=>URL.revokeObjectURL(row.url));photos=[];draw();form.reset();form.hidden=true;success.hidden=false;success.focus();status.textContent='';
    }catch(error){status.textContent=error.name==='TimeoutError'?'Отправка заняла больше времени. Фотографии остались в форме — повторите попытку.':error instanceof TypeError?'Связь прервалась. Фотографии остались в форме — повторите отправку.':error.message;status.focus();}
    finally{busy=false;fieldset.disabled=false;}
  };
  document.querySelector('#photo-again').onclick=()=>{form.reset();key=window.facade.uuid();fileStatus.textContent='';status.textContent='';showContinuation(null);const transfer=document.querySelector('#photo-transfer');if(transfer)transfer.hidden=true;success.hidden=true;form.hidden=false;document.querySelector('#choose-photos').focus();};
  addEventListener('pagehide',event=>{if(!event.persisted)photos.forEach(row=>URL.revokeObjectURL(row.url));});
  void(async()=>{
    try{
      const cfg=await window.facade.ready;if(!cfg?.photoRequests)throw Error();
      if(cfg.uploads)Object.assign(limits,{count:cfg.uploads.count,fileBytes:cfg.uploads.fileBytes,totalBytes:cfg.uploads.totalBytes});
      ready=true;fieldset.disabled=false;status.textContent='';
    }catch{status.textContent='Форма сейчас недоступна. Позвоните менеджеру по номеру внизу страницы.';}
  })();
})();
