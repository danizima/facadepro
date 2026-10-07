import assert from 'node:assert/strict';
import path from 'node:path';

// A fixture-driven UI contract check; backend publication/authorization has a separate suite.
export async function verifyClient15({page:hostPage,base,shots}){
  const context=await hostPage.context().browser().newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();page.setDefaultTimeout(12000);
  const token='a'.repeat(64),wrong='b'.repeat(64),quoteId='14048025-fb1d-4d1a-8859-c50f7576e58a';
  const root='/api/client/lead/quotes/'+quoteId,pdf=Buffer.from('%PDF-1.4\nClient quotation\n%%EOF\n');
  const privateHeaders={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
  const quote={id:quoteId,version:3,name:'КП ФАСАД.PRO.pdf',size:pdf.length,amount:'1030000.75',timeframe:'35 рабочих дней',publishedAt:'2026-10-07T03:20:00.000Z',downloadApi:root+'/file',viewApi:root+'/view',note:'CLIENT15_STAFF_NOTE',fileKey:'CLIENT15_STORAGE_KEY'};
  const lead={reference:'ФП-CLIENT15',statusLabel:'КП подготовлено',customerMessage:'Согласуем состав работ.',manager:{name:'Менеджер проекта'},expiresAt:'2027-01-05T03:20:00.000Z',updates:[],quote};
  let state=200,showQuote=true,fileStatus=200,fileContentType='application/pdf',views=0,fileGets=0,appends=0,slowFile=null;
  const observed=[],downloads=[],errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('download',download=>downloads.push(download));
  page.on('request',request=>observed.push({url:request.url(),method:request.method(),type:request.resourceType()}));
  await context.addCookies([{name:'private-sentinel',value:'must-not-send',url:base}]);
  await page.route('**/api/client/lead**',async route=>{
    const request=route.request(),url=new URL(request.url()),headers=await request.allHeaders();
    assert.equal(url.search,'','bearer token never appears in API query');
    assert.ok(!headers.referer,'private fetches omit referrer');
    if(request.method()!=='POST'||url.pathname!== '/api/client/lead/append')assert.ok(!headers.cookie,'private fetches omit ambient cookies');
    if(headers.authorization!=='Bearer '+token||state!==200){await route.fulfill({status:headers.authorization!=='Bearer '+token?404:state,headers:privateHeaders,json:{error:'Личная ссылка недоступна.'}});return;}
    if(url.pathname==='/api/client/lead'&&request.method()==='GET'){await route.fulfill({status:200,headers:privateHeaders,json:{...lead,quote:showQuote?quote:null}});return;}
    if(url.pathname===root+'/file'&&request.method()==='GET'){
      fileGets++;if(slowFile){const wait=slowFile;slowFile=null;await wait;}
      await route.fulfill({status:fileStatus,headers:privateHeaders,contentType:fileContentType,body:fileStatus===200?pdf:Buffer.from('{}')}).catch(()=>{});return;
    }
    if(url.pathname===root+'/view'&&request.method()==='POST'){views++;await route.fulfill({status:200,headers:privateHeaders,json:{ok:true}});return;}
    if(url.pathname==='/api/client/lead/append'&&request.method()==='POST'){
      appends++;assert.match(request.postData(),/Вопрос по КП, версия 3:/);
      await route.fulfill({status:200,headers:privateHeaders,json:{received:true,lead:{...lead,quote:showQuote?quote:null,updates:[{createdAt:'2026-10-07T03:30:00.000Z',comment:'Вопрос по КП, версия 3: Уточните срок.'}]}}});return;
    }
    await route.fulfill({status:404,headers:privateHeaders,json:{error:'Недоступно'}});
  });
  const open=async(value=token)=>{const url=base+'/followup.html#'+value;if(page.url()===url)await page.reload({waitUntil:'networkidle'});else await page.goto(url,{waitUntil:'networkidle'});};
  const visible=()=>page.locator('#followup-content').waitFor({state:'visible'});
  const hidden=()=>page.locator('#followup-content').waitFor({state:'hidden'});
  const scrubbed=async()=>{
    assert.equal(await page.locator('#followup-quote').isHidden(),true);
    for(const id of ['reference','manager','quote-name','quote-amount','quote-timeframe','quote-date'])assert.equal(await page.locator('#followup-'+id).textContent(),'','private metadata scrubbed: '+id);
    assert.equal(await page.locator('#followup-content a[href^="blob:"]').count(),0);
  };
  try{
    const shell=await page.request.get(base+'/followup.html');assert.equal(shell.status(),200);
    assert.match(shell.headers()['cache-control'],/no-store/);assert.equal(shell.headers()['referrer-policy'],'no-referrer');assert.match(shell.headers()['x-robots-tag'],/noindex/);
    await open();await visible();await page.locator('#followup-quote').waitFor({state:'visible'});
    assert.match(await page.locator('#followup-quote-amount').innerText(),/1\s030\s000,75\s₽/);
    assert.equal(await page.locator('#followup-quote-timeframe').innerText(),'35 рабочих дней');
    assert.equal(await page.locator('#followup-quote-name').innerText(),quote.name);
    assert.match(await page.locator('#followup-quote-date').innerText(),/2026/);
    assert.match(await page.locator('#followup-quote-version').innerText(),/Версия 3/);
    assert.equal(views,0,'displaying a quotation does not claim it was opened');
    assert.equal(fileGets,0,'PDF requested only on explicit download');
    assert.equal(await page.locator('script[src]').count(),1);
    assert.equal(await page.locator('meta[name=referrer]').getAttribute('content'),'no-referrer');
    assert.equal(await page.locator('meta[name=robots]').getAttribute('content'),'noindex,nofollow,noarchive');
    assert.doesNotMatch(await page.locator('body').innerText(),/CLIENT15_STAFF_NOTE|CLIENT15_STORAGE_KEY/);
    for(const width of [390,320]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'quotation fits '+width);}
    await page.setViewportSize({width:390,height:844});
    if(shots)await page.screenshot({path:path.join(shots,'client-quote-v15-mobile.png'),fullPage:true});

    fileContentType='text/html';await page.locator('#followup-quote-download').click();
    await page.locator('#followup-quote-feedback').filter({hasText:'Не удалось скачать'}).waitFor();
    assert.equal(downloads.length,0);assert.equal(views,0,'invalid PDF response records no view');fileContentType='application/pdf';
    const viewedResponse=page.waitForResponse(response=>response.url().endsWith('/view')&&response.request().method()==='POST');
    let download=page.waitForEvent('download');await page.locator('#followup-quote-download').click();assert.equal((await download).suggestedFilename(),quote.name);
    await page.waitForFunction(()=>document.querySelector('#followup-quote-feedback').textContent.includes('подготовлен'));
    await viewedResponse;
    assert.equal(views,1,'successful PDF action records an explicit open event');
    download=page.waitForEvent('download');await page.locator('#followup-quote-download').click();await download;
    assert.equal(views,1,'repeat download is deduplicated within this authorization generation');
    assert.equal(await page.locator('a[href*="/api/client/lead/quotes/"]').count(),0,'PDF endpoint never becomes an unauthenticated navigation');

    await page.locator('#followup-quote-question').click();assert.equal(await page.locator('[name=comment]').inputValue(),'Вопрос по КП, версия 3: ');
    assert.equal(await page.evaluate(()=>document.activeElement.name),'comment');
    await page.locator('[name=comment]').fill('Мой черновик');await page.locator('#followup-quote-question').click();assert.equal(await page.locator('[name=comment]').inputValue(),'Мой черновик');
    await page.locator('[name=comment]').fill('Вопрос по КП, версия 3: Уточните срок.');await page.locator('#followup-submit').click();await page.locator('#followup-send-status').filter({hasText:'Дополнение получено'}).waitFor();
    assert.equal(appends,1,'quotation questions use the existing addition route');assert.match(await page.locator('.followup-update').innerText(),/Уточните срок/);
    quote.publishedAt='2026-10-07T03:31:00.000Z';
    await page.locator('[name=comment]').fill('Вопрос по КП, версия 3: Новый вопрос.');await page.locator('#followup-submit').click();await page.locator('#followup-send-status').filter({hasText:'Дополнение получено'}).waitFor();
    const republishedView=page.waitForResponse(response=>response.url().endsWith('/view')&&response.request().method()==='POST');
    download=page.waitForEvent('download');await page.locator('#followup-quote-download').click();await download;await republishedView;assert.equal(views,2,'republishing the same quote starts a fresh publication receipt');

    showQuote=false;await page.reload({waitUntil:'networkidle'});await visible();assert.equal(await page.locator('#followup-quote').isHidden(),true);assert.equal(await page.locator('#followup-quote-name').textContent(),'');
    showQuote=true;quote.name='<img id="client15-xss" src=x onerror="alert(1)">.pdf';await page.reload({waitUntil:'networkidle'});await visible();assert.equal(await page.locator('#client15-xss').count(),0);assert.equal(await page.locator('#followup-quote-name').innerText(),quote.name);quote.name='КП ФАСАД.PRO.pdf';

    await page.evaluate(value=>{location.hash=value;},wrong);await page.locator('#followup-load-status').filter({hasText:'недоступна'}).waitFor();await hidden();await scrubbed();
    await open();await visible();state=410;await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await page.locator('#followup-load-status').filter({hasText:'недоступна'}).waitFor();await hidden();await scrubbed();

    state=200;await open();await visible();fileStatus=404;await page.locator('#followup-quote-download').click();await hidden();await scrubbed();fileStatus=200;
    await page.reload({waitUntil:'networkidle'});await visible();let releaseFile;slowFile=new Promise(resolve=>{releaseFile=resolve;});const priorDownloads=downloads.length;
    const fileStarted=page.waitForRequest(request=>request.url().endsWith('/file'));
    await page.locator('#followup-quote-download').click();await fileStarted;await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));await hidden();releaseFile();await scrubbed();
    assert.equal(downloads.length,priorDownloads,'stale PDF response after pagehide cannot create a download');
    state=410;await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await page.locator('#followup-load-status').filter({hasText:'недоступна'}).waitFor();await hidden();
    await page.goto(base+'/followup.html',{waitUntil:'networkidle'});await page.locator('#followup-load-status').filter({hasText:'Проверьте личную ссылку'}).waitFor();await hidden();
    assert.ok(observed.filter(row=>['fetch','xhr','script','stylesheet','image'].includes(row.type)).every(row=>!row.url.includes(token)&&!row.url.includes(wrong)),'no bearer fragment leaks into resource URLs');
    assert.ok(!observed.some(row=>/\/api\/events|metrika|google-analytics|analytics/i.test(row.url)),'private portal runs no public analytics');
    assert.deepEqual(errors,[]);
    console.log('PASS v15 client UI: approved quote metadata, 390/320 widths, explicit authenticated PDF action, view dedupe, question append/draft preservation, no quote/XSS, hash reauthorization, expiry/BFCache, scrubbed revoked/stale responses and no public analytics');
  }finally{await context.close();}
}
