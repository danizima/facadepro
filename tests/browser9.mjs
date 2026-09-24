import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
export async function verifyRelease9({page,base,shots}){
 await page.evaluate(()=>localStorage.removeItem('facade_compare'));
 await page.goto(base+'/tasks/leak.html',{waitUntil:'networkidle'});
 assert.match(await page.locator('h1').innerText(),/Устранить протечку/);
 await page.screenshot({path:path.join(shots,'task-v9-desktop.png')});
 await page.locator('.task-faq summary').first().click();assert.equal(await page.locator('.task-faq details[open]').count(),1);
 await page.locator('.task-lead .button').click();await page.locator('#request-form').waitFor();assert.equal(new URL(page.url()).searchParams.get('solution'),'leak');assert.deepEqual(await page.locator('[name=service]:checked').evaluateAll(els=>els.map(e=>e.value)),['repair','engineering']);
 await page.goto(base+'/kit.html',{waitUntil:'networkidle'});const submit=page.locator('#contractor-kit [type=submit]');await page.waitForFunction(()=>!document.querySelector('#contractor-kit [type=submit]').disabled);
 assert.equal(await page.locator('[name=project]:checked').count(),3);assert.equal(await page.locator('[name=document]').count(),0);
 await page.screenshot({path:path.join(shots,'kit-v9-desktop.png')});
 const pending=page.waitForEvent('download');await submit.click();const download=await pending;assert.equal((await readFile(await download.path())).subarray(0,4).toString('hex'),'504b0304');await page.locator('[data-kit-download]:visible').waitFor();
 await page.locator('[name=project]').first().uncheck();assert.equal(await page.locator('[data-kit-download]').isVisible(),false);
 await page.locator('.site-version').click();assert.match(await page.locator('.release-current').innerText(),/Текущая/);assert.equal(await page.locator('.release-number').first().innerText(),'9.0.0');
 for(const width of [390,320]){await page.setViewportSize({width,height:844});for(const route of ['/tasks/leak.html','/kit.html','/updates.html','/contractors.html']){await page.goto(base+route,{waitUntil:'networkidle'});const overflow=await page.evaluate(()=>({fits:document.documentElement.scrollWidth<=innerWidth+1,items:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,class:e.className,text:e.textContent.slice(0,50),right:e.getBoundingClientRect().right})).slice(0,12)}));assert.ok(overflow.fits,route+' fits '+width+' '+JSON.stringify(overflow.items));if(width===390&&route!='/contractors.html')await page.screenshot({path:path.join(shots,route.includes('tasks')?'task-v9-mobile.png':route.includes('kit')?'kit-v9-mobile.png':'updates-v9-mobile.png'),fullPage:true});}}
 await page.setViewportSize({width:1440,height:1000});
 console.log('PASS v9 browser: task enquiry context, contractor ZIP download, release history, mobile 390/320 layout');
}
