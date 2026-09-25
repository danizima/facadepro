(() => {
  'use strict';
  const form=document.querySelector('#photo-request-form');
  if(!form)return;
  const fieldset=form.querySelector('fieldset'),status=document.querySelector('#photo-send-status'),fileStatus=document.querySelector('#photo-file-status');
  const chooser=document.querySelector('#photo-files'),camera=document.querySelector('#photo-camera'),preview=document.querySelector('#photo-previews');
  const success=document.querySelector('#photo-success'),total=document.querySelector('#photo-total'),drop=document.querySelector('#photo-drop');
  const limits={count:5,fileBytes:10*1024*1024,totalBytes:25*1024*1024};
  let photos=[],busy=false,ready=false,key=window.facade.uuid();
  const size=bytes=>(bytes/1024/1024).toLocaleString('ru',{maximumFractionDigits:1})+' МБ';
  const changed=()=>{key=window.facade.uuid();status.textContent='';};
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
  form.addEventListener('input',event=>{if(!busy&&event.target.name)changed();});
  form.addEventListener('invalid',event=>{const details=event.target.closest('details');if(details)details.open=true;},true);
  form.onsubmit=async event=>{
    event.preventDefault();if(busy||!ready)return;
    if(!photos.length){fileStatus.textContent='Добавьте хотя бы одну фотографию объекта.';document.querySelector('#choose-photos').focus();return;}
    if(!form.reportValidity())return;
    const phone=form.elements.phone.value;
    if(!/^[+\d\s().-]+$/.test(phone)||phone.replace(/\D/g,'').length<7||phone.replace(/\D/g,'').length>15){status.textContent='Проверьте номер телефона.';form.elements.phone.focus();return;}
    const payload=new FormData(form);payload.set('consent','yes');payload.set('idempotency',key);payload.set('sourcePage',window.facade.attribution());payload.set('analyticsSession',window.facade.getSession());
    photos.forEach(row=>payload.append('files',row.file,row.file.name));
    busy=true;fieldset.disabled=true;status.textContent='Отправляем фотографии…';
    try{
      const response=await fetch('/api/photo-request',{method:'POST',body:payload,signal:AbortSignal.timeout(90000)});
      let result;try{result=await response.json();}catch{throw Error('Не удалось подтвердить получение. Фотографии остались в форме — повторите отправку.');}
      if(!response.ok)throw Error(result.error||'Не удалось отправить обращение. Попробуйте ещё раз.');
      if(!result.received||typeof result.reference!=='string')throw Error('Не удалось подтвердить получение. Повторите отправку.');
      document.querySelector('#photo-reference').textContent='Обращение '+result.reference+' · фотографий: '+photos.length;
      photos.forEach(row=>URL.revokeObjectURL(row.url));photos=[];draw();form.reset();form.hidden=true;success.hidden=false;success.focus();status.textContent='';
    }catch(error){status.textContent=error.name==='TimeoutError'?'Отправка заняла больше времени. Фотографии остались в форме — повторите попытку.':error instanceof TypeError?'Связь прервалась. Фотографии остались в форме — повторите отправку.':error.message;status.focus();}
    finally{busy=false;fieldset.disabled=false;}
  };
  document.querySelector('#photo-again').onclick=()=>{form.reset();key=window.facade.uuid();fileStatus.textContent='';status.textContent='';success.hidden=true;form.hidden=false;document.querySelector('#choose-photos').focus();};
  addEventListener('pagehide',event=>{if(!event.persisted)photos.forEach(row=>URL.revokeObjectURL(row.url));});
  void(async()=>{
    try{
      const cfg=await window.facade.ready;if(!cfg?.photoRequests)throw Error();
      if(cfg.uploads)Object.assign(limits,{count:cfg.uploads.count,fileBytes:cfg.uploads.fileBytes,totalBytes:cfg.uploads.totalBytes});
      ready=true;fieldset.disabled=false;status.textContent='';
    }catch{status.textContent='Форма сейчас недоступна. Позвоните менеджеру по номеру внизу страницы.';}
  })();
})();
