import {spawn} from 'node:child_process';
import {stat} from 'node:fs/promises';
import path from 'node:path';
import {ROOT,DATA,fail} from './store.mjs';
import {publicMaterials} from './content7.mjs';
export const kitDocuments=c=>publicMaterials(c).filter(r=>r.kind!=='video'&&r.file?.endsWith('.pdf'));
const uniqueIds=(value,max)=>Array.isArray(value)&&value.length<=max&&new Set(value).size===value.length&&value.every(id=>typeof id==='string'&&/^[-a-z0-9]{1,60}$/.test(id));
export async function selectKit(input,c){
 if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.profile!=='boolean'||!uniqueIds(input.projects,20)||!uniqueIds(input.documents,10))throw fail(422,'Проверьте состав пакета: до 20 объектов и до 10 документов.');
 if(!input.profile&&!input.projects.length&&!input.documents.length)throw fail(422,'Выберите хотя бы один материал.');
 const projects=input.projects.map(id=>c.projects.find(p=>p.id===id&&p.published!==false));
 const documents=input.documents.map(id=>kitDocuments(c).find(r=>r.id===id));
 if(projects.some(p=>!p)||documents.some(r=>!r))throw fail(422,'Состав материалов изменился. Обновите страницу и выберите доступные материалы.');
 let size=0;
 for(const document of documents){
  if(!/^materials\/[a-f0-9-]{36}\.pdf$/.test(document.file))throw fail(422,'Документ недоступен.');
  let info;try{info=await stat(path.join(DATA,document.file));}catch{throw fail(422,'Один из документов недоступен. Обратитесь к менеджеру.');}
  if(!info.isFile())throw fail(422,'Документ недоступен.');size+=info.size;
 }
 if(size>40*1024*1024)throw fail(413,'Документы занимают больше 40 МБ. Выберите меньше файлов.');
 return {profile:input.profile,projects,documents:documents.map(r=>({id:r.id,title:r.title,file:r.file})),settings:c.settings};
}
let active=false;
export async function createKit(job){
 if(active)throw fail(429,'Сейчас готовится другой пакет. Повторите через минуту.');active=true;
 try{return await new Promise((resolve,reject)=>{
  const p=spawn(process.env.PYTHON||'python3',[path.join(ROOT,'backend/kit.py')],{cwd:ROOT,env:process.env,stdio:['pipe','pipe','pipe']});
  const chunks=[];let size=0,finished=false;
  const finish=(error,result)=>{if(finished)return;finished=true;clearTimeout(timer);error?reject(error):resolve(result);};
  const timer=setTimeout(()=>{p.kill();finish(fail(503,'Подготовка пакета заняла слишком много времени. Выберите меньше объектов.'));},60000);
  p.stdout.on('data',chunk=>{size+=chunk.length;if(size>50*1024*1024){p.kill();finish(fail(413,'Пакет слишком большой. Выберите меньше материалов.'));}else chunks.push(chunk);});
  p.stderr.on('data',()=>{});p.stdin.on('error',()=>{});
  p.on('error',()=>finish(fail(503,'Создание пакета временно недоступно. Обратитесь к менеджеру.')));
  p.on('close',code=>{const result=Buffer.concat(chunks);if(code||result.subarray(0,4).toString('hex')!=='504b0304')finish(fail(503,'Не удалось собрать пакет. Обновите страницу или обратитесь к менеджеру.'));else finish(null,result);});
  p.stdin.end(JSON.stringify(job));
 });}finally{active=false;}
}
