import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifyAudiences15({page:hostPage,base,shots}){
 const context=await hostPage.context().browser().newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
 await page.addInitScript(()=>{try{localStorage.setItem('facade_statistics','no');}catch{}});
 page.on('pageerror',error=>errors.push(error.message));
 try{
  for(const route of ['for-contractors.html','for-owners.html']){
   await page.goto(base+'/'+route,{waitUntil:'networkidle'});assert.equal(await page.locator('h1').count(),1);
   assert.equal(await page.locator('#audience-cases .project-card').count(),route==='for-contractors.html'?3:2);
   const images=await page.locator('.audience-hero15-photo img').evaluateAll(nodes=>nodes.map(node=>({complete:node.complete,width:node.naturalWidth})));
   assert.ok(images.length&&images.every(image=>image.complete&&image.width>0),'real hero photo loads for '+route);
   await page.locator('.audience-projects15 img').evaluateAll(async nodes=>{for(const image of nodes)image.loading='eager';await Promise.all(nodes.map(image=>image.decode()));});
   for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:width===1440?1000:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),route+' fits '+width);
    if(shots&&width===390)await page.screenshot({path:path.join(shots,route.replace('.html','-v15-mobile.png')),fullPage:true});
    if(shots&&width===1440)await page.screenshot({path:path.join(shots,route.replace('.html','-v15-desktop.png'))});
   }
   await page.locator('.audience-nav15 a[href="#audience-inputs"]').click();assert.ok(page.url().endsWith('#audience-inputs'));
   assert.ok(await page.locator('#audience-inputs').isVisible());
  }
  await page.goto(base+'/for-contractors.html',{waitUntil:'networkidle'});
  await page.locator('.audience-brief15 [name=scope]').selectOption('supply-installation');
  await page.locator('.audience-brief15 [name=deadline]').fill('2026-11-17');
  await page.locator('.audience-brief15 button').click();
  await page.locator('#request-form [name=audience]').waitFor({state:'attached'});
  assert.equal(new URL(page.url()).pathname,'/quote.html');
  assert.equal(await page.locator('#request-form [name=audience]').inputValue(),'contractor');
  assert.equal(await page.locator('#request-form [name=scope]').inputValue(),'supply-installation');
  assert.equal(await page.locator('#request-form [name=deadline]').inputValue(),'2026-11-17');
  assert.equal(await page.locator('#request-form [name=service][value=glazing]').isChecked(),true);
  assert.match(await page.locator('#request-form [name=comment]').inputValue(),/Тендерный расчёт/);
  assert.match(await page.locator('#request-form [name=comment]').inputValue(),/Границы поставки и монтажа/);
  await page.goto(base+'/for-owners.html',{waitUntil:'networkidle'});
  await page.locator('.audience-choice15 a[href^="request.html"]').click();
  await page.locator('#request-form [name=audience]').waitFor({state:'attached'});
  assert.equal(await page.locator('#request-form [name=audience]').inputValue(),'owner');
  assert.equal(await page.locator('#request-form [name=service][value=repair]').isChecked(),true);
  assert.match(await page.locator('#request-form [name=comment]').inputValue(),/история|Когда проявляется/);
  await page.goto(base+'/for-owners.html',{waitUntil:'networkidle'});
  await page.locator('.audience-hero15 a[href^="photo-request.html"]').click();
  await page.locator('#photo-request-form').waitFor();
  assert.match(await page.locator('#photo-request-form [name=comment]').inputValue(),/Собственник здания/);
  assert.match(await page.locator('#photo-request-form [name=comment]').inputValue(),/часы работы/);
  await page.evaluate(()=>localStorage.clear());
  await page.goto(base+'/quote.html?audience=contractor&context=tender&deadline='+encodeURIComponent('<img id="audience15-xss" src=x onerror=alert(1)>'),{waitUntil:'networkidle'});
  assert.equal(await page.locator('#audience15-xss').count(),0);assert.equal(await page.locator('#request-form [name=deadline]').inputValue(),'');
  await page.evaluate(()=>localStorage.clear());
  await page.goto(base+'/quote.html?audience=contractor&context=tender&deadline=2026-02-30',{waitUntil:'networkidle'});
  assert.equal(await page.locator('#request-form [name=deadline]').inputValue(),'');
  await page.goto(base+'/',{waitUntil:'networkidle'});
  assert.equal(await page.locator('.audience-entry15 a[href="for-contractors.html"]').count(),1);assert.equal(await page.locator('.audience-entry15 a[href="for-owners.html"]').count(),1);
  await page.goto(base+'/contractors.html',{waitUntil:'networkidle'});assert.equal(await page.locator('.audience-route15 a[href="for-contractors.html"]').count(),1);
  await page.goto(base+'/about.html',{waitUntil:'networkidle'});
  assert.equal(await page.locator('#audience-panel-contractor a[href="for-contractors.html"]').count(),1);assert.equal(await page.locator('#audience-panel-owner a[href="for-owners.html"]').count(),1);
  assert.deepEqual(errors,[]);
  console.log('PASS v15 audience UI: real tender/owner pages, credited imagery, 1440/390/320 layouts, role/service/scope/deadline briefs, contextual photo request, safe prefill and discovery links');
 }finally{await context.close();}
}
