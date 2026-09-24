const fail=message=>Object.assign(new Error(message),{status:422});
const clean=(v,max,required=false)=>{if(typeof v!=='string'||v.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v)||(required&&!v.trim()))throw fail('Проверьте поля материалов.');return v.trim();};
export function validateMaterials(input,projects){
 const rows=input??[];if(!Array.isArray(rows)||rows.length>60)throw fail('Допустимо до 60 материалов.');
 const ids=new Set();return rows.map(r=>{
  if(!r||!/^[-a-z0-9]{1,60}$/.test(r.id)||ids.has(r.id)||!['video','review','document'].includes(r.kind))throw fail('Проверьте тип и адрес материала.');ids.add(r.id);
  const out={id:r.id,kind:r.kind,title:clean(r.title,180,true),text:clean(r.text||'',2000),author:clean(r.author||'',180),date:clean(r.date||'',10),project:clean(r.project||'',60),file:clean(r.file||'',100),poster:clean(r.poster||'',100),published:r.published===true,confirmed:r.confirmed===true};
  if(out.date&&(!/^\d{4}-\d{2}-\d{2}$/.test(out.date)||isNaN(Date.parse(out.date))||new Date(out.date+'T00:00:00Z').toISOString().slice(0,10)!==out.date))throw fail('Укажите корректную дату материала.');
  const project=projects.find(p=>p.id===out.project);if(out.project&&!project)throw fail('Проект материала не найден.');
  if(out.poster&&!project?.images.includes(out.poster))throw fail('Обложка должна быть фотографией выбранного проекта.');
  if(out.file&&!/^materials\/[a-f0-9-]{36}\.(pdf|mp4|webm)$/.test(out.file))throw fail('Загрузите PDF или видео через панель.');
  if(out.kind==='video'&&out.file&&!/\.(mp4|webm)$/.test(out.file))throw fail('Для видеокейса нужен MP4 или WebM.');
  if(out.kind!=='video'&&out.file&&!out.file.endsWith('.pdf'))throw fail('Документ или приложение к отзыву — PDF.');
  if(out.published){if(!out.confirmed)throw fail('Подтвердите достоверность и возможность публикации материала.');if(out.kind==='video'&&(!out.file||!out.poster))throw fail('Добавьте видео и обложку из проекта.');if(out.kind==='document'&&!out.file)throw fail('Загрузите документ PDF.');if(out.kind==='review'&&(!out.author||!out.text))throw fail('Укажите автора и текст отзыва.');}
  return out;
 });
}
export function publicMaterials(c){return (c.materials||[]).filter(r=>r.published&&r.confirmed&&(!r.project||c.projects.some(p=>p.id===r.project&&p.published!==false)));}
