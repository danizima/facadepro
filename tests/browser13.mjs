import assert from 'node:assert/strict';
import path from 'node:path';

const normalize=value=>value.replace(/\s+/g,' ').trim();
const fits=async(page,label)=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label);

async function decodedImage(locator){
 await locator.scrollIntoViewIfNeeded();
 return locator.evaluate(async img=>{
  await img.decode();
  const source=new Image();source.src=img.currentSrc;await source.decode();
  return {src:img.currentSrc,width:source.naturalWidth,height:source.naturalHeight,display:img.getBoundingClientRect().width};
 });
}

export async function verifyRelease13({page,base,shots}){
 await page.setViewportSize({width:1440,height:1000});
 await page.goto(base+'/',{waitUntil:'networkidle'});
 assert.equal(await page.locator('.home-entry-paths>a').count(),3);
 assert.deepEqual(await page.locator('.home-entry-paths>a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href'))),['quote.html','photo-request.html','kit.html']);
 assert.equal(await page.locator('.architecture-actions>.button').getAttribute('href'),'quote.html');
 await page.locator('.architecture-actions>.button').click();
 await page.locator('#request-form[data-kind="quote"]').waitFor();
 assert.equal(await page.locator('#request-form [name=kind]').inputValue(),'quote');
 for(const [label,url,target] of [
  ['Есть проект','quote.html','#request-form[data-kind="quote"]'],
  ['Есть проблема','photo-request.html','#photo-request-form'],
  ['Проверяю подрядчика','kit.html','#contractor-kit'],
 ]){
  await page.goto(base+'/',{waitUntil:'networkidle'});
  await page.locator('.home-entry-paths>a').filter({hasText:label}).click();
  assert.equal(new URL(page.url()).pathname,'/'+url);
  await page.locator(target).waitFor();
 }

 const response=await page.request.get(base+'/api/public/projects');assert.equal(response.status(),200);
 const data=await response.json();
 for(const id of ['museum','burny','golden-horn','novy','restaurant','brusnika','dvfu']){
  const project=data.projects.find(p=>p.id===id);assert.ok(project);
  await page.goto(base+'/projects/'+id+'.html',{waitUntil:'networkidle'});
  const brief=page.locator('.project-brief');assert.equal(await brief.count(),1,'participation brief: '+id);
  const text=normalize(await brief.innerText());assert.ok(text.includes(normalize(project.volume)),'volume in brief: '+id);
  assert.ok(text.includes(normalize(project.case.result)),'CMS outcome in brief: '+id);
  if(id==='museum')assert.match(text,/июнь 2026/);
  const photo=page.locator(id==='museum'?'.museum-cover':'.project-gallery').first();
  assert.ok(await brief.evaluate((node,selector)=>Boolean(node.compareDocumentPosition(document.querySelector(selector))&Node.DOCUMENT_POSITION_FOLLOWING),id==='museum'?'.museum-cover':'.project-gallery'),'facts before photos: '+id);
  assert.ok(await photo.count()>0);
 }

 await page.goto(base+'/compare.html?projects=burny,golden-horn',{waitUntil:'networkidle'});
 await page.locator('.compare-table').waitFor();
 for(const label of ['Особенности объекта','Решение и этапы','Результат / участие']){
  const row=page.locator('.compare-table tbody tr').filter({has:page.locator('th',{hasText:new RegExp('^'+label+'$')})});
  assert.equal(await row.count(),1,label);
  assert.ok((await row.locator('td').allTextContents()).every(value=>value.trim()&&!/Не указано|Нет данных/.test(value)),'both project cases populated: '+label);
 }
 await page.locator('#compare-result').screenshot({path:path.join(shots,'compare-v13-desktop.png')});

 // Empty editorial facts must disappear as rows without erasing other facts.
 const sparse=structuredClone(data);
 for(const project of sparse.projects)project.case={};
 await page.route('**/api/public/projects',route=>route.fulfill({json:sparse}));
 try{
  await page.goto(base+'/compare.html?projects=burny,golden-horn',{waitUntil:'networkidle'});
  await page.locator('.compare-table').waitFor();
  assert.equal(await page.locator('.compare-table tbody th').filter({hasText:/^(Особенности объекта|Решение и этапы|Результат \/ участие)$/}).count(),0);
  assert.match(await page.locator('.compare-table tbody').innerText(),/Ремонт и восстановление алюминиевого фасада/);
 }finally{await page.unroute('**/api/public/projects');}

 for(const width of [1024,768,390,320]){
  await page.setViewportSize({width,height:900});
  for(const route of ['/','/projects/golden-horn.html','/projects/novy.html','/compare.html?projects=burny,golden-horn']){
   await page.goto(base+route,{waitUntil:'networkidle'});
   if(route.includes('compare'))await page.locator(width<=700?'.compare-mobile':'.compare-table').waitFor();
   await fits(page,'v13 page fits '+width+' '+route);
   if(route==='/'&&[768,390].includes(width)){
    await page.locator('.home-entry-paths').screenshot({path:path.join(shots,'entry-v13-'+width+'.png')});
    await page.locator('.home-proof').screenshot({path:path.join(shots,'proof-v13-'+width+'.png')});
   }
  }
 }

 // Fresh high-DPI contexts prevent a previous desktop image cache from hiding
 // a broken responsive variant (the original regression was the 1280 WebP).
 const browser=page.context().browser();assert.ok(browser);
 for(const dpr of [2,3]){
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:dpr,reducedMotion:'reduce'});
  try{
   await context.addInitScript(()=>{try{localStorage.setItem('facade_statistics','no');}catch{}});
   const mobile=await context.newPage(),errors=[];mobile.setDefaultTimeout(12000);mobile.on('pageerror',error=>errors.push(error.message));
   await mobile.goto(base+'/',{waitUntil:'networkidle'});
   const hero=await decodedImage(mobile.locator('.architecture-slide:not([hidden]) img'));
   assert.ok(hero.width>=hero.display&&hero.height>0,'decoded DPR '+dpr+' hero');
   assert.match(hero.src,/-1280\.webp$/,'responsive mobile hero DPR '+dpr);
   const card=await decodedImage(mobile.locator('.proof-image[href="projects/golden-horn.html"] img'));
   assert.match(card.src,/golden-horn-1280\.webp$/);assert.equal(card.width,1280);assert.ok(card.height>0);
   await fits(mobile,'DPR '+dpr+' home fits');
   await mobile.goto(base+'/projects/golden-horn.html',{waitUntil:'networkidle'});
   const golden=await decodedImage(mobile.locator('.gallery-stage>img'));
   assert.match(golden.src,/golden-horn-1280\.webp$/);assert.equal(golden.width,1280);assert.ok(golden.height>0);
   const bytes=await mobile.request.get(golden.src);assert.equal(bytes.status(),200);assert.ok((await bytes.body()).length>0);
   await fits(mobile,'DPR '+dpr+' Golden Horn fits');
   await mobile.locator('.gallery-stage').screenshot({path:path.join(shots,'golden-horn-v13-dpr'+dpr+'.png')});
   assert.deepEqual(errors,[]);
  }finally{await context.close();}
 }
 // Reuse the authenticated staff session; inspect status without changing
 // passwords, starting maintenance, or restoring any data.
 await page.setViewportSize({width:390,height:844});
 await page.goto(base+'/admin/',{waitUntil:'networkidle'});
 await page.locator('#admin-shell').waitFor({state:'visible'});
 await page.locator('[data-tab=account]').click();
 await page.locator('#maintenance-summary .admin-facts').waitFor({state:'visible'});
 assert.match(await page.locator('.account-maintenance h2').innerText(),/Резервные копии/);
 assert.deepEqual(await page.locator('#maintenance-summary dt').allTextContents(),['Состояние','Последняя копия','Последняя проверка','Последняя попытка','Расписание']);
 assert.ok((await page.locator('#maintenance-summary dd').allTextContents()).every(value=>value.trim()));
 assert.match(await page.locator('.maintenance-note').innerText(),/Заявки в работе.*сохраняются/);
 await fits(page,'staff backup status fits 390px');
 await page.locator('.account-maintenance').screenshot({path:path.join(shots,'maintenance-v13-mobile.png')});
 await page.setViewportSize({width:1440,height:1000});
 console.log('PASS v13: three enquiry paths, quote form, shared project facts, populated/empty comparison rows, tablet/mobile layouts, decoded 1280px images at DPR 2/3 and staff backup status');
}
