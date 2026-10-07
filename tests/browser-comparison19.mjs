import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifyComparison19({page,base,shots}){
 assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname),'use an isolated test server');
 const response=await page.request.get(base+'/api/public/projects');assert.equal(response.status(),200);
 const data=await response.json(),ids=['museum','burny','restaurant'];
 const titles=ids.map(id=>{const project=data.projects.find(p=>p.id===id);assert.ok(project);return project.title;});
 const selected=()=>page.locator('#compare-selected [data-compare-remove]');
 const fit=async width=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'comparison fits '+width);
 const selectionIs=async expected=>{
  assert.deepEqual(await selected().evaluateAll(nodes=>nodes.map(node=>node.dataset.compareRemove)),expected);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('facade_compare'))),expected);
  assert.equal(new URL(page.url()).searchParams.get('projects')||'',expected.join(','));
 };
 await page.emulateMedia({reducedMotion:'reduce'});
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:1000});await page.goto(base+'/compare.html?projects='+ids.join(','),{waitUntil:'networkidle'});
  await selectionIs(ids);assert.equal(await page.locator('.compare-table thead th').count(),4);
  assert.ok(await page.locator('#compare-selected').evaluate(node=>Boolean(node.compareDocumentPosition(document.querySelector('#compare-picker'))&Node.DOCUMENT_POSITION_FOLLOWING)),'selected objects precede the long picker');
  const heights=await selected().evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().height));assert.ok(heights.every(height=>height>=44),'individual remove buttons are touchable');
  assert.equal(await page.locator('.compare-mobile').isVisible(),width<=700);
  assert.equal(await page.locator('.compare-table-wrap').isVisible(),width>700);
  if(width<=700){
   const groups=await page.locator('.compare-parameter').evaluateAll(nodes=>nodes.map(node=>({label:node.querySelector('h3').textContent,cells:[...node.querySelectorAll('dl>div')].map(cell=>({id:cell.dataset.compareProject,title:cell.querySelector('dt').textContent,value:cell.querySelector('dd').textContent})),fits:node.scrollWidth<=node.clientWidth+1})));
   assert.ok(groups.length>=6,'factual parameters appear on a phone');
   for(const group of groups){assert.ok(group.label);assert.deepEqual(group.cells.map(cell=>cell.id),ids);assert.deepEqual(group.cells.map(cell=>cell.title),titles);assert.ok(group.cells.every(cell=>cell.value.trim()),'every value names its project');assert.ok(group.fits,'parameter fits without horizontal scrolling');}
  }
  await fit(width);await page.locator('#compare-result').screenshot({path:path.join(shots,'comparison19-'+width+'.png')});
  await page.locator('[data-compare-remove="burny"]').click();await selectionIs(['museum','restaurant']);
  assert.equal(await page.locator('#compare-picker [value=burny]').isChecked(),false);assert.equal(await page.locator('#compare-picker [value=brusnika]').isDisabled(),false);
  assert.equal(await page.locator('.compare-table thead th').count(),3);assert.equal(await page.locator('.compare-mobile [data-compare-project=burny]').count(),0);
 }
 // Print keeps the complete table and suppresses duplicate phone cards.
 await page.emulateMedia({media:'print'});assert.equal(await page.locator('.compare-table-wrap').isVisible(),true);assert.equal(await page.locator('.compare-mobile').isVisible(),false);assert.equal(await page.locator('.compare-selected').isVisible(),false);await page.emulateMedia({media:'screen'});

 // An explicit empty URL suppresses a previous choice, including back to a clear state.
 await page.goto(base+'/compare.html?projects='+ids.join(','),{waitUntil:'networkidle'});await selectionIs(ids);
 await page.goto(base+'/compare.html?projects=',{waitUntil:'networkidle'});await selectionIs([]);assert.equal(await page.locator('#compare-pdf').isDisabled(),true);
 await page.evaluate(()=>localStorage.setItem('facade_compare',JSON.stringify(['restaurant','burny'])));await page.reload({waitUntil:'networkidle'});await selectionIs([]);
 await page.locator('#compare-picker [value=museum]').check();await page.locator('#compare-picker [value=burny]').check();await selectionIs(['museum','burny']);
 await page.evaluate(()=>{history.pushState(null,'','/compare.html?projects=restaurant,burny');dispatchEvent(new PopStateEvent('popstate'));});await selectionIs(['restaurant','burny']);
 await page.goBack();await selectionIs(['museum','burny']);
 await page.locator('#compare-clear').click();await selectionIs([]);await page.reload({waitUntil:'networkidle'});await selectionIs([]);
 await page.evaluate(()=>localStorage.setItem('facade_compare',JSON.stringify(['museum','burny'])));await page.goto(base+'/compare.html',{waitUntil:'networkidle'});await selectionIs(['museum','burny']);
 // Navigation during the initial public-data fetch must keep its desired URL.
 let releaseProjects;const heldProjects=new Promise(resolve=>releaseProjects=resolve);
 await page.route('**/api/public/projects',async route=>{await heldProjects;await route.fulfill({json:data});});
 try{
  await page.goto(base+'/compare.html?projects=museum,burny',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#compare-status').textContent.includes('Загружаем'));
  assert.equal(await page.locator('#compare-picker [value=museum]').isDisabled(),true);
  await page.evaluate(()=>{history.pushState(null,'','/compare.html?projects=restaurant,burny');dispatchEvent(new PopStateEvent('popstate'));});
  assert.equal(new URL(page.url()).searchParams.get('projects'),'restaurant,burny');releaseProjects();await page.waitForFunction(()=>document.querySelectorAll('#compare-selected [data-compare-remove]').length===2);await selectionIs(['restaurant','burny']);
 }finally{releaseProjects();await page.unroute('**/api/public/projects');}

 // Only current public IDs can enter the state or the canonical shared link.
 const incoming=new URLSearchParams({projects:'museum,burny,museum,hidden19,<script>private19</script>',utm_source:'private19',phone:'+79999999999',email:'private19@example.test'});
 await page.goto(base+'/compare.html?'+incoming+'#private19',{waitUntil:'networkidle'});await selectionIs(['museum','burny']);
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.comparison19Copied=value;}}}));
 await page.locator('#compare-copy').click();await page.waitForFunction(()=>typeof window.comparison19Copied==='string');
 const shared=new URL(await page.evaluate(()=>window.comparison19Copied));assert.equal(shared.origin,'https://facadepro.ru');assert.equal(shared.pathname,'/compare.html');assert.equal(shared.hash,'');assert.deepEqual([...shared.searchParams.keys()],['projects']);assert.equal(shared.searchParams.get('projects'),'museum,burny');assert.match(await page.locator('#compare-status').innerText(),/скопирована/);
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('Clipboard blocked');}}}));
 await page.locator('#compare-copy').click();await page.locator('#compare-share-link').waitFor({state:'visible'});assert.equal(await page.locator('#compare-share-link').getAttribute('href'),shared.href);assert.match(await page.locator('#compare-status').innerText(),/Не удалось скопировать/);await fit(320);
 // A late failure must not show a link or status for a discarded selection.
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{window.comparison19ClipboardPending=true;await new Promise((resolve,reject)=>window.comparison19RejectClipboard=reject);}}}));
 await page.locator('#compare-copy').click();await page.waitForFunction(()=>window.comparison19ClipboardPending===true);await page.locator('[data-compare-remove="museum"]').click();
 await page.evaluate(()=>window.comparison19RejectClipboard(Error('Late blocked clipboard')));await page.waitForFunction(()=>document.querySelector('#compare-status').textContent.startsWith('Выбрано: 1'));
 assert.equal(await page.locator('#compare-share-link').isVisible(),false);assert.equal(await page.locator('#compare-copy').isDisabled(),true);

 // Missing facts have a labelled placeholder; entirely empty facts stay omitted.
 const sparse=structuredClone(data);for(const p of sparse.projects)p.case={};
 sparse.projects.find(p=>p.id==='museum').work='Работы <strong>comparison19</strong>';
 sparse.projects.find(p=>p.id==='burny').work='';
 await page.route('**/api/public/projects',route=>route.fulfill({json:sparse}));
 try{
  await page.goto(base+'/compare.html?projects=museum,burny',{waitUntil:'networkidle'});
  const group=page.locator('.compare-parameter').filter({has:page.locator('h3',{hasText:/^Состав работ$/})});
  assert.equal(await group.locator('[data-compare-project=museum] dd').textContent(),'Работы <strong>comparison19</strong>');assert.equal(await group.locator('strong').count(),0,'editorial facts are literal text');
  assert.equal(await group.locator('[data-compare-project=burny] dt').textContent(),titles[1]);assert.equal(await group.locator('[data-compare-project=burny] dd').textContent(),'Не указано');
  assert.equal(await page.locator('.compare-parameter h3').filter({hasText:/^(Особенности объекта|Решение и этапы|Результат \/ участие)$/}).count(),0);
  await fit(320);await page.locator('#compare-result').screenshot({path:path.join(shots,'comparison19-missing-mobile.png')});
 }finally{await page.unroute('**/api/public/projects');}
 const hidden={projects:data.projects.filter(p=>p.id!=='museum')};await page.route('**/api/public/projects',route=>route.fulfill({json:hidden}));
 try{await page.goto(base+'/compare.html?projects=museum,burny,restaurant',{waitUntil:'networkidle'});await selectionIs(['burny','restaurant']);assert.equal(await page.locator('#compare-picker [value=museum]').isDisabled(),true);}finally{await page.unroute('**/api/public/projects');}

 // Delay genuine backend PDF answers after they arrive. Replacing the choice
 // must discard the first and keep the second busy until its own answer arrives.
 await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/compare.html?projects='+ids.join(','),{waitUntil:'networkidle'});
 await page.evaluate(()=>{const nativeFetch=window.fetch.bind(window);window.comparison19Pdfs=[];window.fetch=async(...args)=>{const response=await nativeFetch(...args);if(String(args[0]).endsWith('/api/portfolio')){const request={ids:JSON.parse(args[1].body).projects,release:null,completed:false};window.comparison19Pdfs.push(request);await new Promise(resolve=>request.release=resolve);request.completed=true;}return response;};});
 const downloads=[];const capture=download=>downloads.push(download);page.on('download',capture);
 try{
  await page.locator('#compare-pdf').click();await page.waitForFunction(()=>window.comparison19Pdfs[0]?.release,{timeout:65000});
  await page.locator('[data-compare-remove="museum"]').click();await selectionIs(['burny','restaurant']);assert.equal(await page.locator('#compare-pdf').isDisabled(),false);
  await page.locator('#compare-pdf').click();await page.waitForFunction(()=>window.comparison19Pdfs[1]?.release,{timeout:65000});
  await page.evaluate(()=>window.comparison19Pdfs[0].release());await page.waitForFunction(()=>window.comparison19Pdfs[0].completed===true);
  assert.equal(downloads.length,0,'late PDF must not download');assert.equal(await page.locator('#compare-pdf').isDisabled(),true,'late PDF must not unlock the replacement');assert.equal(await page.locator('#compare-status').textContent(),'Готовим PDF…');
  const downloaded=page.waitForEvent('download');await page.evaluate(()=>window.comparison19Pdfs[1].release());assert.match((await downloaded).suggestedFilename(),/\.pdf$/);assert.equal(downloads.length,1);assert.deepEqual(await page.evaluate(()=>window.comparison19Pdfs.map(request=>request.ids)),[ids,['burny','restaurant']]);
  await page.waitForFunction(()=>document.querySelector('#compare-status').textContent==='PDF готов.');assert.equal(await page.locator('#compare-pdf').isDisabled(),false);
  // Trigger the real deadline without waiting 65 seconds. Even a transport
  // which yields its response after abort must not turn it into a download.
  await page.evaluate(()=>{const nativeTimeout=window.setTimeout;window.setTimeout=(callback,delay,...args)=>{if(delay===65000)window.comparison19TriggerTimeout=callback;return nativeTimeout(callback,delay,...args);};});
  await page.locator('#compare-pdf').click();await page.waitForFunction(()=>window.comparison19Pdfs[2]?.release,{timeout:65000});
  await page.evaluate(()=>{window.comparison19TriggerTimeout();window.comparison19Pdfs[2].release();});await page.waitForFunction(()=>document.querySelector('#compare-status').textContent.startsWith('Не удалось подготовить PDF'));
  assert.equal(downloads.length,1,'timed-out response must not download');assert.equal(await page.locator('#compare-pdf').isDisabled(),false,'a timed-out request unlocks retry');
 }finally{page.off('download',capture);}
 // Current failure is surfaced; JSON labelled as success cannot become a PDF.
 await page.route('**/api/portfolio',route=>route.fulfill({status:503,json:{error:'PDF временно недоступен19'}}));
 try{await page.goto(base+'/compare.html?projects=museum,burny',{waitUntil:'networkidle'});await page.locator('#compare-pdf').click();await page.waitForFunction(()=>document.querySelector('#compare-status').textContent==='PDF временно недоступен19');assert.equal(await page.locator('#compare-pdf').isDisabled(),false);}finally{await page.unroute('**/api/portfolio');}
 await page.route('**/api/portfolio',route=>route.fulfill({json:{error:'not a PDF19'}}));
 try{await page.locator('#compare-pdf').click();await page.waitForFunction(()=>document.querySelector('#compare-status').textContent.startsWith('Не удалось подготовить PDF'));}finally{await page.unroute('**/api/portfolio');}
 await page.setViewportSize({width:1440,height:1000});
 console.log('PASS v19 comparison: labelled mobile parameters, desktop/print table, 44px individual removal, one shared state, explicit empty/back/clear, public allowlist, canonical private-free share and current clipboard/PDF failures; late PDF discarded without unlocking replacement; 1440/390/320');
}
