import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifySolutions18({page,base,shots}){
 assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname),'use an isolated test server');
 const chosen=page.locator('[data-solution][aria-pressed="true"]');
 const restored=async(id,object='')=>{
  assert.equal(await chosen.getAttribute('data-solution'),id);
  assert.equal(await page.locator('#solution-object').inputValue(),object);
  const request=new URL(await page.locator('#solution-request').getAttribute('href'),base);
  assert.equal(request.searchParams.get('solution'),id);assert.equal(request.searchParams.get('object')||'',object);
 };
 const visibleResult=async()=>{
  await page.waitForFunction(()=>{
   const heading=document.querySelector('#solution-result h2'),header=document.querySelector('.header');
   const rect=heading.getBoundingClientRect();return document.activeElement===heading&&rect.top>=header.getBoundingClientRect().bottom&&rect.bottom<innerHeight;
  }).catch(async error=>{console.error('Solution visibility:',await page.evaluate(()=>({url:location.href,active:document.activeElement?.outerHTML,heading:document.querySelector('#solution-result h2')?.getBoundingClientRect().toJSON(),header:document.querySelector('.header')?.getBoundingClientRect().toJSON(),scrollY})));throw error;});
  assert.equal(await page.locator('#solution-change').isVisible(),true);
 };
 await page.emulateMedia({reducedMotion:'reduce'});
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:1000});
  await page.goto(base+'/solutions.html',{waitUntil:'networkidle'});
  assert.equal(await page.locator('[data-solution]').count(),9);
  assert.equal(await page.locator('#solution-result').isVisible(),false);
  if(width<560){
   const heights=await page.locator('[data-solution]').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));
   assert.ok(heights.every(height=>height>=44&&height<150),'task cards remain compact and touchable at '+width);
  }
  await page.locator('[data-solution=new]').focus();await page.keyboard.press('Enter');
  await visibleResult();await restored('new');
  assert.equal(new URL(page.url()).searchParams.get('solution'),'new');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow at '+width);
  await page.screenshot({path:path.join(shots,'solutions18-result-'+width+'.png')});
  await page.locator('#solution-change').click();
  assert.equal(await page.locator('[data-solution=new]').evaluate(el=>el===document.activeElement),true);
  const visible=await page.locator('[data-solution=new]').evaluate(el=>el.getBoundingClientRect().top>=document.querySelector('.header').getBoundingClientRect().bottom);
  assert.ok(visible,'change task returns above the sticky header');
  if(width===390)await page.screenshot({path:path.join(shots,'solutions18-choices-mobile.png')});
 }

 await page.goto(base+'/solutions.html',{waitUntil:'networkidle'});
 await page.locator('[data-solution=installation]').click();await visibleResult();
 await page.locator('#solution-object').selectOption('Коммерческое здание');
 const first=page.url();await restored('installation','Коммерческое здание');
 assert.equal(new URL(first).searchParams.get('object'),'Коммерческое здание');
 await page.locator('#solution-change').click();await page.locator('[data-solution=windows]').click();await visibleResult();
 await restored('windows','Коммерческое здание');
 assert.equal(new URL(await page.locator('#solution-request').getAttribute('href'),base).searchParams.get('scope'),'supply-installation');
 await page.reload({waitUntil:'networkidle'});await restored('windows','Коммерческое здание');
 await page.goBack({waitUntil:'networkidle'});await restored('installation','Коммерческое здание');await visibleResult();
 await page.goBack({waitUntil:'networkidle'});await restored('installation','');
 await page.goForward({waitUntil:'networkidle'});await restored('installation','Коммерческое здание');
 await page.goForward({waitUntil:'networkidle'});await restored('windows','Коммерческое здание');
 await page.locator('#solution-object').selectOption('');await restored('windows');
 assert.equal(new URL(page.url()).searchParams.has('object'),false,'removing object updates the URL');

 const incoming=new URLSearchParams({solution:'windows',object:'<script>INVALID_OBJECT18</script>',phone:'+79999999999',email:'private@example.test',utm_source:'test18'});
 await page.goto(base+'/solutions.html?'+incoming+'#private18',{waitUntil:'networkidle'});
 await restored('windows');assert.equal(new URL(page.url()).searchParams.has('object'),false);
 assert.equal(await page.locator('#solution-result').getByText('INVALID_OBJECT18',{exact:false}).count(),0);
 await page.locator('#solution-object').selectOption('Частный объект');
 // Clipboard success must copy only the selected decision, never incoming data.
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.solutions18Copied=value;}}}));
 await page.locator('#solution-share').click();await page.waitForFunction(()=>typeof window.solutions18Copied==='string');
 const shared=new URL(await page.evaluate(()=>window.solutions18Copied));
 assert.equal(shared.origin,'https://facadepro.ru');assert.equal(shared.pathname,'/solutions.html');assert.equal(shared.hash,'');
 assert.deepEqual([...shared.searchParams.keys()].sort(),['object','solution']);
 assert.equal(shared.searchParams.get('solution'),'windows');assert.equal(shared.searchParams.get('object'),'Частный объект');
 assert.match(await page.locator('#solution-share-status').innerText(),/скопирована/);
 // A blocked clipboard still exposes a usable link with the same safe state.
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('Clipboard blocked');}}}));
 await page.locator('#solution-share').click();await page.locator('#solution-share-link').waitFor({state:'visible'});
 assert.equal(await page.locator('#solution-share-link').getAttribute('href'),shared.href);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'fallback link fits the phone');
 await page.goto(base+shared.pathname+shared.search,{waitUntil:'networkidle'});await restored('windows','Частный объект');

 await page.goto(base+'/solutions.html?solution=unknown18&object='+encodeURIComponent('Частный объект'),{waitUntil:'networkidle'});
 assert.equal(await page.locator('#solution-result').isVisible(),false);assert.equal(await chosen.count(),0);
 assert.equal(new URL(page.url()).searchParams.has('solution'),false);assert.equal(new URL(page.url()).searchParams.has('object'),false);
 await page.locator('[data-solution=help]').click();await visibleResult();await restored('help');
 assert.equal(await page.locator('#solution-result a[href="services/engineering.html"]').count(),0);
 assert.equal(await page.locator('#solution-result a[href="tasks/help.html"]').count(),0);
 await page.goBack({waitUntil:'networkidle'});assert.equal(await page.locator('#solution-result').isVisible(),false);
 await page.goForward({waitUntil:'networkidle'});await restored('help');

 // Normal motion also finishes at the visible result; reduced motion remains
 // the default for the rest of the browser suite.
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.locator('#solution-change').click();await page.locator('[data-solution=measurements]').click();await visibleResult();
 await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:1440,height:1000});
 console.log('PASS v18 solution UI: compact accessible cards, visible results and change task, preserved object, reload/back/forward, allowlisted sharing, invalid state, clipboard fallback and 1440/390/320 widths');
}
