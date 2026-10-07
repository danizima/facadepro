import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifyDrafts15({page,base,shots}){
 await page.goto(base+'/request.html?service=glazing&scope=installation&utm_source=yandex&utm_campaign=drafts15',{waitUntil:'networkidle'});
 await page.evaluate(()=>{localStorage.removeItem('facade_draft15_request');sessionStorage.removeItem('facade_retry15_request');});await page.reload({waitUntil:'networkidle'});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.locator('[data-draft-save]').count(),1);assert.equal(await page.locator('[data-draft-restore]').isHidden(),true);
 await page.locator('[name=object]').selectOption({label:'Коммерческое здание'});await page.locator('[name=city]').fill('Владивосток - черновик15');
 assert.equal(await page.evaluate(()=>localStorage.getItem('facade_draft15_request')),null,'typing alone never stores contact drafts');
 await page.locator('#request-next').click();await page.locator('[name=projectLink]').fill('https://example.test/design');
 const file={name:'plan-<img id=draft-xss>.txt',mimeType:'text/plain',buffer:Buffer.from('Чертёж для повторной отправки')};
 await page.locator('#request-files').setInputFiles(file);await page.locator('#request-next').click();
 await page.locator('[name=name]').fill('Контакт черновика');await page.locator('[name=phone]').fill('+7 999 000 33 44');await page.locator('[name=consent]').check();
 await page.locator('[data-draft-save]').click();
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('facade_draft15_request')));assert.equal(stored.step,2);assert.equal(stored.fields.name[0],'Контакт черновика');assert.ok(!('consent' in stored.fields));assert.equal(stored.files.length,1);assert.ok(!JSON.stringify(stored.files).includes('Чертёж'));
 await page.reload({waitUntil:'networkidle'});await page.locator('[data-draft-restore]').click();
 assert.equal(await page.locator('[name=name]').inputValue(),'Контакт черновика');assert.equal(await page.locator('[name=phone]').inputValue(),'+7 999 000 33 44');assert.equal(await page.locator('[name=consent]').isChecked(),false);
 assert.equal(await page.locator('.request-step[data-step="2"]').isVisible(),true);assert.equal(await page.locator('#selected-files li').count(),0);assert.equal(await page.locator('#draft-xss').count(),0,'filename remains text');
 await page.locator('[name=consent]').check();
 let attempts=0,accepted=null,replayed=null;
 await page.route('**/api/requests',async route=>{attempts++;const response=await route.fetch();if(attempts===1){assert.equal(response.status(),201,await response.text());accepted=await response.json();await route.abort('failed');}else{assert.equal(response.status(),200,await response.text());replayed=await response.json();await route.fulfill({response});}});
 await page.locator('#request-next').click();assert.equal(attempts,0,'restored request is blocked until its attachments are reconfirmed');assert.match(await page.locator('.form-status').innerText(),/прежние вложения/);
 await page.locator('#request-files').setInputFiles(file);await page.locator('#request-next').click();await page.locator('.form-status').filter({hasText:'Повторите отправку'}).waitFor();assert.equal(attempts,1);
 const pending=await page.evaluate(()=>JSON.parse(localStorage.getItem('facade_draft15_request')).pending);assert.match(pending.fingerprint,/^[a-f0-9]{64}$/);
 await page.reload({waitUntil:'networkidle'});await page.locator('[data-draft-restore]').click();await page.locator('[name=consent]').check();await page.locator('#request-files').setInputFiles(file);await page.locator('#request-next').click();await page.locator('#request-result').waitFor({state:'visible'});
 assert.equal(attempts,2);assert.equal(replayed.reference,accepted.reference);assert.equal(await page.locator('#result-reference').innerText(),accepted.reference,'lost response + reload + reselected file reuse the original request');
 assert.equal(await page.evaluate(()=>localStorage.getItem('facade_draft15_request')),null);assert.equal(await page.evaluate(()=>sessionStorage.getItem('facade_retry15_request')),null,'success clears draft and pending retry');await page.unroute('**/api/requests');

 await page.goto(base+'/quote.html',{waitUntil:'networkidle'});await page.evaluate(()=>localStorage.setItem('facade_draft15_quote','{broken'));await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('[data-draft-restore]').isHidden(),true);assert.equal(await page.evaluate(()=>localStorage.getItem('facade_draft15_quote')),null);
 await page.evaluate(()=>localStorage.setItem('facade_draft15_quote',JSON.stringify({version:1,kind:'quote',step:2,expires:Date.now()-1,fields:{name:['Истёкший контакт']},files:[]})));await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('[data-draft-restore]').isHidden(),true);
 await page.locator('[name=service][value=glazing]').check();await page.locator('[name=object]').selectOption({label:'Коммерческое здание'});await page.locator('[name=city]').fill('Черновик без сервера');await page.locator('[data-draft-save]').click();
 await page.route('**/api/public/config',route=>route.fulfill({status:503,body:'{}',contentType:'application/json'}));await page.reload({waitUntil:'networkidle'});await page.locator('[data-draft-restore]').click();assert.equal(await page.locator('[name=city]').inputValue(),'Черновик без сервера','local draft works while server connection is unavailable');
 await page.locator('[data-draft-delete]').click();assert.equal(await page.evaluate(()=>localStorage.getItem('facade_draft15_quote')),null);assert.equal(await page.locator('[name=city]').inputValue(),'Черновик без сервера','deleting stored draft preserves current input');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'draft controls fit mobile');if(shots)await page.locator('.request-draft-controls').screenshot({path:path.join(shots,'drafts-v15-mobile.png')});
 await page.unroute('**/api/public/config');await page.setViewportSize({width:1440,height:1000});
 console.log('PASS v15 drafts UI: opt-in storage, field/step restore, fresh consent/files, literal filenames, lost-response reload idempotency, success cleanup, malformed/expired storage, offline restore and mobile layout');
}
