import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const script=await readFile(new URL('../site/public.js',import.meta.url),'utf8');
const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),values};};
const local=storage(),session=storage();let time=Date.now();
function load(url,{referrer='https://example.test/',offline=false}={}){
 const location=new URL(url),buttons=['yes','no'].map(consent=>({dataset:{consent},addEventListener(_name,handler){this.click=handler;},focus(){}}));
 const panel={hidden:false,setAttribute(){},querySelectorAll:()=>buttons,querySelector:()=>buttons[0]};
 const events=[];
 const document={referrer,body:{dataset:{base:''},append(){}},createElement:()=>panel,querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){}};
 const window={facadeOffline:offline};
 class Clock extends Date{static now(){return time;}}
 vm.runInNewContext(script,{window,location,document,crypto:webcrypto,localStorage:local,sessionStorage:session,URL,URLSearchParams,Date:Clock,Promise,AbortSignal,TextEncoder,FormData,fetch:async(url,options)=>{if(url==='/api/events')events.push(JSON.parse(options.body));return {ok:true,json:async()=>({forms:true})};}});
 return {facade:window.facade,buttons,events};
}
let page=load('https://example.test/?utm_source=yandex&utm_campaign=main&email=private@example.test');
assert.equal(page.facade.marketingAttribution(),null);assert.equal(session.getItem('facade_visit'),null,'no visit metadata before consent');
page.buttons[0].click();
const first=page.facade.marketingAttribution();
assert.deepEqual({...first},{source:'yandex',medium:'',campaign:'main',content:'',term:'',landing:'/'});
assert.ok(!JSON.stringify(first).includes('private@example.test'),'landing contains no query parameters');
time+=5000;page=load('https://example.test/quote.html?utm_source=other&utm_campaign=changed');
assert.deepEqual({...page.facade.marketingAttribution()},{...first},'first-touch attribution survives navigation and later UTMs');
await page.facade.track('request_start','quote');assert.equal(page.events.at(-1).source,'yandex');
const key=page.facade.uuid(),data=new FormData();data.set('name','Контакт');data.set('phone','+79990000000');data.set('consent','yes');
const file=new File(['same bytes'],'Проект.txt',{lastModified:1});
const prepared=await page.facade.submissions.prepare('quote',data,[file],key);
data.set('consent','');const retry=await page.facade.submissions.prepare('quote',data,[new File(['same bytes'],'Проект.txt',{lastModified:999})],page.facade.uuid());
assert.equal(retry.key,key,'identical bytes/name preserve the request key despite file timestamps and consent reconfirmation');
assert.ok(!session.getItem('facade_retry15_quote').includes('Контакт')&&!session.getItem('facade_retry15_quote').includes('+79990000000'),'necessary retry ticket stores no contact fields');
assert.equal(prepared.files[0].name,'Проект.txt');
page=load('https://example.test/request.html');
const restored=await page.facade.submissions.prepare('quote',data,[new File(['same bytes'],'Проект.txt')],page.facade.uuid());assert.equal(restored.key,key,'retry survives page reload');
const noFileKey=page.facade.uuid(),withoutFiles=await page.facade.submissions.prepare('request',data,[],noFileKey);page=load('https://example.test/request.html');assert.equal((await page.facade.submissions.prepare('request',data,[],page.facade.uuid())).key,withoutFiles.key,'request without attachments also retains its key after reload');
data.set('name','Изменённый контакт');const changed=await page.facade.submissions.prepare('quote',data,[file],page.facade.uuid());assert.notEqual(changed.key,key,'actual changed inputs get a new key');
page.buttons[1].click();assert.equal(page.facade.marketingAttribution(),null);assert.equal(session.getItem('facade_visit'),null);assert.equal(JSON.parse(session.getItem('facade_retry15_quote')).attribution,null,'opt-out clears marketing from necessary retry tickets');
local.setItem('facade_statistics','yes');time+=1800001;page=load('https://example.test/request.html');assert.equal(page.facade.marketingAttribution().source,'direct','expired session starts a fresh source');
session.setItem('facade_visit','{malformed');page=load('https://example.test/request.html');assert.equal(page.facade.marketingAttribution(),null,'malformed storage fails safely');
session.removeItem('facade_visit');page=load('https://example.test/?utm_source=bad%3Cscript%3E&utm_medium='+('x'.repeat(81))+'&utm_content='+('x'.repeat(161)));assert.equal(page.facade.marketingAttribution().source,'direct');assert.equal(page.facade.marketingAttribution().medium,'');assert.equal(page.facade.marketingAttribution().content,'');
page=load('file:///offline/quote.html',{offline:true});assert.equal(page.facade.marketingAttribution(),null);
console.log('PASS v15 attribution/retries: opt-in first touch, bounded whitelist/path-only landing, navigation/expiry/opt-out, malformed storage, opaque retry tickets and byte-matched files');
