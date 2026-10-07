import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import path from 'node:path';

/** Route state follows accepted navigation, never rejected or stale lead loads. */
export async function verifyNavigation17({page,base,shots}){
  assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname),'navigation fixtures require an isolated local server');
  const sessionResponse=await page.request.get(base+'/api/admin/session');assert.equal(sessionResponse.status(),200);
  const session=await sessionResponse.json(),headers={Origin:new URL(base).origin,'X-CSRF-Token':session.csrf},created=[];let heldRelease=null;
  async function create(label){
    const response=await page.request.post(base+'/api/admin/leads',{headers,data:{name:'Navigation17 '+label,email:'navigation17-'+randomUUID()+'@example.test',services:['glazing'],source:'other',idempotency:randomUUID()}});
    assert.equal(response.status(),201,await response.text());const lead=await response.json();created.push(lead);return lead;
  }
  const currentHash=()=>page.evaluate(()=>location.hash);
  const waitLead=async lead=>{await page.locator('#lead-edit').waitFor();await page.locator('.detail-top h2').filter({hasText:lead.reference}).waitFor();};
  const clickLead=async lead=>{await page.locator('[data-lead="'+lead.id+'"]:visible').first().click();await waitLead(lead);};
  try{
    const a=await create('A'),b=await create('B');await page.setViewportSize({width:390,height:844});
    await page.goto(base+'/admin/#leads/'+a.id,{waitUntil:'networkidle'});await page.reload({waitUntil:'networkidle'});await waitLead(a);assert.equal(await currentHash(),'#leads/'+a.id,'direct link opens A');
    await page.locator('#back-leads').click();await page.locator('#new-manual-lead').waitFor();assert.equal(await currentHash(),'','accepted list navigation clears the stale lead route');
    await page.reload({waitUntil:'networkidle'});await page.locator('#new-manual-lead').waitFor();assert.equal(await page.locator('#lead-edit').count(),0,'reload after returning to list stays in the list');
    if(!await page.locator('[data-lead="'+b.id+'"]:visible').count()){
      if(!await page.locator('#lead-filter-reset').isVisible())await page.locator('#lead-filter-toggle').click();await page.locator('#lead-filter-reset').click();await page.locator('[data-lead="'+b.id+'"]:visible').first().waitFor();
    }
    const historyBefore=await page.evaluate(()=>history.length);await clickLead(b);assert.equal(await currentHash(),'#leads/'+b.id,'UI opening B writes its own route');assert.equal(await page.evaluate(()=>history.length),historyBefore,'route synchronization does not create extra history entries');
    await page.reload({waitUntil:'networkidle'});await waitLead(b);assert.equal(await currentHash(),'#leads/'+b.id,'reload restores the actual selected lead');
    await page.locator('#lead-edit [name=note]').fill('Несохранённая заметка Navigation17');
    await page.locator('[data-tab=leads]').click();await page.locator('#confirm-dialog').waitFor({state:'visible'});await page.locator('#confirm-cancel').click();
    assert.equal(await currentHash(),'#leads/'+b.id,'cancelled exit leaves route unchanged');assert.equal(await page.locator('#lead-edit [name=note]').inputValue(),'Несохранённая заметка Navigation17','cancelled exit keeps the draft');
    await page.locator('[data-tab=leads]').click();await page.locator('#confirm-dialog').waitFor({state:'visible'});await page.locator('#confirm-yes').click();await page.locator('#new-manual-lead').waitFor();assert.equal(await currentHash(),'','confirmed exit clears the route');
    const aRoute=base+'/api/admin/leads/'+a.id;
    const failLoad=route=>route.fulfill({status:503,contentType:'application/json',json:{error:'Временная ошибка Navigation17'}});
    await page.route(aRoute,failLoad);await page.locator('[data-lead="'+a.id+'"]:visible').first().click();await page.locator('#admin-status').filter({hasText:'Временная ошибка Navigation17'}).waitFor();
    assert.equal(await currentHash(),'','failed fetch cannot publish a route for a card that did not open');await page.unroute(aRoute,failLoad);
    let startedResolve;const started=new Promise(resolve=>{startedResolve=resolve;}),held=new Promise(resolve=>{heldRelease=resolve;});
    const holdLoad=async route=>{const response=await route.fetch();startedResolve();await held;await route.fulfill({response});};
    await page.route(aRoute,holdLoad);await page.locator('[data-lead="'+a.id+'"]:visible').first().click();await started;
    await clickLead(b);assert.equal(await currentHash(),'#leads/'+b.id,'newer B load owns the route while A is pending');
    const lateResponse=page.waitForResponse(response=>response.url()===aRoute&&response.request().method()==='GET');heldRelease();heldRelease=null;await lateResponse;
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(await currentHash(),'#leads/'+b.id,'late A response cannot replace B route');assert.equal(await page.locator('.detail-top h2').innerText(),b.reference,'late response cannot replace B card');await page.unroute(aRoute,holdLoad);
    if(shots)await page.screenshot({path:path.join(shots,'navigation17-mobile.png'),fullPage:true});
    await page.locator('#back-leads').click();await page.locator('#new-manual-lead').waitFor();
    console.log('PASS navigation17: direct A/list reload, UI B/reload, replaceState history, dirty cancel/confirm, failed and stale fetches preserve the accepted route');
  }finally{
    heldRelease?.();
    for(const lead of created){await page.unroute(base+'/api/admin/leads/'+lead.id);const removed=await page.request.delete(base+'/api/admin/leads/'+lead.id,{headers});assert.equal(removed.status(),200,'remove isolated navigation fixture');}
  }
}
