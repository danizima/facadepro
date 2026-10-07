import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const error=(status,message)=>Object.assign(new Error(message),{status});
const maximum=999999999999n;
const rounded=(numerator,denominator)=>(numerator+denominator/2n)/denominator;
const amount=value=>Number(value);
export const rubles=kopecks=>Math.floor(kopecks/100)+'.'+String(kopecks%100).padStart(2,'0');
const decimal=(integer,places)=>{
 const scale=10**places,whole=Math.floor(integer/scale),fraction=String(integer%scale).padStart(places,'0').replace(/0+$/,'');
 return String(whole)+(fraction?'.'+fraction:'');
};

// All quantities/prices/taxes are decimal strings. Integer arithmetic rounds
// each line and tax once, half a kopeck upwards, without floating-point drift.
export function normalizeQuoteDocument(input,{fail=error,text}={}){
 const clean=(value,max,required=false)=>{
  if(text)return text(value,max,required);
  if(typeof value!=='string'||value.length>max||required&&!value.trim()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw fail(422,'Проверьте текст коммерческого предложения.');
  return value.trim();
 };
 const object=(value,keys)=>{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))throw fail(422,'Проверьте поля коммерческого предложения.');
 };
 const scaled=(value,places,max,label,positive=false)=>{
  if(typeof value!=='string'||value.length>30)throw fail(422,'Проверьте '+label+'.');
  const normalized=value.trim().replace(',','.'),pattern=new RegExp('^(?:0|[1-9]\\d{0,9})(?:\\.\\d{1,'+places+'})?$');
  if(!pattern.test(normalized))throw fail(422,'Проверьте '+label+': укажите десятичное число, не более '+places+' знаков после запятой.');
  const [whole,fraction='']=normalized.split('.'),result=BigInt(whole)*10n**BigInt(places)+BigInt(fraction.padEnd(places,'0'));
  if(result>max||positive&&result===0n)throw fail(422,'Проверьте '+label+'.');
  return result;
 };
 object(input,['idempotency','title','items','tax','timeframe','validUntil','payment','exclusions','customerNote']);
 const title=clean(input.title,180,true);
 if(!Array.isArray(input.items)||!input.items.length||input.items.length>50)throw fail(422,'Добавьте от 1 до 50 позиций КП.');
 let subtotal=0n;
 const items=input.items.map(item=>{
  object(item,['title','unit','quantity','unitPrice']);
  const title=clean(item.title,300,true),unit=clean(item.unit,20,true);
  const quantity=scaled(item.quantity,3,1000000000n,'количество',true),price=scaled(item.unitPrice,2,maximum,'цену');
  const line=rounded(quantity*price,1000n);subtotal+=line;
  if(subtotal>maximum)throw fail(422,'Итог КП превышает 9 999 999 999,99 ₽.');
  return {title,unit,quantity:decimal(Number(quantity),3),unitPrice:rubles(Number(price)),lineTotalKopecks:amount(line)};
 });
 object(input.tax,['mode','rate']);
 if(!['none','included','extra'].includes(input.tax.mode))throw fail(422,'Выберите режим НДС.');
 const rate=scaled(input.tax.rate,2,3000n,'ставку НДС');
 if(input.tax.mode==='none'&&rate!==0n)throw fail(422,'Для режима без НДС укажите ставку 0.');
 const vat=input.tax.mode==='none'?0n:rounded(subtotal*rate,input.tax.mode==='included'?10000n+rate:10000n);
 const total=input.tax.mode==='extra'?subtotal+vat:subtotal;
 if(total<=0n||total>maximum)throw fail(422,'Итог КП должен быть больше нуля и не превышать 9 999 999 999,99 ₽.');
 const validUntil=clean(input.validUntil??'',10);
 if(validUntil&&(!/^\d{4}-\d{2}-\d{2}$/.test(validUntil)||Number.isNaN(Date.parse(validUntil+'T00:00:00.000Z'))||new Date(validUntil+'T00:00:00.000Z').toISOString().slice(0,10)!==validUntil))throw fail(422,'Проверьте срок действия предложения.');
 return {title,items,tax:{mode:input.tax.mode,rate:decimal(Number(rate),2)},totals:{subtotalKopecks:amount(subtotal),taxKopecks:amount(vat),totalKopecks:amount(total)},timeframe:clean(input.timeframe??'',160),validUntil,payment:clean(input.payment??'',1500),exclusions:clean(input.exclusions??'',3000),customerNote:clean(input.customerNote??'',3000)};
}

export function quoteDocumentSnapshot(document,settings,lead,{fail=error,text}={}){
 const clean=(value,max)=>{
  if(value===undefined||value===null)return '';
  if(text)return text(value,max);
  if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw fail(422,'Проверьте данные компании и заказчика.');
  return value.trim();
 };
 const company={};for(const key of ['legalName','inn','kpp','ogrn','phone','email','manager','vladivostok','moscow'])company[key]=clean(settings?.[key],250);
 const customer={reference:clean(lead.reference,100)};
 for(const key of ['name','company','object','city'])customer[key]=clean(lead.payload?.[key],250);
 return {...document,company,customer};
}

let active=0;
export async function renderQuoteDocument(document,{fail=error}={}){
 if(active>=2)throw fail(429,'Сейчас готовятся другие КП. Повторите через минуту.');
 active++;
 try{return await new Promise((resolve,reject)=>{
  const child=spawn(process.env.PYTHON||'python3',[fileURLToPath(new URL('./quote-document15.py',import.meta.url))],{stdio:['pipe','pipe','pipe']});
  const chunks=[];let length=0,finished=false;
  const finish=(err,result)=>{if(finished)return;finished=true;clearTimeout(timer);err?reject(err):resolve(result);};
  const timer=setTimeout(()=>{child.kill();finish(fail(503,'Создание КП заняло слишком много времени. Повторите попытку.'));},55000);
  child.stdout.on('data',chunk=>{length+=chunk.length;if(length>15*1024*1024){child.kill();finish(fail(413,'КП слишком большое. Сократите описание.'));}else chunks.push(chunk);});
  child.stderr.on('data',()=>{});child.stdin.on('error',()=>{});
  child.on('error',()=>finish(fail(503,'Создание КП временно недоступно.')));
  child.on('close',code=>{const bytes=Buffer.concat(chunks);if(code||bytes.subarray(0,5).toString()!=='%PDF-')finish(fail(503,'Не удалось создать PDF коммерческого предложения.'));else finish(null,bytes);});
  child.stdin.end(JSON.stringify(document));
 });}finally{active--;}
}
