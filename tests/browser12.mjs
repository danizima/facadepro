import assert from 'node:assert/strict';
import path from 'node:path';
export async function verifyRelease12({page,base,shots}){
 await page.goto(base+'/');await page.evaluate(()=>localStorage.removeItem('facade_compare'));
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:900});
  for(const id of ['museum','burny','restaurant']){
   await page.goto(base+'/projects/'+id+'.html',{waitUntil:'networkidle'});assert.equal(await page.locator('#case-chapters').count(),1);assert.ok(await page.locator('.case-chapter').count()>=2);
   await page.locator('.chapter-photo').first().click();await page.locator('.lightbox').waitFor({state:'visible'});await page.keyboard.press('Escape');
   if(width===390&&id==='museum'){const count=await page.locator('.gallery-thumb').count();for(let i=1;i<count;i++)await page.locator('.stage-gallery-controls [data-gallery-step="1"]').click();await page.waitForFunction(()=>{const list=document.querySelector('.gallery-thumbs').getBoundingClientRect(),active=document.querySelector('.gallery-thumb[aria-pressed="true"]').getBoundingClientRect();return active.left>=list.left-1&&active.right<=list.right+1;});}
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'project fits '+width+' '+id);
  }
  await page.goto(base+'/services/repair.html',{waitUntil:'networkidle'});
  await page.locator('[data-guide-step="1"] summary').click();await page.waitForFunction(()=>document.querySelector('.guide-diagram').dataset.guideActive==='1');
  assert.equal(await page.locator('.guide-step[open]').count(),1);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'guide fits '+width);
  await page.locator('[data-guide-step="2"] summary').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('.guide-diagram').dataset.guideActive==='2');
  assert.equal(await page.locator('video').getAttribute('preload'),'none');assert.equal(await page.locator('video').getAttribute('autoplay'),null);
  if(width===390)await page.locator('.service-guide').screenshot({path:path.join(shots,'guide-v12-mobile.png')});
 }
 await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/projects/restaurant.html',{waitUntil:'networkidle'});
 const download=page.waitForEvent('download');await page.locator('[data-project-pdf]').click();assert.match((await download).suggestedFilename(),/restaurant/);await page.locator('.project-pdf-status').filter({hasText:'Загрузка началась'}).waitFor();
 const videoRequests=[];page.on('request',r=>{if(r.url().endsWith('facade-survey.mp4'))videoRequests.push(r.url());});await page.goto(base+'/about.html',{waitUntil:'networkidle'});assert.equal(videoRequests.length,0,'film does not load before play');
 await page.locator('video').scrollIntoViewIfNeeded();await page.locator('video').evaluate(v=>v.play());await page.waitForFunction(()=>document.querySelector('video').currentTime>0);assert.ok(videoRequests.length>0);
 await page.locator('video').evaluate(v=>v.pause());await page.locator('.field-team').screenshot({path:path.join(shots,'team-v12-desktop.png')});
 await page.setViewportSize({width:390,height:844});await page.goto(base+'/',{waitUntil:'networkidle'});const hero=await page.locator('.architecture-slide:not([hidden]) img').evaluate(async i=>{const source=new Image();source.src=i.currentSrc;await source.decode();return {src:i.currentSrc,width:source.naturalWidth,display:i.getBoundingClientRect().width};});assert.ok(hero.width>=hero.display);assert.ok(hero.width<=1280,'mobile hero does not load the 2250px original');
 console.log('PASS v12: distinct stories, gallery links, keyboard guides, mobile layouts, project PDF, video deferred/playback and responsive hero');
 await page.setViewportSize({width:1440,height:1000});
}
