import assert from 'node:assert/strict';
import path from 'node:path';
export async function verifyBrief17({page,base,shots}){
 await page.setViewportSize({width:390,height:844});
 await page.goto(base+'/solutions.html',{waitUntil:'networkidle'});
 await page.locator('[data-solution=installation]').click();
 await page.locator('#solution-object').selectOption({label:'Коммерческое здание'});
 await page.locator('#solution-request').click();
 assert.equal(await page.locator('[name=scope]').inputValue(),'installation');
 assert.equal(await page.locator('[name=object]').inputValue(),'Коммерческое здание');
 await page.locator('[name=scope]').selectOption('supply-installation');
 assert.match(await page.locator('#request-scope-context').innerText(),/Поставка и монтаж/);
 await page.locator('[name=city]').fill('Владивосток — параметры17');await page.locator('#request-next').click();
 assert.ok(await page.locator('#request-data-hints li').count()>0);
 await page.locator('[name=elementCount]').fill('2.5');await page.locator('#request-next').click();
 assert.equal(await page.locator('.request-step[data-step="1"]').isVisible(),true);
 assert.match(await page.locator('.form-status').innerText(),/целое число/);
 await page.locator('[name=elementCount]').fill('12');
 const details='Размеры 1200×1500, третий этаж. <script>НЕ КОД</script>';
 await page.locator('[name=objectDetails]').fill(details);await page.locator('[data-draft-save]').click();
 await page.reload({waitUntil:'networkidle'});await page.locator('[data-draft-restore]').click();
 assert.equal(await page.locator('[name=elementCount]').inputValue(),'12');assert.equal(await page.locator('[name=objectDetails]').inputValue(),details);
 assert.equal(await page.locator('[name=scope]').inputValue(),'supply-installation');
 await page.screenshot({path:path.join(shots,'brief17-mobile.png'),fullPage:true});
 await page.locator('#request-next').click();assert.match(await page.locator('#request-summary').innerText(),/12 шт/);assert.match(await page.locator('#request-summary').innerText(),/НЕ КОД/);assert.equal(await page.locator('#request-summary script').count(),0);
 await page.locator('[name=name]').fill('Проверка исходных данных 17');await page.locator('[name=phone]').fill('+7 999 000 00 17');await page.locator('[name=consent]').check();
 let payload='';await page.route('**/api/requests',async route=>{payload=route.request().postData()||'';await route.continue();});
 await page.locator('#request-next').click();await page.locator('#request-result').waitFor({state:'visible'});await page.unroute('**/api/requests');
 assert.match(payload,/name="elementCount"\r\n\r\n12/);assert.ok(payload.includes(details));
 // Simulate a pre-v17 request accepted by the server, with a lost receipt.
 // Its saved fingerprint and draft contain no new optional fields.
 await page.goto(base+'/request.html',{waitUntil:'networkidle'});
 await page.locator('[name=service][value=windows]').check();await page.locator('[name=object]').selectOption({label:'Коммерческое здание'});await page.locator('[name=city]').fill('До выпуска 17');await page.locator('#request-next').click();await page.locator('#request-next').click();
 await page.locator('[name=name]').fill('Повтор прежней заявки');await page.locator('[name=phone]').fill('+7 999 000 00 18');await page.locator('[name=consent]').check();await page.locator('[data-draft-save]').click();
 const legacy=await page.evaluate(async()=>{const form=document.querySelector('#request-form'),fd=new FormData(form);fd.delete('elementCount');fd.delete('objectDetails');const ticket=await window.facade.submissions.prepare('request',fd,[],window.facade.uuid());fd.set('idempotency',ticket.key);fd.set('sourcePage',ticket.sourcePage);const response=await fetch('/api/requests',{method:'POST',body:fd});if(response.status!==201)throw Error('Legacy fixture not accepted: '+response.status+' '+await response.text());return {receipt:await response.json(),key:ticket.key};});
 await page.locator('[data-draft-save]').click();await page.evaluate(()=>{const key='facade_draft15_request',draft=JSON.parse(localStorage.getItem(key));delete draft.fields.elementCount;delete draft.fields.objectDetails;localStorage.setItem(key,JSON.stringify(draft));});
 await page.reload({waitUntil:'networkidle'});await page.locator('[data-draft-restore]').click();await page.locator('[name=consent]').check();
 let legacyStatus=0,legacyKey='';await page.route('**/api/requests',async route=>{legacyKey=(route.request().postData()||'').match(/name="idempotency"\r\n\r\n([^\r]+)/)?.[1];const response=await route.fetch();legacyStatus=response.status();await route.fulfill({response});});
 await page.locator('#request-next').click();await page.locator('#request-result').waitFor({state:'visible'});await page.unroute('**/api/requests');
 assert.equal(legacyStatus,200);assert.equal(legacyKey,legacy.key,'pre-v17 fingerprint reuses accepted request key');assert.equal(await page.locator('#result-reference').innerText(),legacy.receipt.reference,'legacy lost receipt cannot duplicate a lead');
 await page.goto(base+'/request.html?solution=help',{waitUntil:'networkidle'});
 assert.equal(await page.locator('[name=scope]').inputValue(),'');assert.match(await page.locator('#solution-context').innerText(),/уточним с менеджером/);assert.match(await page.locator('[name=comment]').inputValue(),/не определено/);
 await page.setViewportSize({width:320,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.setViewportSize({width:1440,height:1000});
 console.log('PASS v17 brief UI: scenario/scope transfer, editable scope, contextual hints, integer validation, draft recovery, literal summary, real submission, help scenario and 320/390 widths');
}
