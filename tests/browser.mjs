import {createRequire} from 'node:module';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {verifyRelease8} from './browser8.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=new URL('../',import.meta.url).pathname,data=await mkdtemp(path.join(tmpdir(),'facadepro-browser-')),base='http://127.0.0.1:18746',shots=path.join(root,'artifacts/browser');await mkdir(shots,{recursive:true});
const env={...process.env,DATA_DIR:data,PORT:'18746',PUBLIC_URL:base,NODE_ENV:'test',SMTP_HOST:'',SMTP_FROM:'',TELEGRAM_BOT_TOKEN:'',TELEGRAM_CHAT_ID:''};
const admin=spawnSync(process.execPath,['scripts/create-admin.mjs','browser-tester'],{cwd:root,env,encoding:'utf8'});if(admin.status!==0)throw Error('Cannot create local test user');
const password=admin.stdout.match(/Одноразовая выдача пароля: (.+)/)[1];
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env,stdio:['ignore','ignore','pipe']});let serverLog='';server.stderr.on('data',b=>serverLog+=b);
let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}if(i===99)throw Error(serverLog);await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1,reducedMotion:'reduce'});page.setDefaultTimeout(12000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{try{localStorage.setItem('facade_statistics','no');}catch{}});
 await page.goto(base+'/',{waitUntil:'networkidle'});await page.screenshot({path:path.join(shots,'home-desktop.png')});
 await page.locator('[data-audience="owner"]').click();assert.equal(await page.locator('[data-audience-panel="owner"]').isVisible(),true);
 await page.locator('.callback-section').screenshot({path:path.join(shots,'callback-desktop.png')});
 await page.locator('.callback-form [name=name]').fill('Проверка браузером');await page.locator('.callback-form [name=phone]').fill('+7 999 000 00 00');await page.locator('.callback-form [name=preferredTime]').fill('После 14:00, Москва');await page.locator('.callback-form [name=consent]').check();await page.locator('.callback-form [type=submit]').click();await page.locator('.callback-status').filter({hasText:'получен'}).waitFor();
 await page.goto(base+'/compare.html',{waitUntil:'networkidle'});await page.locator('#compare-picker [value=museum]').check();await page.locator('#compare-picker [value=burny]').check();await page.locator('.compare-table').waitFor();assert.equal(await page.locator('.compare-table thead th').count(),3);await page.locator('#compare-picker [value=restaurant]').check();assert.equal(await page.locator('#compare-picker [value=brusnika]').isDisabled(),true);
 await page.locator('#compare-result').screenshot({path:path.join(shots,'compare-desktop.png')});
 const download=page.waitForEvent('download');await page.locator('#compare-pdf').click();assert.match((await download).suggestedFilename(),/\.pdf$/);
 await page.locator('#compare-result>.button').click();await page.locator('input[name=comparedProjects]').waitFor({state:'attached'});assert.equal((await page.locator('input[name=comparedProjects]').inputValue()).split(',').length,3);
 await page.goto(base+'/projects/museum.html',{waitUntil:'networkidle'});await page.locator('[data-detail-pin]').first().click();assert.equal(await page.locator('.detail-note.is-active').count(),1);await page.locator('[data-report-year="2025"]').click();assert.equal(await page.locator('.report-entry:visible').count(),2);await page.locator('[data-report-photo]:visible').first().click();await page.locator('.report-viewer').waitFor({state:'visible'});await page.keyboard.press('Escape');
 await page.goto(base+'/admin/',{waitUntil:'networkidle'});await page.locator('[name=username]').fill('browser-tester');await page.locator('[name=password]').fill(password);await page.locator('#login-form [type=submit]').click();await page.locator('#admin-shell').waitFor({state:'visible'});
 await page.locator('[data-lead]').first().click();await page.locator('#lead-edit').waitFor();assert.match(await page.locator('#admin-view').innerText(),/Обратный звонок/);assert.match(await page.locator('#admin-view').innerText(),/После 14:00/);
 await page.locator('[data-tab=projects]').click();await page.locator('[data-project-edit=museum]').click();await page.locator('#preview-project').click();await page.locator('#preview-dialog').waitFor({state:'visible'});await page.frameLocator('#preview-frame').locator('h1').waitFor();await page.locator('#close-preview').click();await page.locator('#close-project').click();
 await page.locator('[data-tab=materials]').click();await page.locator('#add-material').click();await page.locator('#materials-form [data-field=title]').fill('Проверка отзыва');await page.locator('#materials-form [data-field=text]').fill('Тестовая запись для проверки интерфейса.');await page.locator('#materials-form [data-field=author]').fill('Тестовый автор');await page.locator('#materials-form [type=submit]').click();await page.locator('#admin-status').filter({hasText:'Материалы сохранены'}).waitFor();
 await page.locator('[data-tab=showcases]').click();await page.locator('#new-showcase').click();await page.locator('[data-select-project=museum]').check();await page.locator('[data-select-project=restaurant]').check();await page.locator('#share-form [type=submit]').click();await page.locator('.showcase-list article').waitFor();
 await page.locator('[data-tab=notifications]').click();await page.locator('#notifications-form').waitFor();await page.locator('#notifications-form [type=submit]').click();await page.locator('#admin-status').filter({hasText:'Настройки сохранены'}).waitFor();
 await verifyRelease8({page,base,shots});
 for(const width of [390,320]){
  await page.setViewportSize({width,height:844});
  for(const route of ['/', '/compare.html?projects=museum,burny','/projects/museum.html','/request.html','/admin/']){
   await page.goto(base+route,{waitUntil:'networkidle'});
   const fits=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);assert.ok(fits,'page fits '+width+': '+route);
   if(route==='/'&&width===390){await page.screenshot({path:path.join(shots,'home-mobile.png')});await page.locator('.callback-section').scrollIntoViewIfNeeded();await page.locator('body.callback-in-view').waitFor();assert.equal(await page.locator('.mobile-actions').isVisible(),false);await page.locator('.callback-section').screenshot({path:path.join(shots,'callback-mobile.png')});await page.locator('.menu-toggle').click();assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'),'true');await page.keyboard.press('Escape');}
   if(route==='/admin/'){await page.locator('[data-tab=materials]').click();await page.locator('#materials-form').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'admin materials fit');if(width===390)await page.screenshot({path:path.join(shots,'admin-mobile.png')});}
  }
 }
 assert.deepEqual(errors,[]);console.log('PASS browser: callback, comparison/PDF, attribution, museum, admin preview/materials/shares/settings, 1440/390/320 widths and mobile navigation');
}finally{
 if(browser)await browser.close();server.kill('SIGTERM');await new Promise(r=>server.once('close',r));await rm(data,{recursive:true,force:true});
}
