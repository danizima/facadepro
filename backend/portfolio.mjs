import {spawn} from 'node:child_process';
import path from 'node:path';
import {ROOT,fail} from './store.mjs';
let active=0;
export async function createPortfolio(job){
 if(active>=2)throw fail(429,'Сейчас готовятся другие подборки. Повторите через минуту.');
 active++;
 try{return await new Promise((resolve,reject)=>{
  const p=spawn(process.env.PYTHON||'python3',[path.join(ROOT,'backend/portfolio.py')],{cwd:ROOT,env:process.env,stdio:['pipe','pipe','pipe']});
  const chunks=[];let size=0,finished=false;
  const finish=(error,data)=>{if(finished)return;finished=true;clearTimeout(timer);error?reject(error):resolve(data);};
  const timer=setTimeout(()=>{p.kill();finish(fail(503,'Подготовка PDF заняла слишком много времени. Выберите меньше объектов.'));},55000);
  p.stdout.on('data',chunk=>{size+=chunk.length;if(size>35*1024*1024){p.kill();finish(fail(413,'Подборка слишком большая. Выберите меньше объектов.'));}else chunks.push(chunk);});
  p.stderr.on('data',()=>{});p.stdin.on('error',()=>{});p.on('error',()=>finish(fail(503,'Создание PDF временно недоступно. Свяжитесь с менеджером.')));
  p.on('close',code=>{const result=Buffer.concat(chunks);if(code||result.subarray(0,5).toString()!=='%PDF-')finish(fail(503,'Не удалось собрать PDF. Проверьте фотографии выбранных объектов или обратитесь к менеджеру.'));else finish(null,result);});
  p.stdin.end(JSON.stringify(job));
 });}finally{active--;}
}
