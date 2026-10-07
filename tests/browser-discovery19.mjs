import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifyDiscovery19({page,base,shots}){
 assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname),'use an isolated test server');
 await page.emulateMedia({reducedMotion:'reduce'});
 const order=()=>page.locator('#portfolio-order [data-remove]').evaluateAll(nodes=>nodes.map(node=>node.dataset.remove));
 const stored=()=>page.evaluate(()=>Object.fromEntries(Object.entries(localStorage)));
 const state=async ids=>{assert.deepEqual(await order(),ids);assert.equal(new URL(page.url()).searchParams.get('projects')||'',ids.join(','));};
 let projectData;
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:1000});
  const incoming=new URLSearchParams({solution:'windows',scope:'height',object:'Гостиница',project:'private19',recipient:'PRIVATE_RECIPIENT_19',email:'private19@example.test',utm_source:'private19'});
  await page.goto(base+'/solutions.html?'+incoming+'#private19',{waitUntil:'networkidle'});
  projectData=await page.locator('#release-data').evaluate(el=>JSON.parse(el.textContent));
  const expected=projectData.solutions.find(s=>s.id==='windows').projects.filter(id=>projectData.projects.some(p=>p.id===id&&p.published!==false));
  assert.equal(await page.locator('[data-solution-project]').count(),expected.length);
  const links=await page.locator('[data-solution-project]').evaluateAll(nodes=>nodes.map(node=>({id:node.dataset.solutionProject,url:node.href,nested:!!node.closest('.project-open')})));
  assert.deepEqual(links.map(link=>link.id),expected);
  for(const link of links){const url=new URL(link.url);assert.deepEqual([...url.searchParams.keys()].sort(),['object','project','scope','solution']);assert.equal(url.searchParams.get('solution'),'windows');assert.equal(url.searchParams.get('scope'),'supply-installation');assert.equal(url.searchParams.get('object'),'Гостиница');assert.equal(url.searchParams.get('project'),link.id);assert.equal(url.hash,'');assert.equal(link.nested,false);}
  await page.locator('#solution-object').focus();
  const card=await page.locator('.solution-projects .project-card').first().elementHandle();
  await page.locator('#solution-object').selectOption('Частный объект');
  assert.equal(await card.evaluate(el=>el===document.querySelector('.solution-projects .project-card')),true,'object changes preserve project cards');
  assert.equal(await page.locator('#solution-object').evaluate(el=>el===document.activeElement),true,'object change preserves current focus');
  for(const href of await page.locator('[data-solution-project]').evaluateAll(nodes=>nodes.map(n=>n.href)))assert.equal(new URL(href).searchParams.get('object'),'Частный объект');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'solution CTA fits '+width);
  await page.locator('.solution-projects').evaluate(el=>window.scrollTo({top:Math.max(0,el.getBoundingClientRect().top+scrollY-document.querySelector('.header').getBoundingClientRect().height-20),behavior:'instant'}));
  await page.screenshot({path:path.join(shots,'discovery19-solutions-'+width+'.png')});
  await page.locator('[data-solution-project]').first().click();
  await page.locator('#request-form').waitFor();
  assert.equal(await page.locator('[name=solution]').inputValue(),'windows');
  assert.equal(await page.locator('[name=scope]').inputValue(),'supply-installation');
  assert.equal(await page.locator('[name=object]').inputValue(),'Частный объект');
  await page.waitForFunction(id=>document.querySelector('[name=comparedProjects]')?.value===id,expected[0]);
  assert.equal(await page.locator('[name=comparedProjects]').inputValue(),expected[0]);
  assert.deepEqual(await page.locator('[name=service]:checked').evaluateAll(nodes=>nodes.map(n=>n.value)),['windows'],'the case does not overwrite selected solution services');

  await page.goto(base+'/portfolio.html?projects=museum,burny,restaurant',{waitUntil:'networkidle'});
  await state(['museum','burny','restaurant']);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'portfolio fits '+width);
  await page.locator('.portfolio-builder-bottom').screenshot({path:path.join(shots,'discovery19-portfolio-'+width+'.png')});
 }
 // A hidden case from the solution's source list must have neither a card
 // nor a contextual request action. Invalid objects cannot enter CTA URLs.
 const hiddenID=projectData.solutions.find(s=>s.id==='windows').projects[0];
 const hideCase=async route=>{const response=await route.fetch(),html=await response.text();const body=html.replace(/(<script[^>]*id="release-data"[^>]*>)([\s\S]*?)(<\/script>)/,(match,open,json,close)=>{const data=JSON.parse(json);data.projects=data.projects.map(p=>p.id===hiddenID?{...p,published:false,title:'HIDDEN_SOLUTION_CASE_19'}:p);return open+JSON.stringify(data).replaceAll('<','\\u003c')+close;});await route.fulfill({response,body});};
 await page.route('**/solutions.html*',hideCase);
 await page.goto(base+'/solutions.html?'+new URLSearchParams({solution:'windows',object:'INVALID_OBJECT_19'}),{waitUntil:'networkidle'});
 assert.equal(await page.locator('[data-solution-project="'+hiddenID+'"]').count(),0);assert.equal(await page.getByText('HIDDEN_SOLUTION_CASE_19',{exact:false}).count(),0);
 for(const href of await page.locator('[data-solution-project]').evaluateAll(nodes=>nodes.map(n=>n.href)))assert.equal(new URL(href).searchParams.has('object'),false);
 await page.unroute('**/solutions.html*',hideCase);
 await page.setViewportSize({width:390,height:1000});
 const incoming=new URLSearchParams({projects:'burny,museum,burny,invalid19,restaurant',recipient:'PRIVATE_RECIPIENT_19',phone:'+79999999999',email:'private19@example.test',utm_source:'private19'});
 await page.goto(base+'/portfolio.html?'+incoming+'#private19',{waitUntil:'networkidle'});
 await state(['burny','museum','restaurant']);
 assert.equal(new URL(page.url()).searchParams.get('utm_source'),'private19','page URL preserves campaign context until consent capture');assert.equal(new URL(page.url()).hash,'#private19');
 assert.equal(new URL(page.url()).searchParams.get('recipient'),'PRIVATE_RECIPIENT_19','incoming context is retained but never copied or prefills recipient');
 assert.equal(await page.locator('[name=recipient]').inputValue(),'');
 const storage=await stored();
 await page.locator('[name=recipient]').fill('Личный получатель PRIVATE_RECIPIENT_19');
 await page.locator('[data-move="0"][data-delta="1"]').click();await state(['museum','burny','restaurant']);
 await page.locator('[data-remove=restaurant]').click();await state(['museum','burny']);
 await page.goBack({waitUntil:'networkidle'});await state(['museum','burny','restaurant']);
 await page.goBack({waitUntil:'networkidle'});await state(['burny','museum','restaurant']);
 await page.goForward({waitUntil:'networkidle'});await state(['museum','burny','restaurant']);
 await page.goForward({waitUntil:'networkidle'});await state(['museum','burny']);
 assert.deepEqual(await stored(),storage,'selection and recipient create no implicit storage');
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.discovery19Copied=value;}}}));
 await page.locator('#portfolio-share').click();await page.waitForFunction(()=>typeof window.discovery19Copied==='string');
 const shared=new URL(await page.evaluate(()=>window.discovery19Copied));
 assert.equal(shared.origin,'https://facadepro.ru');assert.equal(shared.pathname,'/portfolio.html');assert.equal(shared.hash,'');assert.deepEqual([...shared.searchParams.keys()],['projects']);assert.equal(shared.searchParams.get('projects'),'museum,burny');
 assert.match(await page.locator('#portfolio-share-status').innerText(),/скопирована/);
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('Clipboard blocked');}}}));
 await page.locator('#portfolio-share').click();await page.locator('#portfolio-share-link').waitFor({state:'visible'});
 assert.equal(await page.locator('#portfolio-share-link').getAttribute('href'),shared.href);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'share fallback fits phone');
 await page.reload({waitUntil:'networkidle'});await state(['museum','burny']);assert.equal(await page.locator('[name=recipient]').inputValue(),'');
 await page.goto(base+shared.pathname+shared.search,{waitUntil:'networkidle'});await state(['museum','burny']);

 // A real API request preserves order and optional recipient; subsequent edits
 // remove the stale ready link instead of letting users reuse an old PDF.
 await page.locator('[name=recipient]').fill('Тестовая подборка 19');
 const request=page.waitForRequest(r=>r.url()===base+'/api/portfolio'&&r.method()==='POST');
 const downloaded=page.waitForEvent('download');await page.locator('#portfolio-build').click();
 assert.deepEqual((await request).postDataJSON(),{projects:['museum','burny'],recipient:'Тестовая подборка 19'});
 assert.match((await downloaded).suggestedFilename(),/\.pdf$/);
 await page.locator('#portfolio-ready a').waitFor();
 await page.evaluate(()=>{const revoke=URL.revokeObjectURL.bind(URL);URL.revokeObjectURL=url=>{window.discovery19Revoked=url;revoke(url);};});
 const oldPDF=await page.locator('#portfolio-ready a').getAttribute('href');
 await page.locator('[name=recipient]').fill('Другой получатель 19');
 assert.equal(await page.locator('#portfolio-ready a').count(),0);assert.equal(await page.evaluate(()=>window.discovery19Revoked),oldPDF);
 assert.equal(await page.locator('#portfolio-status').innerText(),'');

 // Deliberately ignore AbortSignal in this fixture to prove the generation
 // check rejects a late result even if a transport cannot cancel it.
 await page.evaluate(()=>{
  window.discovery19Fetch=window.fetch;window.discovery19Calls=[];window.discovery19Clicks=0;
  const click=HTMLAnchorElement.prototype.click;window.discovery19AnchorClick=click;
  HTMLAnchorElement.prototype.click=function(){if(this.href.startsWith('blob:'))window.discovery19Clicks++;else return click.call(this);};
  window.fetch=(input,options)=>String(input)==='/api/portfolio'?new Promise(resolve=>window.discovery19Calls.push({resolve,body:JSON.parse(options.body)})):window.discovery19Fetch(input,options);
 });
 const start=async()=>{const before=await page.evaluate(()=>window.discovery19Calls.length);await page.locator('#portfolio-build').click();await page.waitForFunction(n=>window.discovery19Calls.length===n+1,before);assert.equal(await page.locator('#portfolio-build').isDisabled(),true);};
 const finish=async(index,error=false)=>{await page.evaluate(({index,error})=>window.discovery19Calls[index].resolve(error?new Response(JSON.stringify({error:'STALE_ERROR19'}),{status:409,headers:{'Content-Type':'application/json'}}):new Response(new Blob(['%PDF-1.7\nfixture19'],{type:'application/pdf'}),{status:200,headers:{'Content-Type':'application/pdf'}})),{index,error});await page.waitForTimeout(50);};
 await start();await page.locator('[name=recipient]').fill('Изменён во время подготовки');assert.equal(await page.locator('#portfolio-build').isDisabled(),false);
 await finish(0);assert.equal(await page.locator('#portfolio-ready a').count(),0);assert.equal(await page.evaluate(()=>window.discovery19Clicks),0);
 await start();await page.locator('[data-move="0"][data-delta="1"]').click();await state(['burny','museum']);
 await start();await finish(1,true);assert.equal(await page.locator('#portfolio-build').isDisabled(),true,'old finally does not unlock current job');assert.doesNotMatch(await page.locator('#portfolio-status').innerText(),/STALE_ERROR19/);
 await page.goBack({waitUntil:'networkidle'});await state(['museum','burny']);await finish(2);assert.equal(await page.locator('#portfolio-ready a').count(),0);assert.equal(await page.evaluate(()=>window.discovery19Clicks),0,'back navigation invalidates a pending PDF');
 await start();await page.locator('#portfolio-service').selectOption('windows');await finish(3);assert.equal(await page.locator('#portfolio-ready a').count(),0);assert.equal(await page.evaluate(()=>window.discovery19Clicks),0,'filter changes cannot resurrect the old PDF');
 await start();await page.evaluate(()=>window.discovery19Calls[4].resolve(new Response(new Blob(['invalid'],{type:'text/x-pdf'}),{status:200,headers:{'Content-Type':'text/x-pdf'}})));await page.waitForFunction(()=>document.querySelector('#portfolio-status').textContent==='Сервер вернул неподходящий формат.');assert.equal(await page.locator('#portfolio-ready a').count(),0);assert.equal(await page.evaluate(()=>window.discovery19Clicks),0);
 await page.evaluate(()=>{window.discovery19Timer=window.setTimeout;window.setTimeout=(fn,delay,...args)=>delay===60000?(window.discovery19Timeout=fn,window.discovery19Timer(()=>{},delay)):window.discovery19Timer(fn,delay,...args);});
 await start();await page.evaluate(()=>window.discovery19Timeout());await finish(5);await page.waitForFunction(()=>document.querySelector('#portfolio-status').textContent==='Подготовка заняла больше времени. Повторите попытку.');assert.equal(await page.locator('#portfolio-ready a').count(),0);assert.equal(await page.evaluate(()=>window.discovery19Clicks),0,'an uncancellable response after timeout cannot download');assert.equal(await page.locator('#portfolio-build').isDisabled(),false);
 await page.evaluate(()=>{window.fetch=window.discovery19Fetch;window.setTimeout=window.discovery19Timer;HTMLAnchorElement.prototype.click=window.discovery19AnchorClick;});
 await page.goto(base+'/portfolio.html?projects=',{waitUntil:'networkidle'});await state([]);assert.equal(await page.locator('#portfolio-share').isDisabled(),true);assert.equal(await page.locator('#portfolio-build').isDisabled(),true);

 // Inject only fixture data into the local page, leaving production content
 // untouched, to cover hidden projects and the 20-object allowlist limit.
 const patch=async(route)=>{
  const response=await route.fetch();const html=await response.text();
  const body=html.replace(/(<script[^>]*id="release-data"[^>]*>)([\s\S]*?)(<\/script>)/,(match,open,json,close)=>{
   const data=JSON.parse(json);const sample=data.projects[0];data.projects=[...Array.from({length:21},(_,i)=>({...sample,id:'fixture19-'+i,title:'Fixture '+i,published:true})),{...sample,id:'hidden19',title:'HIDDEN_CASE_19',published:false}];
   return open+JSON.stringify(data).replaceAll('<','\\u003c')+close;
  });await route.fulfill({response,body});
 };
 await page.route('**/portfolio.html*',patch);
 const ids=Array.from({length:21},(_,i)=>'fixture19-'+i);
 await page.goto(base+'/portfolio.html?'+new URLSearchParams({projects:['hidden19',ids[0],ids[0],'invalid19',...ids.slice(1)].join(',')}),{waitUntil:'networkidle'});
 await state(ids.slice(0,20));assert.equal(await page.locator('#portfolio-cards [value=hidden19]').count(),0);assert.equal(await page.getByText('HIDDEN_CASE_19',{exact:false}).count(),0);
 await page.locator('#portfolio-cards [value="fixture19-20"]').click();await state(ids.slice(0,20));assert.equal(await page.locator('#portfolio-cards [value="fixture19-20"]').isChecked(),false);
 await page.unroute('**/portfolio.html*',patch);
 // Statistics starts only after consent. Restoring a selection must retain
 // the landing campaign until that delayed first-touch capture happens.
 const consentContext=await page.context().browser().newContext({viewport:{width:390,height:1000},reducedMotion:'reduce'});
 try{
  const consentPage=await consentContext.newPage(),consentErrors=[];consentPage.on('pageerror',error=>consentErrors.push(error.message));
  await consentPage.goto(base+'/portfolio.html?projects=museum&utm_source=fixture19&utm_campaign=campaign19#section19',{waitUntil:'networkidle'});
  assert.equal(await consentPage.evaluate(()=>window.facade.marketingAttribution()),null);
  assert.equal(new URL(consentPage.url()).searchParams.get('utm_source'),'fixture19');assert.equal(new URL(consentPage.url()).hash,'#section19');
  await consentPage.locator('[data-consent=yes]').click();
  const attribution=await consentPage.evaluate(()=>window.facade.marketingAttribution());assert.equal(attribution.source,'fixture19');assert.equal(attribution.campaign,'campaign19');assert.equal(attribution.landing,'/portfolio.html');assert.deepEqual(consentErrors,[]);
 }finally{await consentContext.close();}
 await page.setViewportSize({width:1440,height:1000});
 console.log('PASS v19 discovery: related-case request context, object update and preserved focus, canonical portfolio sharing/fallback, ordered reload/back/forward, published unique max20 allowlist, no implicit storage, PDF invalidation/late result guards and 1440/390/320 widths');
}
