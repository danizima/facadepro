import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import path from 'node:path';

// Real isolated server data and mutations; routes only simulate a lost or late
// network reply. This suite must never be pointed at a production origin.
export async function verifyPortal18({page:hostPage,base,shots}){
  assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname),'portal fixtures require an isolated local server');
  const session=await (await hostPage.request.get(base+'/api/admin/session')).json();assert.ok(session.csrf);
  const headers={Origin:base,'X-CSRF-Token':session.csrf};
  const api=async(route,method='GET',data,expected=200)=>{
    const response=await hostPage.request.fetch(base+route,{method,headers,...(data===undefined?{}:{data})});
    assert.equal(response.status(),expected,method+' '+route+': '+await response.text());return response.json();
  };
  const created=await api('/api/admin/leads','POST',{name:'Клиентский статус 18',company:'Локальная проверка',phone:'+7 999 018 18 18',email:'portal18@example.test',city:'Владивосток',object:'Тест клиентской страницы',services:['glazing'],source:'phone',assignee:session.username,idempotency:randomUUID(),allowDuplicate:true},201);
  const leadBase='/api/admin/leads/'+created.id;
  const portalAction=async(action,extra={})=>{
    const portal=await api(leadBase+'/portal');return api(leadBase+'/portal','POST',{action,revision:portal.revision,...extra});
  };
  const issued=await portalAction('issue'),token=new URL(issued.url,base).hash.slice(1);
  const build=async price=>(await api(leadBase+'/quotes/build','POST',{idempotency:randomUUID(),title:'Проверка актуального КП',items:[{title:'Монтаж витража',unit:'м²',quantity:'2',unitPrice:price}],tax:{mode:'included',rate:'22'},timeframe:'20 рабочих дней',validUntil:'',payment:'По согласованию',exclusions:'',customerNote:''},201)).quote;
  const first=await build('1000');await portalAction('publishQuote',{quoteId:first.id});
  const context=await hostPage.context().browser().newContext({viewport:{width:390,height:844}}),page=await context.newPage();page.setDefaultTimeout(12000);
  const errors=[],requests=[],releaseGates=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request));
  const getRoute='**/api/client/lead',open=async()=>{const url=base+'/followup.html#'+token;if(page.url()===url)await page.reload({waitUntil:'networkidle'});else await page.goto(url,{waitUntil:'networkidle'});await page.locator('#followup-content').waitFor({state:'visible'});};
  const refreshed=()=>page.locator('#followup-refresh-status').filter({hasText:'Статус обновлён'}).waitFor();
  const pick=choice=>page.locator('[data-quote-choice='+choice+']').click();
  const delayed=async pattern=>{
    let release,started;const gate=new Promise(resolve=>{release=resolve;releaseGates.push(resolve);}),began=new Promise(resolve=>{started=resolve;});
    const handler=async route=>{const response=await route.fetch();started();await gate;await route.fulfill({response}).catch(()=>{});};
    await page.route(pattern,handler);return {release,began,handler};
  };
  const obsoleteQuoteReply=async pattern=>{
    let release,started;const gate=new Promise(resolve=>{release=resolve;releaseGates.push(resolve);}),began=new Promise(resolve=>{started=resolve;});
    const handler=async route=>{started();await gate;const response=await route.fetch();assert.equal(response.status(),404,'real server denies an obsolete quote publication');await route.fulfill({response}).catch(()=>{});};
    await page.route(pattern,handler);return {release,began,handler};
  };
  const scrubbed=async()=>{
    assert.equal(await page.locator('#followup-content').isHidden(),true);
    for(const selector of ['#followup-reference','#followup-manager','#followup-quote-name','#followup-response-last-comment','#followup-response-draft-message','#followup-refresh-status'])assert.equal(await page.locator(selector).textContent(),'','private data scrubbed: '+selector);
    assert.equal(await page.locator('[name=comment]').inputValue(),'');assert.equal(await page.locator('[name=projectLink]').inputValue(),'');assert.equal(await page.locator('#followup-response-comment').inputValue(),'');assert.equal(await page.locator('#followup-selected-files li').count(),0);
  };
  try{
    await open();assert.equal(await page.locator('#followup-refresh').isEnabled(),true);
    await page.locator('[name=comment]').fill('Материалы: исходный черновик');await page.locator('[name=projectLink]').fill('https://example.test/project');
    await page.locator('#followup-files').setInputFiles({name:'portal18-plan.txt',mimeType:'text/plain',buffer:Buffer.from('Чертёж для локальной проверки')});
    await pick('reprice');await page.locator('#followup-response-comment').fill('Комментарий к действующему КП');
    await portalAction('message',{customerMessage:'Менеджер проверяет размеры объекта.'});
    let pending=await delayed(getRoute);await page.locator('#followup-refresh').click();await pending.began;
    assert.equal(await page.locator('#followup-refresh').isDisabled(),true);assert.equal(await page.locator('#followup-submit').isDisabled(),true);assert.equal(await page.locator('#followup-response-submit').isDisabled(),true);
    await page.locator('[name=comment]').fill('Материалы: изменено во время обновления');await page.locator('#followup-response-comment').fill('Ответ изменён во время обновления');
    pending.release();await refreshed();await page.unroute(getRoute,pending.handler);
    assert.equal(await page.locator('#followup-next').innerText(),'Менеджер проверяет размеры объекта.');
    assert.equal(await page.locator('[name=comment]').inputValue(),'Материалы: изменено во время обновления');assert.equal(await page.locator('[name=projectLink]').inputValue(),'https://example.test/project');assert.equal(await page.locator('#followup-selected-files li').count(),1);
    assert.equal(await page.locator('#followup-response-comment').inputValue(),'Ответ изменён во время обновления');assert.equal(await page.locator('[data-quote-choice=reprice]').getAttribute('aria-pressed'),'true');
    const oldStatus=await page.locator('#followup-status').innerText(),abort=route=>route.abort('failed');
    await page.route(getRoute,abort);await page.locator('#followup-refresh').click();await page.locator('#followup-refresh-status').filter({hasText:'Прежние данные и ваш ввод сохранены'}).waitFor();await page.unroute(getRoute,abort);
    assert.equal(await page.locator('#followup-status').innerText(),oldStatus);assert.equal(await page.locator('#followup-content').isVisible(),true);assert.equal(await page.locator('#followup-refresh').isEnabled(),true);assert.equal(await page.locator('#followup-selected-files li').count(),1);assert.equal(await page.locator('#followup-response-comment').inputValue(),'Ответ изменён во время обновления');
    await page.locator('#followup-refresh').click();await refreshed();
    const oldFile='**/api/client/lead/quotes/'+first.id+'/file';pending=await obsoleteQuoteReply(oldFile);await page.locator('#followup-quote-download').click();await pending.began;
    const second=await build('1500');await portalAction('publishQuote',{quoteId:second.id});
    await page.locator('#followup-refresh').click();await refreshed();
    assert.match(await page.locator('#followup-quote-version').innerText(),/Версия 2/);assert.match(await page.locator('#followup-response-draft-message').innerText(),/КП обновлено/);
    assert.equal(await page.locator('#followup-response-comment').inputValue(),'Ответ изменён во время обновления');assert.equal(await page.locator('[data-quote-choice][aria-pressed=true]').count(),0);assert.equal(await page.locator('#followup-response-submit').isDisabled(),true);
    let obsoleteReply=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith(first.id+'/file'));pending.release();await obsoleteReply;await page.unroute(oldFile,pending.handler);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await page.locator('#followup-content').isVisible(),true);assert.equal(await page.locator('#followup-response-comment').inputValue(),'Ответ изменён во время обновления','late old PDF 404 cannot wipe a valid refreshed page');
    const oldView='**/api/client/lead/quotes/'+second.id+'/view';pending=await obsoleteQuoteReply(oldView);const downloading=page.waitForEvent('download');await page.locator('#followup-quote-download').click();await downloading;await pending.began;
    await portalAction('withdrawQuote');await page.locator('#followup-refresh').click();await refreshed();obsoleteReply=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith(second.id+'/view'));pending.release();await obsoleteReply;await page.unroute(oldView,pending.handler);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await page.locator('#followup-content').isVisible(),true);assert.equal(await page.locator('#followup-response-comment').inputValue(),'Ответ изменён во время обновления','late old PDF view 404 cannot wipe the detached draft');
    await portalAction('publishQuote',{quoteId:second.id});await page.locator('#followup-refresh').click();await refreshed();
    const posts=()=>requests.filter(request=>request.method()==='POST'&&request.url().endsWith('/response'));
    await page.locator('#followup-response-form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.equal(posts().length,0,'old choice cannot be submitted after a new publication');
    await pick('discuss');pending=await delayed('**/api/client/lead/quotes/*/response');await page.locator('#followup-response-submit').click();await pending.began;assert.equal(await page.locator('#followup-refresh').isDisabled(),true);
    pending.release();await page.locator('#followup-response-status').filter({hasText:'Ответ по КП, версия 2, получен'}).waitFor();await page.unroute('**/api/client/lead/quotes/*/response',pending.handler);
    assert.equal(posts().length,1);assert.equal(posts()[0].postDataJSON().quoteId,second.id);assert.equal(posts()[0].postDataJSON().comment,'Ответ изменён во время обновления');assert.equal(await page.locator('#followup-refresh').isEnabled(),true);
    await pick('reprice');await page.locator('#followup-response-comment').fill('Сохранённый комментарий к снятому КП');await portalAction('withdrawQuote');
    await page.locator('#followup-refresh').click();await refreshed();assert.equal(await page.locator('#followup-quote').isHidden(),true);assert.equal(await page.locator('#followup-response').isVisible(),true);assert.equal(await page.locator('#followup-response-comment').inputValue(),'Сохранённый комментарий к снятому КП');
    assert.equal(await page.locator('#followup-response-submit').isHidden(),true);assert.equal(await page.locator('#followup-response-draft-actions').isVisible(),true);
    await page.locator('#followup-response-form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.equal(posts().length,1,'withdrawn quote cannot receive an old answer');
    await page.locator('#followup-refresh').click();await refreshed();assert.equal(await page.locator('#followup-response-comment').inputValue(),'Сохранённый комментарий к снятому КП','repeated refresh with no quote retains detached draft');
    await page.locator('#followup-response-transfer').click();assert.equal(await page.locator('[name=comment]').inputValue(),'Материалы: изменено во время обновления\n\nСохранённый комментарий к снятому КП');assert.equal(await page.locator('#followup-selected-files li').count(),1);assert.equal(await page.locator('#followup-response').isHidden(),true);
    pending=await delayed('**/api/client/lead/append');await page.locator('#followup-submit').click();await pending.began;assert.equal(await page.locator('#followup-refresh').isDisabled(),true);pending.release();await page.locator('#followup-send-status').filter({hasText:'Дополнение получено'}).waitFor();await page.unroute('**/api/client/lead/append',pending.handler);
    assert.equal(await page.locator('#followup-selected-files li').count(),0);assert.match(await page.locator('#followup-updates').innerText(),/portal18-plan.txt/);assert.match(await page.locator('#followup-updates').innerText(),/Сохранённый комментарий к снятому КП/);assert.equal(await page.locator('#followup-refresh').isEnabled(),true);
    await portalAction('publishQuote',{quoteId:second.id});await page.locator('#followup-refresh').click();await refreshed();await pick('discuss');await page.locator('#followup-response-comment').fill('Комментарий для явного удаления');await portalAction('withdrawQuote');await page.locator('#followup-refresh').click();await refreshed();await page.locator('#followup-response-discard').click();assert.equal(await page.locator('#followup-response-comment').inputValue(),'');assert.equal(await page.locator('#followup-response').isHidden(),true);
    // An old GET receipt must not revive private data after pagehide scrubbing.
    pending=await delayed(getRoute);await page.locator('#followup-refresh').click();await pending.began;await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));await scrubbed();pending.release();await page.unroute(getRoute,pending.handler);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await scrubbed();
    for(const code of [401,403,404,410]){
      await open();await page.locator('[name=comment]').fill('Закрытые материалы');await page.locator('#followup-files').setInputFiles({name:'private18.txt',mimeType:'text/plain',buffer:Buffer.from('Закрытый файл')});
      const denied=route=>route.fulfill({status:code,json:{error:'Ссылка недоступна.'}});await page.route(getRoute,denied);await page.locator('#followup-refresh').click();await page.locator('#followup-load-status').filter({hasText:'Ссылка недоступна'}).waitFor();await scrubbed();await page.unroute(getRoute,denied);
    }
    await open();await portalAction('publishQuote',{quoteId:second.id});await page.locator('#followup-refresh').click();await refreshed();await page.locator('[name=comment]').fill('Материалы до отказа доступа');await pick('discuss');await page.locator('#followup-response-comment').fill('Ответ до отказа доступа');
    let releaseDenied,denyStarted;const deniedGate=new Promise(resolve=>{releaseDenied=resolve;releaseGates.push(resolve);}),deniedBegan=new Promise(resolve=>{denyStarted=resolve;});
    const denyOldFile=async route=>{denyStarted();await deniedGate;await route.fulfill({status:401,json:{error:'Доступ закрыт.'}}).catch(()=>{});},secondFile='**/api/client/lead/quotes/'+second.id+'/file';
    await page.route(secondFile,denyOldFile);await page.locator('#followup-quote-download').click();await deniedBegan;await portalAction('withdrawQuote');await page.locator('#followup-refresh').click();await refreshed();releaseDenied();await page.locator('#followup-load-status').filter({hasText:'Ссылка недоступна'}).waitFor();await scrubbed();await page.unroute(secondFile,denyOldFile);
    await open();await portalAction('revoke');await page.locator('#followup-refresh').click();await page.locator('#followup-load-status').filter({hasText:'Ссылка недоступна'}).waitFor();await scrubbed();
    const another=await portalAction('issue'),validURL=new URL(another.url,base).href;await page.goto(validURL,{waitUntil:'networkidle'});await page.locator('#followup-content').waitFor({state:'visible'});
    for(const width of [320,390,1440]){await page.setViewportSize({width,height:width===1440?1000:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'portal refresh fits '+width);assert.ok((await page.locator('#followup-refresh').boundingBox()).height>=44);if(shots)await page.screenshot({path:path.join(shots,'portal18-refresh-'+width+'.png'),fullPage:true});}
    assert.ok(!requests.some(request=>/\/api\/events|metrika|analytics/i.test(request.url())),'manual status refresh has no analytics or polling');assert.ok(requests.filter(request=>['fetch','xhr','script','stylesheet','image'].includes(request.resourceType())).every(request=>!request.url().includes(token)),'token remains a fragment or Bearer header');assert.deepEqual(errors,[]);
    console.log('PASS v18 client portal: real status/quote/append/response APIs, edits and files survive refresh/error, fresh choice after replacement, explicit withdrawn-comment transfer/discard, disabled refresh during mutations, late-reply guards, access scrubbing, 320/390/1440 and no analytics');
  }finally{releaseGates.forEach(release=>release());await context.close();await api(leadBase,'DELETE');}
}
