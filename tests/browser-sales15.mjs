import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import path from 'node:path';

export async function verifySales15({page,base,shots}){
 assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname),'sales fixtures require an isolated local server');
 const session=await (await page.request.get(base+'/api/admin/session')).json(),headers={Origin:new URL(base).origin,'X-CSRF-Token':session.csrf},ids=[];
 const current=await (await page.request.get(base+'/api/admin/sales?days=7')).json();
 const amountKopecks=s=>{const [r,f]=s.split('.');return BigInt(r)*100n+BigInt(f);};
 async function create(name){const response=await page.request.post(base+'/api/admin/leads',{headers,data:{name,phone:'+7 999 '+Math.floor(1000000+Math.random()*8999999),services:['glazing'],city:'Владивосток',object:'Браузерный тест CRM15',source:'phone',idempotency:randomUUID(),assignee:session.username}});assert.equal(response.status(),201);const d=await response.json();ids.push(d.id);return d.id;}
 async function patchStatus(id,status){const detail=await (await page.request.get(base+'/api/admin/leads/'+id)).json(),response=await page.request.patch(base+'/api/admin/leads/'+id,{headers,data:{revision:detail.revision,status,note:detail.note,assignee:detail.assignee,next_contact:detail.next_contact,next_action:detail.next_action}});assert.equal(response.status(),200);}
 try{
  const won=await create('Договор / браузер CRM15'),closed=await create('Закрыто / браузер CRM15');
  const quote=await page.request.post(base+'/api/admin/leads/'+won+'/quotes',{headers,multipart:{amount:'999999',timeframe:'Тестовый срок',note:'Сумма КП отличается от суммы договора.',idempotency:randomUUID(),files:{name:'sales-fixture.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\n% isolated browser fixture\n%%EOF\n')}}});assert.equal(quote.status(),201);
  const amount=await page.request.put(base+'/api/admin/leads/'+won+'/commercial',{headers,data:{revision:0,amount:'123456.78',lossReason:''}});assert.equal(amount.status(),200);assert.equal((await amount.json()).amount,'123456.78');
  await patchStatus(won,'won');
  const hostile='<img src=x onerror="window.salesXss=true">';const reason=await page.request.put(base+'/api/admin/leads/'+closed+'/commercial',{headers,data:{revision:0,amount:'',lossReason:hostile}});assert.equal(reason.status(),200);await patchStatus(closed,'closed');
  const next=await (await page.request.get(base+'/api/admin/sales?days=7')).json();assert.equal(next.totals.leads,current.totals.leads+2);assert.equal(next.totals.quoted,current.totals.quoted+1);assert.equal(next.totals.won,current.totals.won+1);assert.equal(next.totals.closed,current.totals.closed+1);assert.equal(amountKopecks(next.totals.contractAmount)-amountKopecks(current.totals.contractAmount),12345678n,'actual contract amount is not inferred from proposal amount');
  await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/admin/sales.html',{waitUntil:'networkidle'});await page.locator('#sales-content').waitFor({state:'visible'});
  assert.equal(await page.locator('.sales-metrics article').count(),4);assert.match(await page.locator('.sales-first').innerText(),/Первое действие менеджера/);assert.match(await page.locator('.sales-first').innerText(),/Без данных:/);assert.match(await page.locator('#sales-content').innerText(),/Телефон \/ вручную/);assert.ok((await page.locator('.sales-loss').innerText()).includes(hostile));assert.equal(await page.evaluate(()=>window.salesXss),undefined);assert.equal(await page.locator('.sales-loss img').count(),0);
  const loaded=page.waitForResponse(r=>r.url().endsWith('/api/admin/sales?days=7')&&r.status()===200);await page.locator('#sales-days').selectOption('7');await loaded;await page.locator('.sales-cohort').waitFor();assert.equal(await page.locator('#sales-days').inputValue(),'7');
  await page.screenshot({path:path.join(shots,'sales15-desktop.png')});
  for(const width of [390,320]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'sales dashboard fits '+width);if(width===390)await page.screenshot({path:path.join(shots,'sales15-mobile.png')});}
  const guest=await page.context().browser().newContext({viewport:{width:390,height:844}});try{const unsigned=await guest.newPage();await unsigned.goto(base+'/admin/sales.html',{waitUntil:'networkidle'});await unsigned.locator('#sales-auth').waitFor({state:'visible'});assert.equal(await unsigned.locator('#sales-content').isVisible(),false);const unauthorized=await unsigned.request.get(base+'/api/admin/sales?days=30');assert.equal(unauthorized.status(),401);}finally{await guest.close();}
 }finally{for(const id of ids){const response=await page.request.delete(base+'/api/admin/leads/'+id,{headers});assert.equal(response.status(),200,'remove isolated sales fixture');}}
}
