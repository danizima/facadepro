import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {normalizeQuoteDocument} from '../backend/quote-document15.mjs';

export async function verifyCrm18({page,base,shots}){
 assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname),'CRM fixtures require an isolated local server');
 const sessionResponse=await page.request.get(base+'/api/admin/session');assert.equal(sessionResponse.status(),200);
 const session=await sessionResponse.json(),headers={Origin:new URL(base).origin,'X-CSRF-Token':session.csrf},leads=[];
 const api=async(route,method='GET',data)=>{const response=await page.request.fetch(base+route,{method,headers,...(data?{data}:{})});assert.ok(response.ok(),method+' '+route+': '+await response.text());return response.json();};
 const create=async name=>{const lead=await api('/api/admin/leads','POST',{name,email:'crm18-'+randomUUID()+'@example.test',services:['glazing'],source:'other',assignee:session.username,idempotency:randomUUID()});leads.push(lead);return lead;};
 const priceDocument=(quantity='1.5',price='1000.11',mode='extra',rate='22')=>({title:'Исходное КП 18',items:[{title:'Монтаж остекления',unit:'м²',quantity,unitPrice:price}],tax:{mode,rate},timeframe:'20 рабочих дней',payment:'Оплата по этапам'});
 const money=cents=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2}).format(cents/100);
 let releaseHeld=null,heldPath=null;
 try{
  const main=await create('Ответ по исходному КП18'),other=await create('Другая заявка CRM18'),route='/api/admin/leads/'+main.id;
  const first=(await api(route+'/quotes/build','POST',{...priceDocument(),idempotency:randomUUID()})).quote;
  let portal=await api(route+'/portal');portal=await api(route+'/portal','POST',{action:'issue',revision:portal.revision});
  const token=new URL(portal.url,base).hash.slice(1);
  portal=await api(route+'/portal','POST',{action:'publishQuote',quoteId:first.id,revision:portal.revision});
  const response=await page.request.post(base+'/api/client/lead/quotes/'+first.id+'/response',{headers:{Origin:new URL(base).origin,Authorization:'Bearer '+token},data:{quoteId:first.id,choice:'reprice',comment:'Пересчитайте количество в исходном КП18',idempotency:randomUUID()}});assert.equal(response.status(),200,await response.text());
  const later=(await api(route+'/quotes/build','POST',{...priceDocument('10','2000'),title:'Более новая версия 18',idempotency:randomUUID()})).quote;
  portal=await api(route+'/portal');await api(route+'/portal','POST',{action:'publishQuote',quoteId:later.id,revision:portal.revision});
  const before=await api(route),quotesBefore=await api(route+'/quotes'),incoming=(await api('/api/admin/incoming?mine=0&limit=100&offset=0')).entries.find(entry=>entry.leadId===main.id&&entry.kind==='quote_response');
  assert.ok(incoming);assert.equal(incoming.quoteVersion,first.version);assert.equal(incoming.quoteId,undefined,'narrow incoming API does not expose private quote identifiers');
  await page.setViewportSize({width:390,height:844});await page.goto(base+'/admin/',{waitUntil:'networkidle'});await page.locator('[data-tab=incoming]').click();
  const eventCard=page.locator('[data-incoming-id="'+incoming.id+'"]');await eventCard.waitFor();
  heldPath=base+route+'/quotes';let firstQuoteStarted;const firstStarted=new Promise(resolve=>{firstQuoteStarted=resolve;}),firstHeld=new Promise(resolve=>{releaseHeld=resolve;});
  const firstHold=async intercepted=>{const actual=await intercepted.fetch();firstQuoteStarted();await firstHeld;await intercepted.fulfill({response:actual});};await page.route(heldPath,firstHold);
  const portalLoaded=page.waitForResponse(response=>response.url()===base+route+'/portal'&&response.request().method()==='GET');await eventCard.locator('[data-incoming-quote]').click();await Promise.all([firstStarted,portalLoaded]);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await page.locator('#lead-quote-target-status.error').count(),0,'fast portal does not declare a still-loading quote missing');
  releaseHeld();releaseHeld=null;

  const firstCard=page.locator('[data-quote-version="'+first.version+'"]');await firstCard.locator('[data-quote-copy="'+first.id+'"]').waitFor();
  await page.locator('#lead-quote-target-status').filter({hasText:'КП №'+first.version}).waitFor();
  assert.equal(await page.getByRole('tab',{name:'КП',exact:true}).getAttribute('aria-selected'),'true');assert.equal(await firstCard.evaluate(node=>node.classList.contains('quote-response-target18')),true);
  assert.equal(await page.locator('[data-quote-version="'+later.version+'"] .quote-history-actions [data-quote-publish]').isDisabled(),true,'newer quote remains published');
  assert.equal(await page.locator('[data-quote-version="'+later.version+'"]').evaluate(node=>node.classList.contains('quote-response-target18')),false,'incoming opens its original version, not the latest publication');
  assert.equal(await page.evaluate(()=>document.activeElement?.dataset.quoteVersion),String(first.version),'keyboard focus follows the referenced quote');await page.unroute(heldPath,firstHold);heldPath=null;
  assert.equal((await api(route)).revision,before.revision);assert.equal((await api(route)).status,before.status);assert.equal((await api(route+'/quotes')).quotes.length,quotesBefore.quotes.length,'opening the reply does not create a new PDF');
  assert.equal((await api('/api/admin/incoming?mine=0&limit=100&offset=0')).entries.find(entry=>entry.id===incoming.id).processed,false,'opening does not mark a reply processed');
  if(shots)await page.locator('#lead-quote-list').screenshot({path:path.join(shots,'crm18-original-quote-mobile.png')});

  await page.getByRole('tab',{name:'Заявка',exact:true}).click();await page.locator('#lead-edit [name=note]').fill('Не терять черновик при переходе к исходному КП18');
  await page.getByRole('tab',{name:'Общение',exact:true}).click();await page.locator('#lead-incoming-list [data-incoming-quote]').click();await firstCard.waitFor();
  assert.equal(await page.locator('#lead-edit [name=note]').inputValue(),'Не терять черновик при переходе к исходному КП18');assert.equal(await page.locator('#confirm-dialog').isVisible(),false,'changing panes preserves the draft without discarding it');
  await page.locator('#lead-quote-builder>summary').click();const form=page.locator('#lead-quote-build'),row=page.locator('.quote-build-item').first();
  assert.equal(await page.locator('#quote-build-total').innerText(),'Итого к оплате: —');
  await row.locator('[data-item-field=title]').fill('Проверка предпросмотра');await row.locator('[data-item-field=unit]').fill('м²');
  await row.locator('[data-item-field=quantity]').fill('1.5');await row.locator('[data-item-field=unitPrice]').fill('1000.11');
  assert.equal(await page.locator('#quote-build-total').innerText(),'Итого к оплате: —','numeric subtotal alone cannot imply a tax-inclusive total');
  await form.locator('[name=taxMode]').selectOption('extra');await form.locator('[name=taxRate]').fill('22');
  const expected=normalizeQuoteDocument(priceDocument()).totals;assert.equal(await page.locator('#quote-build-total').innerText(),'Итого к оплате: '+money(expected.totalKopecks));assert.equal(await page.locator('#quote-build-tax').innerText(),money(expected.taxKopecks));
  assert.equal(await page.locator('#quote-build-tax-label').innerText(),'НДС сверх цен');
  for(const mode of ['included','none']){
   await form.locator('[name=taxMode]').selectOption(mode);if(mode!=='none')await form.locator('[name=taxRate]').fill('22');const totals=normalizeQuoteDocument(priceDocument('1.5','1000.11',mode,mode==='none'?'0':'22')).totals;
   assert.equal(await page.locator('#quote-build-total').innerText(),'Итого к оплате: '+money(totals.totalKopecks));assert.equal(await page.locator('#quote-build-tax-summary').isVisible(),mode!=='none');
   if(mode==='included'){assert.equal(await page.locator('#quote-build-tax-label').innerText(),'В том числе НДС');assert.equal(await page.locator('#quote-build-tax').innerText(),money(totals.taxKopecks));}else assert.match(await page.locator('#quote-build-preview-hint').innerText(),/Без НДС/);
  }
  await form.locator('[name=taxMode]').selectOption('extra');await form.locator('[name=taxRate]').fill('22');
  await row.locator('[data-item-field=quantity]').fill('0.5');await row.locator('[data-item-field=unitPrice]').fill('0.01');await form.locator('[name=taxRate]').fill('10');
  assert.equal(await page.locator('#quote-build-total').innerText(),'Итого к оплате: '+money(1),'half-kopeck line rounds up before tax');
  await form.locator('[name=taxRate]').fill('31');assert.equal(await page.locator('#quote-build-total').innerText(),'Итого к оплате: —');assert.equal(await page.locator('#quote-build-tax-summary').isVisible(),false,'invalid rate hides the previous tax total');
  await form.locator('[name=taxRate]').fill('22');await row.locator('[data-item-field=quantity]').fill('');assert.equal(await page.locator('#quote-build-total').innerText(),'Итого к оплате: —');
  await row.locator('[data-item-field=quantity]').fill('1.5');await row.locator('[data-item-field=unitPrice]').fill('1000.11');
  for(const width of [390,320,1440]){await page.setViewportSize({width,height:width===1440?1000:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'CRM preview fits '+width);if(shots&&width!==320)await page.locator('.quote-draft-summary18').screenshot({path:path.join(shots,'crm18-preview-'+(width===390?'mobile':'desktop')+'.png')});}
  const intact=await api(route);assert.equal(intact.revision,before.revision);assert.equal((await api(route+'/quotes')).quotes.length,2,'preview is read-only');

  // An unavailable original version must never fall back to another quote.
  await page.locator('[data-tab=incoming]').click();await page.locator('#confirm-dialog').waitFor({state:'visible'});await page.locator('#confirm-cancel').click();assert.equal(await row.locator('[data-item-field=quantity]').inputValue(),'1.5','cancelled exit preserves the quote draft');
  await page.locator('[data-tab=incoming]').click();await page.locator('#confirm-yes').click();await eventCard.waitFor();
  const missing=async intercepted=>{const actual=await intercepted.fetch(),data=await actual.json();await intercepted.fulfill({response:actual,json:{...data,quotes:data.quotes.filter(quote=>quote.version!==first.version)}});};
  await page.route(base+route+'/quotes',missing);await eventCard.locator('[data-incoming-quote]').click();await page.locator('#lead-quote-target-status.error').filter({hasText:'недоступно'}).waitFor();assert.equal(await page.locator('.quote-response-target18').count(),0,'missing original never highlights the newer version');await page.unroute(base+route+'/quotes',missing);

  await page.locator('[data-tab=incoming]').click();await eventCard.waitFor();
  heldPath=base+route+'/quotes';let notifyStarted;const started=new Promise(resolve=>{notifyStarted=resolve;}),held=new Promise(resolve=>{releaseHeld=resolve;});
  const hold=async intercepted=>{const actual=await intercepted.fetch();notifyStarted();await held;await intercepted.fulfill({response:actual});};
  await page.route(heldPath,hold);await eventCard.locator('[data-incoming-quote]').click();await started;
  await page.locator('#back-leads').click();await page.locator('#new-manual-lead').waitFor();if(!await page.locator('[data-lead="'+other.id+'"]:visible').count()){if(!await page.locator('#lead-filter-reset').isVisible())await page.locator('#lead-filter-toggle').click();await page.locator('#lead-filter-reset').click();}
  await page.locator('[data-lead="'+other.id+'"]:visible').first().click();await page.locator('.detail-top h2').filter({hasText:other.reference}).waitFor();
  const late=page.waitForResponse(response=>response.url()===heldPath);releaseHeld();releaseHeld=null;await late;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(()=>location.hash),'#leads/'+other.id);assert.equal(await page.getByRole('tab',{name:'Заявка',exact:true}).getAttribute('aria-selected'),'true','late quote response cannot switch panes in a newer lead');assert.equal(await page.locator('.quote-response-target18').count(),0);await page.unroute(heldPath,hold);heldPath=null;
  console.log('PASS CRM18: live exact VAT preview, invalid totals hidden, original quote context over newer publication, missing/stale response guards, dirty panes preserved and read-only navigation, 320/390/1440 widths');
 }finally{
  releaseHeld?.();if(heldPath)await page.unroute(heldPath);
  for(const lead of leads){const removed=await page.request.delete(base+'/api/admin/leads/'+lead.id,{headers});assert.equal(removed.status(),200,'remove isolated CRM18 fixture');}
 }
}
