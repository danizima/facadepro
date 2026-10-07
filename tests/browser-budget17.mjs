import assert from 'node:assert/strict';
import path from 'node:path';

const compact=value=>value.replace(/\s+/g,' ').trim();
const priceFormat=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0});

export async function verifyBudget17({page,base,shots}){
 // Fixture prices are written only to the isolated, authenticated test server.
 assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname));
 const sessionResponse=await page.request.get(base+'/api/admin/session');assert.equal(sessionResponse.status(),200);
 const {csrf}=await sessionResponse.json(),headers={'X-CSRF-Token':csrf,Origin:new URL(base).origin};
 const originalResponse=await page.request.get(base+'/api/admin/budget');assert.equal(originalResponse.status(),200);const original=await originalResponse.json();
 async function save(rates){const current=await(await page.request.get(base+'/api/admin/budget')).json(),response=await page.request.put(base+'/api/admin/budget',{headers,data:{revision:current.revision,rates,regions:current.regions,heights:current.heights}});assert.equal(response.status(),200);return response.json();}
 const fixture=min=>[{service:'windows',scope:'supply-installation',label:'Бюджет17 / тестовые условия',unit:'m2',min,max:min+200}];
 async function expected(area,config){const response=await page.request.post(base+'/api/budget/estimate',{headers:{Origin:new URL(base).origin},data:{service:'windows',scope:'supply-installation',area,region:config.regions.at(-1).id,height:config.heights.at(-1).id}});assert.equal(response.status(),200);const data=await response.json();return compact(priceFormat.format(data.min)+' — '+priceFormat.format(data.max)+' ₽');}
 async function displayed(){return compact(await page.locator('[data-budget-value]').innerText());}
 try{
  const config=await save(fixture(900)),params=new URLSearchParams({budget:'1',service:'windows',scope:'supply-installation',area:'145.5',region:config.regions.at(-1).id,height:config.heights.at(-1).id,min:'1',max:'2',phone:'+79999999999',email:'private@example.test'});
  await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/budget.html?'+params,{waitUntil:'networkidle'});
  assert.equal(await page.locator('[name=service]').inputValue(),'windows');assert.equal(await page.locator('[name=scope][value=supply-installation]').isChecked(),true);assert.equal(await page.locator('[name=area]').inputValue(),'145.5');
  assert.equal(await page.locator('[name=region]').inputValue(),config.regions.at(-1).id);assert.equal(await page.locator('[name=height]').inputValue(),config.heights.at(-1).id);
  assert.equal(await page.locator('[data-budget-value]').isVisible(),false,'a shared URL never supplies a price');assert.match(await page.locator('[data-budget-summary]').innerText(),/145,5 м²/,'fractional volume is preserved in the summary');
  await page.locator('.budget-submit').click();await page.locator('[data-budget-value]').waitFor({state:'visible'});assert.equal(await displayed(),await expected(145.5,config));
  await page.locator('[name=area]').fill('146.5');assert.equal(await page.locator('[data-budget-value]').textContent(),'','editing removes old price text');assert.match(await page.locator('[data-budget-summary]').innerText(),/146,5 м²/);assert.doesNotMatch(await page.locator('[data-budget-summary]').innerText(),/145,5 м²/);

  // Hold one genuine backend response after fetch completes. An edit cancels
  // that calculation and permits another; the late answer cannot overwrite it.
  await page.evaluate(()=>{const nativeFetch=window.fetch.bind(window);let first=true,release;const held=new Promise(resolve=>release=resolve);window.budget17Release=release;window.fetch=async(...args)=>{const response=await nativeFetch(...args);if(first&&String(args[0]).endsWith('/api/budget/estimate')){first=false;window.budget17Pending=true;await held;window.budget17Completed=true;}return response;};});
  await page.locator('.budget-submit').click();await page.waitForFunction(()=>window.budget17Pending===true);assert.equal(await page.locator('[data-budget-value]').isVisible(),false,'pending recalculation hides the previous result');
  await page.locator('[name=area]').fill('147.5');assert.equal(await page.locator('.budget-submit').isDisabled(),false,'editing unlocks a replacement calculation');assert.match(await page.locator('[data-budget-summary]').innerText(),/147,5 м²/);
  await page.locator('.budget-submit').click();await page.locator('[data-budget-value]').waitFor({state:'visible'});const fresh=await expected(147.5,config);assert.equal(await displayed(),fresh);
  await page.evaluate(()=>window.budget17Release());await page.waitForFunction(()=>window.budget17Completed===true);assert.equal(await displayed(),fresh,'late result cannot replace the current budget');assert.equal(await page.locator('.budget-message.is-error').count(),0);

  await page.locator('[data-budget-share]').click();await page.locator('[data-budget-share-link]').waitFor({state:'visible'});const shared=await page.locator('[data-budget-share-link]').inputValue(),url=new URL(shared);
  assert.equal(url.origin,new URL(base).origin);assert.equal(url.pathname,'/budget.html');assert.equal(url.hash,'');assert.deepEqual([...url.searchParams.keys()].sort(),['area','budget','height','region','scope','service']);assert.equal(url.searchParams.get('area'),'147.5');
  await page.locator('.budget-section').screenshot({path:path.join(shots,'budget17-desktop.png')});
  await save(fixture(1300));await page.goto(shared,{waitUntil:'networkidle'});assert.equal(await page.locator('[data-budget-value]').isVisible(),false);assert.equal(await page.locator('[name=area]').inputValue(),'147.5');await page.locator('.budget-submit').click();await page.locator('[data-budget-value]').waitFor({state:'visible'});assert.equal(await displayed(),await expected(147.5,config));assert.notEqual(await displayed(),fresh,'sharing recalculates with current rates');
  await page.locator('[name=service]').selectOption('repair');assert.match(await page.locator('[data-budget-summary]').innerText(),/Ремонт и восстановление/);assert.doesNotMatch(await page.locator('[data-budget-summary]').innerText(),/Оконные системы/);assert.equal(await page.locator('[data-budget-value]').isVisible(),false);await page.locator('[name=scope][value=installation]').check();assert.match(await page.locator('[data-budget-summary]').innerText(),/Только монтаж/);
  await page.locator('[name=area]').fill('');assert.doesNotMatch(await page.locator('[data-budget-summary]').innerText(),/Объём/);assert.equal(await page.locator('[data-budget-share]').isDisabled(),true,'invalid volume is not shared');

  const invalid=new URLSearchParams({budget:'1',service:'<script>alert(1)</script>',scope:'__proto__',area:'1000001',region:'unknown',height:'unknown',regionLabel:'Поддельный регион',heightLabel:'Поддельная высота',min:'1',max:'2'});
  await page.goto(base+'/budget.html?'+invalid,{waitUntil:'networkidle'});assert.equal(await page.locator('[name=service]').inputValue(),'glazing');assert.equal(await page.locator('[name=scope][value=installation]').isChecked(),true);assert.equal(await page.locator('[name=area]').inputValue(),'');assert.equal(await page.locator('[name=region]').inputValue(),config.regions[0].id);assert.equal(await page.locator('[name=height]').inputValue(),config.heights[0].id);assert.equal(await page.locator('[data-budget-value]').isVisible(),false);assert.equal(await page.locator('[data-budget-share]').isDisabled(),true);
  for(const width of [390,320]){await page.setViewportSize({width,height:1000});await page.goto(shared,{waitUntil:'networkidle'});await page.locator('[data-budget-share]').click();await page.locator('[data-budget-share-link]').waitFor({state:'visible'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'shared parameters fit '+width);if(width===390)await page.locator('.budget-section').screenshot({path:path.join(shots,'budget17-mobile.png')});}
  await save([]);await page.goto(shared,{waitUntil:'networkidle'});await page.locator('.budget-submit').click();assert.match(await page.locator('[data-budget-title]').innerText(),/Оставьте объём/);assert.equal(await page.locator('[data-budget-value]').isVisible(),false);await page.locator('[data-budget-share]').click();assert.equal(await page.locator('[data-budget-share-link]').inputValue(),shared,'parameters can be shared without configured prices');
 }finally{
  const current=await(await page.request.get(base+'/api/admin/budget')).json(),response=await page.request.put(base+'/api/admin/budget',{headers,data:{revision:current.revision,rates:original.rates,regions:original.regions,heights:original.heights}});assert.equal(response.status(),200,'restore original budget settings');
 }
}
