import assert from 'node:assert/strict';
import path from 'node:path';
export async function verifyRelease10({page,base,shots}){
 await page.goto(base+'/',{waitUntil:'networkidle'});
 await page.evaluate(()=>localStorage.removeItem('facade_compare'));
 for(const width of [1440,1024,768,390,320]){
  await page.setViewportSize({width,height:900});await page.goto(base+'/',{waitUntil:'networkidle'});
  const photo=page.locator('.architecture-slide:not([hidden]) .hero-photo-link img');await photo.evaluate(img=>img.decode());
  assert.ok(!(await photo.getAttribute('src')).includes('-small'));
  const clarity=await photo.evaluate(img=>{const box=img.getBoundingClientRect();return {natural:[img.naturalWidth,img.naturalHeight],rendered:[box.width,box.height],filter:getComputedStyle(img).filter};});
  assert.ok(clarity.rendered[0]<=clarity.natural[0]&&clarity.rendered[1]<=clarity.natural[1],'No image upscaling '+width+' '+JSON.stringify(clarity));
  assert.equal(clarity.filter,'none');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'home fits '+width);
  await page.locator('[data-hero-next]').click();assert.equal(await page.locator('[data-hero-tab="1"]').getAttribute('aria-selected'),'true');
  await page.locator('[data-hero-prev]').click();
  if(width<=1100){
   await page.locator('.menu-toggle').click();assert.equal(await page.locator('.navigation').isVisible(),true);assert.equal(await page.locator('main').evaluate(el=>el.inert),true);
   assert.equal(await page.locator('.nav-primary a').first().evaluate(el=>el===document.activeElement),true);
   await page.locator('.menu-toggle').focus();await page.keyboard.press('Tab');assert.equal(await page.locator('.header').evaluate(el=>el.contains(document.activeElement)),true);
   if(width===390)await page.screenshot({path:path.join(shots,'menu-v10-mobile.png')});
   await page.keyboard.press('Escape');assert.equal(await page.locator('.navigation').isVisible(),false);assert.equal(await page.locator('main').evaluate(el=>el.inert),false);
   await page.locator('.menu-toggle').click();await page.locator('.nav-shortcuts a[href="kit.html"]').click();await page.locator('#contractor-kit').waitFor();
   assert.equal(await page.locator('.mobile-actions').count(),0);
   await page.goto(base+'/',{waitUntil:'networkidle'});
  }
  if(width===1440||width===390)await page.screenshot({path:path.join(shots,'home-v10-'+(width===1440?'desktop':'mobile')+'.png')});
  await page.goto(base+'/projects.html',{waitUntil:'networkidle'});
  const details=page.locator('.catalog-more');assert.equal(await details.getAttribute('open')!==null,width>800);
  if(width<=800)await details.locator('summary').click();
  await page.locator('#catalog-service').selectOption('repair');assert.equal(await page.locator('.catalog-grid .project-card:visible').count(),2);
  await page.locator('#reset-filters').click();assert.equal(await page.locator('.catalog-grid .project-card:visible').count(),11);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'catalog fits '+width);
  if(width===1440||width===390)await page.screenshot({path:path.join(shots,'catalog-v10-'+(width===1440?'desktop':'mobile')+'.png'),fullPage:width===390});
  for(const route of ['/projects/museum.html','/projects/restaurant.html','/services.html','/request.html']){
   await page.goto(base+route,{waitUntil:'networkidle'});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),route+' fits '+width);
   if(width===390&&route==='/projects/museum.html')await page.screenshot({path:path.join(shots,'museum-v10-mobile.png'),fullPage:true});
  }
 }
 await page.setViewportSize({width:390,height:844});await page.goto(base+'/projects/museum.html',{waitUntil:'networkidle'});await page.locator('#project-gallery').scrollIntoViewIfNeeded();await page.locator('#project-gallery .gallery-stage>img').evaluate(img=>img.decode());assert.equal(await page.locator('.gallery-stage>img').evaluate(img=>getComputedStyle(img).objectFit),'scale-down');assert.ok(await page.locator('.gallery-thumbs').evaluate(el=>el.getBoundingClientRect().height<100),'Thumbnails remain compact');await page.locator('#project-gallery').screenshot({path:path.join(shots,'gallery-v10-mobile.png')});
 await page.goto(base+'/projects/restaurant.html',{waitUntil:'networkidle'});
 const thumbs=page.locator('[data-image]');if(await thumbs.count()>1){await thumbs.nth(1).click();const source=await page.locator('.gallery-stage>img').evaluate(img=>img.src);await page.locator('.gallery-zoom').click();assert.equal(await page.locator('.lightbox-image').getAttribute('src'),source);await page.keyboard.press('Escape');}
 await page.locator('[data-compare-image]').last().click();const comparison=page.locator('.comparison-before img');assert.equal(await comparison.getAttribute('srcset'),null);assert.match(await comparison.getAttribute('src'),/restaurant-build/);
 await page.goto(base+'/',{waitUntil:'networkidle'});const stage=page.locator('.architecture-stage');await stage.dispatchEvent('pointerdown',{pointerType:'touch',pointerId:7,clientX:300,clientY:550});await stage.dispatchEvent('pointerup',{pointerType:'touch',pointerId:7,clientX:100,clientY:555});assert.equal(await page.locator('[data-hero-tab="1"]').getAttribute('aria-selected'),'true');
 await page.setViewportSize({width:1440,height:1000});
 console.log('PASS v10: full-resolution hero, layout 1440/1024/768/390/320, menu keyboard/focus, filter disclosure, gallery source, comparison image and touch hero');
}
