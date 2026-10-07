import assert from 'node:assert/strict';
import path from 'node:path';

const compact=value=>value.replace(/\s+/g,' ').trim();
const fits=async(page,label)=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label);

export async function verifyBudget14({page,base,shots}){
 // This suite publishes fixture prices only to the isolated browser-test server.
 assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname),'budget fixture rates require a local test server');
 const sessionResponse=await page.request.get(base+'/api/admin/session');assert.equal(sessionResponse.status(),200);
 const session=await sessionResponse.json(),headers={'X-CSRF-Token':session.csrf,Origin:new URL(base).origin};
 const originalResponse=await page.request.get(base+'/api/admin/budget');assert.equal(originalResponse.status(),200);const original=await originalResponse.json();
 async function saveRates(rates){const current=await (await page.request.get(base+'/api/admin/budget')).json(),response=await page.request.put(base+'/api/admin/budget',{headers,data:{revision:current.revision,rates,regions:current.regions,heights:current.heights}});assert.equal(response.status(),200);return response.json();}
 try{
  await saveRates([]);
  await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/budget.html',{waitUntil:'networkidle'});
  await page.locator('[data-budget-form] [name=area]').fill('120');await page.locator('.budget-submit').click();
  assert.match(await page.locator('[data-budget-title]').innerText(),/Оставьте объём — менеджер подготовит расчёт/);
  assert.equal(await page.locator('[data-budget-value]').isVisible(),false,'empty rates never display a zero price');
  const emptyHref=await page.locator('[data-budget-quote]').getAttribute('href');assert.equal(new URL(emptyHref,base).searchParams.get('area'),'120');

  await page.goto(base+'/admin/budget.html',{waitUntil:'networkidle'});await page.locator('#budget-settings').waitFor({state:'visible'});
  assert.equal(await page.locator('.budget-rate').count(),0);await page.locator('[data-add=rate]').click();
  await page.locator('.budget-rate [name=service]').selectOption('glazing');await page.locator('.budget-rate [name=scope]').selectOption('installation');
  await page.locator('.budget-rate [name=label]').fill('Браузерный тест / монтаж');await page.locator('.budget-rate [name=min]').fill('500');await page.locator('.budget-rate [name=max]').fill('700');
  await page.locator('#budget-save').click();await page.locator('#budget-save-status').filter({hasText:'Прайс сохранён'}).waitFor();
  const configured=await (await page.request.get(base+'/api/budget/config')).json();assert.equal(configured.configured,true);assert.equal(configured.rates[0].min,500);
  await page.locator('[data-add=rate]').click();await page.locator('.budget-rate [name=label]').last().fill('Дубликат');await page.locator('.budget-rate [name=min]').last().fill('500');await page.locator('.budget-rate [name=max]').last().fill('700');await page.locator('#budget-save').click();
  assert.match(await page.locator('#budget-save-status').innerText(),/оставьте одну ставку/,'duplicate direction and scope is rejected before save');
  page.once('dialog',dialog=>dialog.accept());await page.locator('#budget-reload').click();await page.waitForFunction(()=>document.querySelectorAll('.budget-rate').length===1);assert.equal(await page.locator('.budget-rate').count(),1);
  for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});await fits(page,'budget admin fits '+width);if(width===390)await page.screenshot({path:path.join(shots,'budget-admin14-mobile.png')});}

  await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/budget.html',{waitUntil:'networkidle'});await page.locator('[name=area]').fill('120');
  await page.locator('[name=region]').selectOption(configured.regions[0].id);await page.locator('[name=height]').selectOption(configured.heights[0].id);
  await page.locator('.budget-submit').click();await page.locator('[data-budget-value]').waitFor({state:'visible'});
  const expected=await (await page.request.post(base+'/api/budget/estimate',{headers:{Origin:new URL(base).origin},data:{service:'glazing',scope:'installation',area:120,region:configured.regions[0].id,height:configured.heights[0].id}})).json();
  const format=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0});assert.equal(compact(await page.locator('[data-budget-value]').innerText()),compact(format.format(expected.min)+' — '+format.format(expected.max)+' ₽'),'displayed range matches authoritative server result');
  await page.locator('.budget-section').screenshot({path:path.join(shots,'budget14-desktop.png')});
  await page.locator('[name=area]').fill('121');assert.equal(await page.locator('[data-budget-value]').isVisible(),false,'editing parameters clears the old price');
  await page.locator('[name=scope][value=supply-installation]').check();await page.locator('.budget-submit').click();await page.locator('[data-budget-title]').filter({hasText:'Оставьте объём'}).waitFor();assert.equal(await page.locator('[data-budget-value]').isVisible(),false);assert.match(await page.locator('[data-budget-title]').innerText(),/Оставьте объём/,'an unconfigured scope offers a quote');
  await page.locator('[name=scope][value=installation]').check();await page.locator('.budget-submit').click();await page.locator('[data-budget-value]').waitFor({state:'visible'});
  const quoteHref=await page.locator('[data-budget-quote]').getAttribute('href');await page.locator('[data-budget-quote]').click();await page.locator('#request-form').waitFor();
  assert.equal(await page.locator('#request-form [name=area]').inputValue(),'121');assert.equal(await page.locator('#request-form [name=city]').inputValue(),configured.regions[0].label);assert.equal(await page.locator('#request-form [name=height]').inputValue(),configured.heights[0].label);assert.equal(await page.locator('#request-form [name=service][value=glazing]').isChecked(),true);assert.equal(await page.locator('.budget-context').count(),1);
  assert.ok(!new URL(quoteHref,base).searchParams.has('min'),'quote link carries parameters, never a trusted price');
  for(const width of [390,320]){await page.setViewportSize({width,height:1000});await page.goto(base+'/budget.html',{waitUntil:'networkidle'});await page.locator('[name=area]').fill('121');await page.locator('.budget-submit').click();await page.locator('[data-budget-value]').waitFor({state:'visible'});await fits(page,'budget public fits '+width);if(width===390)await page.locator('.budget-section').screenshot({path:path.join(shots,'budget14-mobile.png')});}
  await page.goto(base+'/',{waitUntil:'networkidle'});assert.equal(await page.locator('.budget-compact').count(),1);assert.equal(await page.locator('.budget-compact [data-budget-form]').count(),1);await fits(page,'homepage budget fits 320');
  const browser=page.context().browser(),guest=await browser.newContext({viewport:{width:390,height:844}});try{const unsigned=await guest.newPage();await unsigned.goto(base+'/admin/budget.html',{waitUntil:'networkidle'});await unsigned.locator('#budget-auth').waitFor({state:'visible'});assert.equal(await unsigned.locator('#budget-settings').isVisible(),false);}finally{await guest.close();}
 }finally{
  const current=await (await page.request.get(base+'/api/admin/budget')).json(),restore=await page.request.put(base+'/api/admin/budget',{headers,data:{revision:current.revision,rates:original.rates,regions:original.regions,heights:original.heights}});assert.equal(restore.status(),200,'restore baseline price settings');
 }
}
