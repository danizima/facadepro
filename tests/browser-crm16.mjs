import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import path from 'node:path';

/** Exercise the mounted mobile workspace against the actual authenticated API. */
export async function verifyCRM16({page,base,shots}){
  assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname),'CRM fixtures require an isolated local server');
  const sessionResponse=await page.request.get(base+'/api/admin/session');assert.equal(sessionResponse.status(),200);
  const session=await sessionResponse.json(),headers={Origin:new URL(base).origin,'X-CSRF-Token':session.csrf};
  const createdResponse=await page.request.post(base+'/api/admin/leads',{headers,data:{name:'CRM16 <script>window.crm16Xss=true</script>',email:'crm16-'+randomUUID()+'@example.test',services:['glazing'],source:'phone',assignee:session.username,idempotency:randomUUID()}});
  assert.equal(createdResponse.status(),201,await createdResponse.text());const created=await createdResponse.json(),route='/api/admin/leads/'+created.id;
  const read=async()=>{const response=await page.request.get(base+route);assert.equal(response.status(),200);return response.json();};
  const waitMutation=method=>page.waitForResponse(response=>new URL(response.url()).pathname===route&&response.request().method()===method);
  try{
    await page.setViewportSize({width:390,height:844});
    await page.goto(base+'/admin/#leads/'+created.id,{waitUntil:'networkidle'});await page.reload({waitUntil:'networkidle'});
    await page.locator('#lead-edit').waitFor();
    const panes=['request','quote','communication','materials','economics'];
    for(const pane of panes)assert.equal(await page.locator('[data-lead-pane="'+pane+'"]').count(),1,'one pane control '+pane);
    assert.equal(await page.locator('[data-lead-pane=request]').getAttribute('aria-selected'),'true','request opens by default');
    assert.equal(await page.evaluate(()=>window.crm16Xss),undefined,'customer name is escaped');
    await page.locator('#lead-edit [name=note]').fill('Несохранённая заметка CRM16');
    await page.locator('#lead-edit [name=next_action]').fill('Уточнить комплектацию CRM16');
    const originalEdit=await page.locator('#lead-edit').elementHandle();
    for(const pane of ['quote','communication','materials','economics','request']){
      await page.locator('[data-lead-pane="'+pane+'"]').click();
      assert.equal(await page.locator('[data-lead-pane="'+pane+'"]').getAttribute('aria-selected'),'true');
      assert.equal(await originalEdit.evaluate(node=>node.isConnected),true,'switching panes keeps the lead form mounted');
      assert.equal(await page.locator('#lead-edit [name=note]').inputValue(),'Несохранённая заметка CRM16','panes preserve note');
      assert.equal(await page.locator('#lead-edit [name=next_action]').inputValue(),'Уточнить комплектацию CRM16','panes preserve follow-up');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'pane '+pane+' fits 390px');
    }
    assert.match(await page.locator('#lead-dirty-status').innerText(),/не сохран|несохран|изменени/i);
    await page.locator('[data-lead-pane=request]').focus();await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('[data-lead-pane=quote]').getAttribute('aria-selected'),'true','arrow key selects next pane');
    await page.keyboard.press('End');assert.equal(await page.locator('[data-lead-pane=economics]').getAttribute('aria-selected'),'true');
    await page.keyboard.press('Home');assert.equal(await page.locator('[data-lead-pane=request]').getAttribute('aria-selected'),'true');
    const savePromise=waitMutation('PATCH');await page.locator('#lead-save-sticky').click();const save=await savePromise;assert.equal(save.status(),200,await save.text());
    await page.locator('#lead-save-status').filter({hasText:'Сохранено'}).waitFor();
    let saved=await read();assert.equal(saved.note,'Несохранённая заметка CRM16');assert.equal(saved.next_action,'Уточнить комплектацию CRM16');
    assert.ok(!/не сохран|несохран/i.test(await page.locator('#lead-dirty-status').innerText()),'successful save clears dirty state');
    await page.locator('#lead-edit [name=note]').fill('Заметка перед быстрым звонком');
    for(const [index,outcome] of ['no_answer','discussed','waiting_materials'].entries()){
      const before=await read(),comment='Разговор '+index+' <img src=x onerror="window.call16Xss=true">',date='2031-12-'+String(index+10).padStart(2,'0'),next='Следующий шаг CRM16 '+index;
      await page.locator('#lead-call-result').click();await page.locator('#call-result-dialog').waitFor({state:'visible'});
      const call=page.locator('#call-result-form');await call.locator('[name=outcome]').selectOption(outcome);await call.locator('[name=comment]').fill(comment);await call.locator('[name=next_contact]').fill(date);await call.locator('[name=next_action]').fill(next);
      const resultPromise=page.waitForResponse(response=>new URL(response.url()).pathname===route+'/call-result'&&response.request().method()==='POST');
      await call.locator('button[type=submit]').click();const response=await resultPromise;assert.equal(response.status(),200,await response.text());const result=await response.json();
      await page.locator('#call-result-dialog').waitFor({state:'hidden'});
      const after=await read();assert.equal(after.revision,before.revision+1,'quick call is one atomic lead revision');assert.equal(after.next_contact,date);assert.equal(after.next_action,next);assert.equal(after.note,before.note,'quick call does not save unrelated draft');
      assert.equal(result.entry.outcome,outcome);assert.equal(await page.locator('#lead-edit [name=note]').inputValue(),'Заметка перед быстрым звонком','quick call retains internal draft');
      assert.equal(await page.locator('#lead-edit [name=next_contact]').inputValue(),date);assert.equal(await page.locator('#lead-edit [name=next_action]').inputValue(),next);
      const history=await (await page.request.get(base+route+'/history')).json();assert.equal(history.entries.filter(entry=>entry.type==='call'&&entry.text.includes(comment)).length,1,'exactly one history event per result');
      assert.equal(await page.evaluate(()=>window.call16Xss),undefined);
    }
    await page.locator('[data-lead-pane=communication]').click();await page.locator('#lead-history-list').filter({hasText:'Разговор 2'}).waitFor();assert.equal(await page.locator('#lead-history-list img').count(),0,'quick call history is literal text');
    const finalSave=waitMutation('PATCH');await page.locator('#lead-save-sticky').click();const savedResponse=await finalSave;assert.equal(savedResponse.status(),200,await savedResponse.text());await page.locator('#lead-save-status').filter({hasText:'Сохранено'}).waitFor();saved=await read();assert.equal(saved.note,'Заметка перед быстрым звонком','lead can still save after quick call revisions');
    // A stale call must not partially replace another manager's follow-up or append a history event.
    await page.locator('[data-lead-pane=request]').click();await page.locator('#lead-edit [name=note]').fill('Моя заметка при конфликте CRM16');await page.locator('#lead-call-result').click();
    const call=page.locator('#call-result-form');await call.locator('[name=outcome]').selectOption('discussed');await call.locator('[name=comment]').fill('Конфликтный звонок CRM16');await call.locator('[name=next_contact]').fill('2032-01-02');await call.locator('[name=next_action]').fill('Мой конфликтный следующий шаг');
    const beforeForeign=await read(),foreign=await page.request.patch(base+route,{headers,data:{revision:beforeForeign.revision,status:'review',note:'Чужая заметка CRM16',assignee:beforeForeign.assignee,next_contact:'2032-02-03',next_action:'Чужой следующий шаг'}});assert.equal(foreign.status(),200,await foreign.text());
    const conflictPromise=page.waitForResponse(response=>new URL(response.url()).pathname===route+'/call-result'&&response.request().method()==='POST');await call.locator('button[type=submit]').click();const conflict=await conflictPromise;assert.equal(conflict.status(),409);
    assert.equal(await page.locator('#call-result-dialog').isVisible(),true,'conflict keeps the result for review');assert.equal(await call.locator('[name=comment]').inputValue(),'Конфликтный звонок CRM16');assert.equal(await page.locator('#lead-edit [name=note]').inputValue(),'Моя заметка при конфликте CRM16');
    const protectedLead=await read();assert.equal(protectedLead.note,'Чужая заметка CRM16');assert.equal(protectedLead.status,'review');assert.equal(protectedLead.next_action,'Чужой следующий шаг');assert.equal(protectedLead.next_contact,'2032-02-03');const history=await (await page.request.get(base+route+'/history')).json();assert.equal(history.entries.filter(entry=>entry.text.includes('Конфликтный звонок CRM16')).length,0);
    await page.keyboard.press('Escape');
    for(const width of [320,390,1440]){await page.setViewportSize({width,height:width===1440?1000:844});for(const pane of panes){await page.locator('[data-lead-pane="'+pane+'"]').click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'CRM pane '+pane+' fits '+width);}await page.locator('[data-lead-pane=request]').click();await page.evaluate(()=>window.scrollTo(0,0));if(width!==320)await page.screenshot({path:path.join(shots,'crm16-'+(width===390?'mobile':'desktop')+'.png'),fullPage:true});}
    await page.locator('[data-tab=leads]').click();await page.locator('#confirm-dialog').waitFor({state:'visible'});await page.locator('#confirm-cancel').click();assert.equal(await page.locator('#lead-edit [name=note]').inputValue(),'Моя заметка при конфликте CRM16','cancelled navigation preserves draft');
    await page.locator('[data-tab=leads]').click();await page.locator('#confirm-dialog').waitFor({state:'visible'});await page.locator('#confirm-yes').click();await page.locator('#new-manual-lead').waitFor();
    console.log('PASS CRM16: mounted panes/keyboard, dirty sticky save and navigation guard, three atomic quick calls, literal history, preserved drafts and stale revision conflict, 320/390/1440 widths');
  }finally{const removed=await page.request.delete(base+route,{headers});assert.equal(removed.status(),200,'remove isolated CRM16 fixture');}
}
