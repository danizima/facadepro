import assert from 'node:assert/strict';
import path from 'node:path';
export async function verifyRelease11({page,base,shots}){
 await page.goto(base+'/');await page.evaluate(()=>{localStorage.removeItem('facade_compare');localStorage.removeItem('facade_selection');});
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:900});await page.goto(base+'/projects/museum.html',{waitUntil:'networkidle'});
  const selectors=page.locator('[data-period-select]');assert.equal(await selectors.count(),2);
  const before=await selectors.evaluateAll(nodes=>nodes.map(n=>n.value));
  await page.locator('[data-period-swap]').click();assert.deepEqual(await selectors.evaluateAll(nodes=>nodes.map(n=>n.value)),before.reverse());
  await selectors.first().selectOption('1');
  assert.equal(await page.locator('.period-panel').first().locator('img').getAttribute('alt'),JSON.parse(await page.locator('#period-data').textContent())[1].caption);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'museum comparison fits '+width);
  if(width===1440)await page.locator('#period-comparison').screenshot({path:path.join(shots,'period-comparison-v11.png')});
  if(width>1100)await page.locator('.header-contact').click();else{await page.locator('.menu-toggle').click();await page.locator('.nav-request').click();}
  await page.locator('#contact-dialog').waitFor({state:'visible'});assert.equal(await page.locator('main').evaluate(el=>el.inert),false);
  assert.match(await page.locator('[data-contact-photo]').getAttribute('href'),/project=museum/);
  assert.ok(await page.locator('#contact-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'contact fits '+width);
  if(width===390)await page.screenshot({path:path.join(shots,'contact-v11-mobile.png')});
  await page.keyboard.press('Escape');assert.equal(await page.locator('#contact-dialog').isVisible(),false);
  if(width>1100)await page.locator('.header-contact').click();else await page.locator('.mobile-actions [data-contact-open]').click();
  await page.locator('[data-contact-photo]').click();assert.match(await page.locator('#photo-project-context').innerText(),/Музейно/);
  await page.goto(base+'/photo-request.html?project=not-published',{waitUntil:'networkidle'});assert.equal(await page.locator('#photo-project-context').isVisible(),false);
 }
 await page.setViewportSize({width:1440,height:1000});
 console.log('PASS v11: dated comparison, switching and swapping, accessible contact chooser, mobile menu/dialog focus, project photo context');
}
