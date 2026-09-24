import {readFileSync} from 'node:fs';
const defaults=JSON.parse(readFileSync(new URL('../source/release6.json',import.meta.url),'utf8'));
const museum=JSON.parse(readFileSync(new URL('../source/museum-reports.json',import.meta.url),'utf8'));
const error=message=>Object.assign(new Error(message),{status:422});
const string=(v,max,required=false)=>{if(typeof v!=='string'||v.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v)||(required&&!v.trim()))throw error('Проверьте поля фотоотчётов и пояснений.');return v.trim();};
export const imageKey=v=>typeof v==='string'&&/^([a-z0-9-]+|media\/[a-f0-9-]+\.(png|jpg|webp))$/.test(v);
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
export function upgradeContent(value){
 value.schemaVersion=6;
 value.workflow??=structuredClone(defaults.workflow).filter(r=>value.projects.some(p=>p.id===r.project&&p.images.includes(r.image)));
 for(const p of value.projects){
  p.reports??=p.id==='museum'?museum.map(r=>({...r,published:true,dateKind:'publication'})):[];
  p.hotspots??=structuredClone(defaults.hotspots[p.id]||[]).filter(h=>p.images.includes(h.image));
 }
 return value;
}
export function validateExtras(p){
 const reports=p.reports??[],hotspots=p.hotspots??[];
 if(!Array.isArray(reports)||reports.length>60||!Array.isArray(hotspots)||hotspots.length>24)throw error('До 60 отчётов и 24 пояснений на объект.');
 const ids=new Set();
 const cleaned=reports.map(r=>{
  if(!r||!/^[-a-z0-9]{1,60}$/.test(r.id)||ids.has(r.id)||!date(r.publishedAt))throw error('Укажите уникальный адрес отчёта и корректную дату.');
  ids.add(r.id);
  if(!Array.isArray(r.photos)||r.photos.length<1||r.photos.length>16)throw error('В отчёте должно быть от 1 до 16 фото.');
  const sourceUrl=string(r.sourceUrl||'',1000);
  if(sourceUrl){let u;try{u=new URL(sourceUrl);}catch{throw error('Проверьте ссылку на источник.');}if(u.protocol!=='https:'||u.username||u.password)throw error('Источник должен быть HTTPS-ссылкой.');}
  if(!['publication','shooting'].includes(r.dateKind||'publication'))throw error('Выберите тип даты.');
  return {id:r.id,year:r.publishedAt.slice(0,4),published:r.published!==false,publishedAt:r.publishedAt,dateKind:r.dateKind||'publication',period:string(r.period||'',100,true),title:string(r.title||'',180,true),summary:string(r.summary||'',2000),sourceName:string(r.sourceName||'',150),sourceUrl,credit:string(r.credit||'',250),photos:r.photos.map(f=>{if(!imageKey(f.key))throw error('Проверьте фото отчёта.');return {key:f.key,caption:string(f.caption||'',500,true)};})};
 });
 const hids=new Set();
 const notes=hotspots.map(h=>{
  if(!h||!/^[-a-z0-9]{1,60}$/.test(h.id)||hids.has(h.id)||!p.images.includes(h.image))throw error('Пояснение должно относиться к фотографии проекта и иметь уникальный адрес.');
  hids.add(h.id);
  if(![h.x,h.y].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100))throw error('Позиция точки — от 0 до 100%.');
  return {id:h.id,image:h.image,x:h.x,y:h.y,title:string(h.title||'',140,true),text:string(h.text||'',1200,true)};
 });
 return {reports:cleaned,hotspots:notes};
}
export function validateWorkflow(input){
 const rows=input??defaults.workflow;
 if(!Array.isArray(rows)||rows.length>8)throw error('До 8 этапов работы.');
 return rows.map(r=>{if(!imageKey(r.image)||!/^[-a-z0-9]{2,60}$/.test(r.project||''))throw error('Выберите фотографию и проект этапа.');return {title:string(r.title||'',140,true),text:string(r.text||'',1200,true),image:r.image,project:r.project,caption:string(r.caption||'',250)};});
}
export function allContentImages(next){
 return [...new Set([...next.projects.flatMap(p=>[...p.images,...p.reports.flatMap(r=>r.photos.map(f=>f.key))]),...next.workflow.map(r=>r.image)])];
}
