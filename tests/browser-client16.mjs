import assert from 'node:assert/strict';
import path from 'node:path';

// Backend authorization and immutable transactional storage are verified by
// client-responses16.mjs; this suite exercises real controls and lifecycle.
export async function verifyClient16({page:hostPage,base,shots}){
 const context=await hostPage.context().browser().newContext({viewport:{width:390,height:844}}),page=await context.newPage();page.setDefaultTimeout(12000);
 const token='c'.repeat(64),wrong='d'.repeat(64),quoteId='f2488025-fb1d-4d1a-8859-c50f7576e58a',root='/api/client/lead/quotes/'+quoteId;
 const quote={id:quoteId,version:4,name:'КП ФАСАД.PRO.pdf',size:1200,amount:'1030000.75',timeframe:'30 рабочих дней',publishedAt:'2026-10-07T05:20:00.000Z',downloadApi:root+'/file',viewApi:root+'/view',responseApi:root+'/response',response:null,secret:'CLIENT16_STAFF_SECRET'};
 const lead={reference:'ФП-CLIENT16',statusLabel:'Предложение подготовлено',customerMessage:'Обсудим следующий шаг.',manager:{name:'Менеджер проекта'},expiresAt:'2027-01-05T05:20:00.000Z',updates:[],quote};
 const labels={discuss:'Обсудить условия',reprice:'Нужен пересчёт',proceed:'Готов перейти к договору'};
 let state=200,showQuote=true,mode='normal',releaseSlow=null,slowWait=null,responsePosts=0,newResponses=0,appendPosts=0;const slowReleases=[];
 const responses=new Map(),requests=[],errors=[];
 page.on('request',request=>requests.push(request));page.on('pageerror',error=>errors.push(error.message));
 await context.addCookies([{name:'private-sentinel',value:'must-not-send',url:base}]);
 await page.route('**/api/client/lead**',async route=>{
  const request=route.request(),url=new URL(request.url()),headers=await request.allHeaders();
  assert.equal(url.search,'');assert.ok(!headers.referer,'response APIs omit referrer');
  if(url.pathname!== '/api/client/lead/append')assert.ok(!headers.cookie,'fetches omit ambient cookies');
  const privateHeaders={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
  const safeLead=()=>({...lead,quote:showQuote?quote:null});
  if(headers.authorization!=='Bearer '+token||state!==200){await route.fulfill({status:headers.authorization!=='Bearer '+token?404:state,headers:privateHeaders,json:{error:'Личная ссылка недоступна.'}});return;}
  if(url.pathname==='/api/client/lead'&&request.method()==='GET'){await route.fulfill({status:200,headers:privateHeaders,json:safeLead()});return;}
  if(url.pathname===root+'/response'&&request.method()==='POST'){
   responsePosts++;const input=request.postDataJSON();assert.deepEqual(Object.keys(input).sort(),['quoteId','choice','comment','idempotency'].sort());assert.equal(input.quoteId,quoteId);assert.ok(Object.hasOwn(labels,input.choice));assert.match(input.idempotency,/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);assert.equal(headers['content-type'],'application/json');
   if(mode==='error422'){await route.fulfill({status:422,headers:privateHeaders,json:{error:'Проверьте ответ и повторите попытку.'}});return;}
   if(mode==='reject404'){await route.fulfill({status:404,headers:privateHeaders,json:{error:'КП недоступно.'}});return;}
   const original=responses.get(input.idempotency);if(original)assert.deepEqual(original.input,input,'same key retains exactly the same payload');
   const response=original?.response||{id:'response-'+(++newResponses),quoteId,choice:input.choice,comment:input.comment,createdAt:'2026-10-07T05:30:0'+newResponses+'.000Z'};
   responses.set(input.idempotency,{input,response});quote.response=response;
   if(mode==='lost'){mode='normal';await route.abort('failed');return;}
   if(mode==='slow'){const waiting=slowWait;mode='normal';await waiting;}
   await route.fulfill({status:200,headers:privateHeaders,json:{received:true,replayed:Boolean(original),response,lead:safeLead()}}).catch(()=>{});return;
  }
  if(url.pathname==='/api/client/lead/append'&&request.method()==='POST'){
   appendPosts++;await route.fulfill({status:200,headers:privateHeaders,json:{received:true,lead:safeLead()}});return;
  }
  await route.fulfill({status:404,headers:privateHeaders,json:{error:'Недоступно'}});
 });
 const open=async(value=token)=>{const url=base+'/followup.html#'+value;if(page.url()===url)await page.reload({waitUntil:'networkidle'});else await page.goto(url,{waitUntil:'networkidle'});};
 const visible=()=>page.locator('#followup-content').waitFor({state:'visible'});
 const pick=choice=>page.locator('[data-quote-choice="'+choice+'"]').click();
 const accepted=()=>page.locator('#followup-response-status').filter({hasText:'получен'}).waitFor();
 const scrubbed=async()=>{
  assert.equal(await page.locator('#followup-response').isHidden(),true);
  for(const id of ['last-choice','last-date','last-comment','status'])assert.equal(await page.locator('#followup-response-'+id).textContent(),'');
  assert.equal(await page.locator('#followup-response-comment').inputValue(),'');
  assert.equal(await page.locator('[name=comment]').inputValue(),'');
 };
 try{
  await open();await visible();await page.locator('#followup-response').waitFor({state:'visible'});
  assert.equal(responsePosts,0);assert.equal(await page.locator('#followup-response-submit').isDisabled(),true);assert.equal(await page.locator('#followup-response-latest').isHidden(),true);
  assert.equal(await page.locator('[data-quote-choice]').count(),3);assert.equal(await page.locator('#followup-response-comment').getAttribute('maxlength'),'1500');assert.doesNotMatch(await page.locator('body').innerText(),/CLIENT16_STAFF_SECRET/);
  for(const width of [320,390,1440]){await page.setViewportSize({width,height:width===1440?1000:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'response controls fit '+width);for(const choice of Object.keys(labels)){const box=await page.locator('[data-quote-choice="'+choice+'"]').boundingBox();assert.ok(box.height>=44,'touch target remains usable');}}
  await page.setViewportSize({width:390,height:844});
  await page.locator('[name=comment]').fill('Мой черновик материалов');await pick('reprice');await page.locator('#followup-response-comment').fill('Измените объём примыканий.');
  assert.equal(await page.locator('[data-quote-choice=reprice]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('[data-quote-choice=discuss]').getAttribute('aria-pressed'),'false');
  mode='lost';await page.locator('#followup-response-submit').click();await page.locator('#followup-response-status').filter({hasText:'Повторите отправку'}).waitFor();assert.equal(newResponses,1);assert.equal(await page.locator('#followup-response-comment').inputValue(),'Измените объём примыканий.');assert.equal(await page.locator('[name=comment]').inputValue(),'Мой черновик материалов');
  await page.locator('#followup-response-submit').click();await accepted();assert.equal(responsePosts,2);assert.equal(newResponses,1,'retry lost receipt does not create another response');assert.equal(await page.locator('[name=comment]').inputValue(),'Мой черновик материалов');assert.equal(await page.locator('#followup-response-comment').inputValue(),'');
  assert.match(await page.locator('#followup-response-last-choice').innerText(),/Нужен пересчёт/);assert.equal(await page.locator('#followup-response-last-comment').innerText(),'Измените объём примыканий.');assert.equal(await page.locator('#followup-status').innerText(),lead.statusLabel);
  const firstKey=[...responses.keys()][0];await pick('proceed');await page.locator('#followup-response-submit').click();await accepted();assert.equal(newResponses,2);assert.ok([...responses.keys()].some(key=>key!==firstKey),'different answer gets a fresh idempotency key');assert.match(await page.locator('#followup-response-last-choice').innerText(),/Готов перейти к договору/);assert.equal(await page.locator('#followup-status').innerText(),lead.statusLabel,'the interface does not mark a contract signed');
  if(shots)await page.screenshot({path:path.join(shots,'client-response-v16-mobile.png'),fullPage:true});

  await pick('discuss');await page.locator('#followup-response-comment').fill('Черновик ответа, отдельно от материалов');await page.locator('#followup-submit').click();await page.locator('#followup-send-status').filter({hasText:'Дополнение получено'}).waitFor();assert.equal(appendPosts,1);assert.equal(await page.locator('#followup-response-comment').inputValue(),'Черновик ответа, отдельно от материалов','receiving a materials append preserves a quote response draft');assert.equal(await page.locator('[data-quote-choice=discuss]').getAttribute('aria-pressed'),'true');
  mode='error422';await page.locator('#followup-response-submit').click();await page.locator('#followup-response-status').filter({hasText:'Проверьте ответ'}).waitFor();assert.equal(await page.locator('#followup-response-comment').inputValue(),'Черновик ответа, отдельно от материалов');mode='normal';await page.locator('#followup-response-submit').click();await accepted();assert.equal(newResponses,3);
  // A concurrent materials receipt can refresh the selected publication.
  // Its old response must never unlock or replace the controls of a newer one.
  await page.locator('[name=comment]').fill('Материалы к обновлённой публикации.');await pick('discuss');await page.locator('#followup-response-comment').fill('Ответ по прежней публикации.');
  mode='slow';let releaseOld;slowWait=new Promise(resolve=>{releaseOld=resolve;slowReleases.push(resolve);});let started=page.waitForRequest(request=>request.url().endsWith('/response'));await page.locator('#followup-response-submit').click();await started;
  quote.publishedAt='2026-10-07T05:32:00.000Z';quote.version=5;quote.response=null;await page.locator('#followup-submit').click();await page.locator('#followup-send-status').filter({hasText:'Дополнение получено'}).waitFor();assert.equal(await page.locator('#followup-response-comment').inputValue(),'Ответ по прежней публикации.');assert.equal(await page.locator('#followup-response-submit').isDisabled(),true);
  await pick('reprice');await page.locator('#followup-response-comment').fill('Ответ по новой публикации.');mode='slow';let releaseNew;slowWait=new Promise(resolve=>{releaseNew=resolve;slowReleases.push(resolve);});started=page.waitForRequest(request=>request.url().endsWith('/response'));await page.locator('#followup-response-submit').click();await started;
  const oldReply=page.waitForResponse(response=>response.url().endsWith('/response')&&response.request().postDataJSON().comment==='Ответ по прежней публикации.');releaseOld();await oldReply;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.locator('#followup-response-comment').isDisabled(),true,'obsolete reply cannot unlock a newer pending response');assert.equal(await page.locator('#followup-response-comment').inputValue(),'Ответ по новой публикации.');releaseNew();await accepted();assert.match(await page.locator('#followup-response-status').innerText(),/версия 5/);assert.equal(await page.locator('#followup-response-last-comment').innerText(),'Ответ по новой публикации.');
  quote.response={...quote.response,comment:'<img id="client16-xss" src=x onerror="alert(1)">',secret:'CLIENT16_RESPONSE_PRIVATE'};await page.reload({waitUntil:'networkidle'});await visible();assert.equal(await page.locator('#client16-xss').count(),0);assert.equal(await page.locator('#followup-response-last-comment').innerText(),quote.response.comment);assert.doesNotMatch(await page.locator('body').innerText(),/CLIENT16_RESPONSE_PRIVATE/);
  showQuote=false;await page.reload({waitUntil:'networkidle'});await visible();await scrubbed();showQuote=true;await page.reload({waitUntil:'networkidle'});await visible();

  await page.locator('[name=comment]').fill('Закрытый черновик');await page.locator('#followup-response-comment').fill('Закрытый ответ');await page.evaluate(value=>{location.hash=value;},wrong);await page.locator('#followup-load-status').filter({hasText:'недоступна'}).waitFor();await scrubbed();
  await open();await visible();state=410;await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await page.locator('#followup-load-status').filter({hasText:'недоступна'}).waitFor();await scrubbed();
  state=200;await open();await visible();await pick('discuss');mode='reject404';await page.locator('#followup-response-submit').click();await page.locator('#followup-load-status').filter({hasText:'недоступна'}).waitFor();await scrubbed();mode='normal';
  await page.reload({waitUntil:'networkidle'});await visible();await pick('reprice');await page.locator('#followup-response-comment').fill('Отложенный ответ');mode='slow';slowWait=new Promise(resolve=>{releaseSlow=resolve;slowReleases.push(resolve);});started=page.waitForRequest(request=>request.url().endsWith('/response'));await page.locator('#followup-response-submit').click();await started;assert.equal(await page.locator('#followup-response-comment').isDisabled(),true);await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));await scrubbed();releaseSlow();state=410;await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await page.locator('#followup-load-status').filter({hasText:'недоступна'}).waitFor();await scrubbed();
  assert.ok(!requests.some(request=>/\/api\/events|metrika|google-analytics|analytics/i.test(request.url())),'response portal has no public analytics');assert.ok(requests.filter(request=>['fetch','xhr','script','stylesheet','image'].includes(request.resourceType())).every(request=>!request.url().includes(token)&&!request.url().includes(wrong)),'bearer fragments never become resource URLs');assert.deepEqual(errors,[]);
  console.log('PASS v16 client response UI: three explicit choices, 320/390/1440 controls, isolated drafts, lost-receipt exact retries, fresh subsequent keys, validation feedback, literal latest response, no signed-contract claim, privacy, BFCache and stale-response scrubbing');
 }finally{slowReleases.forEach(release=>release());await context.close();}
}
