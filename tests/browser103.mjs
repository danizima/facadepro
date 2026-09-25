import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile} from 'node:fs/promises';

export async function verifyRelease103({page,base,shots}){
  await page.goto(base+'/',{waitUntil:'networkidle'});
  assert.equal(await page.locator('.project-card').count(),4,'no repeated home portfolios');
  assert.equal(await page.locator('.audience-section,.work-story,.flagship-link,.craft-feature,.task-links').count(),0);
  assert.equal(await page.locator('.home-direction-grid a').count(),6);
  await page.screenshot({path:path.join(shots,'home-103-desktop.png'),fullPage:true});
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});
    for(const route of ['/','/projects/brusnika.html','/photo-request.html']){
      await page.goto(base+route,{waitUntil:'networkidle'});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),route+' fits '+width);
      if(width===390)await page.screenshot({path:path.join(shots,route==='/'?'home-103-mobile.png':route.includes('brusnika')?'buildings-103-mobile.png':'photo-103-mobile.png'),fullPage:true});
    }
  }
  await page.goto(base+'/projects/brusnika.html',{waitUntil:'networkidle'});
  assert.equal(await page.locator('.building-item').count(),5);
  const house=page.locator('.building-item').filter({hasText:'Дом №5'});await house.locator('summary').focus();await page.keyboard.press('Enter');assert.equal(await house.getAttribute('open')!==null,true);assert.match(await house.innerText(),/ФС-50/);
  await page.goto(base+'/projects.html',{waitUntil:'networkidle'});
  assert.equal(await page.locator('[data-project-id=novy] img').evaluate(img=>getComputedStyle(img).objectPosition),'25% 50%');
  assert.equal(await page.locator('[data-project-id=restaurant] img').evaluate(img=>getComputedStyle(img).objectFit),'contain');
  await page.goto(base+'/photo-request.html',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!document.querySelector('#photo-request-form fieldset').disabled);
  assert.equal(await page.locator('#photo-camera').getAttribute('capture'),'environment');
  const bytes=await readFile(new URL('../site/assets/museum-small.webp',import.meta.url));
  await page.locator('#photo-files').setInputFiles([{name:'Фасад.webp',mimeType:'image/webp',buffer:bytes},{name:'Деталь.webp',mimeType:'image/webp',buffer:bytes}]);
  assert.equal(await page.locator('#photo-previews li').count(),2);
  await page.locator('#photo-previews button').last().click();assert.equal(await page.locator('#photo-previews li').count(),1);
  await page.locator('#photo-files').setInputFiles({name:'Чертёж.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4')});assert.match(await page.locator('#photo-file-status').innerText(),/нужен JPG/);
  await page.locator('[name=phone]').fill('+7 999 000 00 00');await page.locator('[name=comment]').fill('Проверка обращения с фотографиями');await page.locator('[name=consent]').check();
  await page.screenshot({path:path.join(shots,'photo-103-ready.png'),fullPage:true});
  // Simulate a lost server response. The retry must return the same lead number.
  let accepted=null,attempts=0;
  await page.route('**/api/photo-request',async route=>{attempts++;if(attempts===1){const response=await route.fetch();assert.equal(response.status(),201);accepted=await response.json();await route.abort('failed');}else await route.continue();});
  await page.locator('.photo-submit').click();await page.locator('#photo-send-status').filter({hasText:'Связь прервалась'}).waitFor();assert.equal(await page.locator('#photo-previews li').count(),1);
  await page.locator('.photo-submit').click();await page.locator('#photo-success').waitFor({state:'visible'});assert.match(await page.locator('#photo-reference').innerText(),new RegExp(accepted.reference));
  await page.unroute('**/api/photo-request');await page.screenshot({path:path.join(shots,'photo-103-success.png'),fullPage:true});
  await page.goto(base+'/admin/',{waitUntil:'networkidle'});await page.locator('[data-tab=leads]').click();await page.locator('[data-lead]').filter({hasText:accepted.reference}).click();await page.locator('#lead-edit').waitFor();assert.match(await page.locator('#admin-view').innerText(),/Обращение с фотографиями/);assert.equal(await page.locator('.attachment-list a').count(),1);
  await page.locator('[data-tab=notifications]').click();await page.locator('#timeweb-preset').click();assert.equal(await page.locator('[name=smtpHost]').inputValue(),'smtp.timeweb.ru');assert.equal(await page.locator('[name=smtpUser]').inputValue(),'office@facadepro.ru');
  await page.locator('[data-email-connect]').click();await page.locator('#notification-status').filter({hasText:'Заполните SMTP'}).waitFor();
  // UI test uses mocked saved settings and never contacts the real mail service.
  const original=await(await page.request.get(base+'/api/admin/notifications')).json();let state=structuredClone(original),tested=false;
  await page.route('**/api/admin/notifications',async route=>{if(route.request().method()==='PUT'){const value=route.request().postDataJSON();assert.equal(value.smtpPassword,'LOCAL-UI-TEST-ONLY');assert.equal(value.emailEnabled,true);assert.equal(value.clearPassword,false);state={...state,...value,revision:state.revision+1,hasPassword:true};delete state.smtpPassword;}await route.fulfill({json:state});});
  await page.route('**/api/admin/notifications/test',async route=>{tested=true;await route.fulfill({json:{ok:true}});});
  await page.locator('[name=smtpPassword]').fill('LOCAL-UI-TEST-ONLY');await page.locator('[data-email-connect]').click();await page.locator('#notification-status').filter({hasText:'принято SMTP-сервером'}).waitFor();assert.equal(tested,true);
  await page.unroute('**/api/admin/notifications');await page.unroute('**/api/admin/notifications/test');
  await page.setViewportSize({width:1440,height:1000});
  console.log('PASS 10.3 browser: concise home, cover framing, building keyboard controls, photo preview/removal/validation, lost-response retry, private staff attachment and mail setup');
}
