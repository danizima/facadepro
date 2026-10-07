import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import path from 'node:path';

/** Real staff writes with a deterministic server calendar and opposite browser days. */
export async function verifyCalendar17({page,base,shots}){
  assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname),'calendar fixtures require an isolated local server');
  const sessionResponse=await page.request.get(base+'/api/admin/session');assert.equal(sessionResponse.status(),200);
  const session=await sessionResponse.json(),headers={Origin:new URL(base).origin,'X-CSRF-Token':session.csrf},created=[],contexts=[];
  const get=async route=>{const response=await page.request.get(base+route);assert.equal(response.status(),200,await response.text());return response.json();};
  async function create(label,next_contact){
    const response=await page.request.post(base+'/api/admin/leads',{headers,data:{name:'Calendar17 '+label,email:'calendar17-'+randomUUID()+'@example.test',services:['glazing'],source:'other',assignee:session.username,next_contact,next_action:'Уточнить объект Calendar17',idempotency:randomUUID()}});
    assert.equal(response.status(),201,await response.text());const lead=await response.json();created.push(lead);return lead;
  }
  try{
    const overdue=await create('прошедший контакт','2026-12-30'),today=await create('контакт сегодня','2026-12-31'),future=await create('будущий контакт','2027-01-01');
    const storageState=await page.context().storageState();
    for(const scenario of [
      {zone:'America/Los_Angeles',instant:'2026-12-30T23:30:00Z',browserDate:'2026-12-30',shot:'west'},
      {zone:'Pacific/Kiritimati',instant:'2026-12-31T12:30:00Z',browserDate:'2027-01-01',shot:'east'},
    ]){
      const context=await page.context().browser().newContext({storageState,timezoneId:scenario.zone,viewport:{width:390,height:844},reducedMotion:'reduce'});contexts.push(context);
      await context.addInitScript(({instant,key})=>{
        const RealDate=Date;
        class FixedDate extends RealDate{constructor(...args){super(...(args.length?args:[instant]));}static now(){return instant;}}
        window.Date=FixedDate;
        try{localStorage.removeItem(key);}catch{}
      },{instant:Date.parse(scenario.instant),key:'facadepro.crm16.filters.'+encodeURIComponent(session.username)});
      const calendarPage=await context.newPage();calendarPage.setDefaultTimeout(12000);const errors=[];calendarPage.on('pageerror',error=>errors.push(error.message));
      let serverToday='2026-12-31',failNextReminder=false;const calendarRequests=[];
      await calendarPage.route(/\/api\/admin\/(?:leads|reminders|day)(?:\?.*)?$/,async route=>{
        const request=route.request(),url=new URL(request.url());
        if(request.method()!=='GET')return route.continue();
        calendarRequests.push({pathname:url.pathname,today:url.searchParams.get('today')});
        if(failNextReminder&&url.pathname==='/api/admin/reminders'){failNextReminder=false;await route.fulfill({status:503,json:{error:'Календарь временно недоступен Calendar17'}});return;}
        const response=await route.fetch(),data=await response.json();
        await route.fulfill({response,json:{...data,today:serverToday,timezone:'Asia/Vladivostok'}});
      });
      await calendarPage.goto(base+'/admin/',{waitUntil:'networkidle'});await calendarPage.locator('#new-manual-lead').waitFor();
      const actualBrowserDate=await calendarPage.evaluate(()=>{const value=new Date();return [value.getFullYear(),String(value.getMonth()+1).padStart(2,'0'),String(value.getDate()).padStart(2,'0')].join('-');});
      assert.equal(actualBrowserDate,scenario.browserDate,'fixture really has a different browser day');assert.notEqual(actualBrowserDate,serverToday);
      assert.match(await calendarPage.locator('.follow-explanation').innerText(),/31 декабря 2026/,'lead list describes the server day');
      for(const [lead,state] of [[overdue,'overdue'],[today,'today'],[future,'upcoming']]){
        const card=calendarPage.locator('.lead-mobile-card').filter({has:calendarPage.locator('[data-lead="'+lead.id+'"]')});
        await card.waitFor();assert.equal(await card.locator('.follow-'+state).count(),1,'real row uses the server calendar: '+state+' in '+scenario.zone);
      }
      await calendarPage.locator('[data-tab=day]').click();await calendarPage.locator('.day-toolbar').waitFor();
      const dayText=await calendarPage.locator('.day-toolbar').innerText();assert.match(dayText,/31 декабря 2026/);assert.match(dayText,/Asia\/Vladivostok/);
      await calendarPage.goto(base+'/admin/#leads/'+overdue.id,{waitUntil:'networkidle'});await calendarPage.reload({waitUntil:'networkidle'});await calendarPage.locator('#lead-edit').waitFor();
      assert.match(await calendarPage.locator('.follow-editor-note').innerText(),/Дата контакта уже прошла/,'detail hint agrees with list despite browser timezone');
      const original=await get('/api/admin/leads/'+overdue.id);
      async function choose(days,expected){
        const before=calendarRequests.filter(request=>request.pathname==='/api/admin/reminders').length;
        await calendarPage.locator('[data-contact-days="'+days+'"]').click();
        await calendarPage.waitForFunction(value=>document.querySelector('#lead-edit [name=next_contact]')?.value===value,expected);
        assert.ok(calendarRequests.filter(request=>request.pathname==='/api/admin/reminders').length>before,'quick date refreshes the server calendar');
        assert.equal(await calendarPage.locator('#lead-edit [name=next_contact]').inputValue(),expected);
      }
      await choose(0,'2026-12-31');await choose(1,'2027-01-01');await choose(3,'2027-01-03');
      assert.equal((await get('/api/admin/leads/'+overdue.id)).next_contact,original.next_contact,'quick choices remain an unsaved staff draft');
      serverToday='2027-01-01';await choose(0,'2027-01-01');await choose(3,'2027-01-04');
      serverToday='2028-02-28';await choose(1,'2028-02-29');await choose(3,'2028-03-02');
      const dateBeforeFailure=await calendarPage.locator('#lead-edit [name=next_contact]').inputValue();failNextReminder=true;
      await calendarPage.locator('[data-contact-days="0"]').click();
      await calendarPage.locator('#lead-save-status').filter({hasText:'Календарь временно недоступен Calendar17'}).waitFor();
      assert.equal(await calendarPage.locator('#lead-edit [name=next_contact]').inputValue(),dateBeforeFailure,'calendar failure preserves the existing draft instead of using the device day');
      await calendarPage.waitForFunction(()=>!document.querySelector('#lead-save-sticky').disabled);
      const savedPromise=calendarPage.waitForResponse(response=>new URL(response.url()).pathname==='/api/admin/leads/'+overdue.id&&response.request().method()==='PATCH');
      await calendarPage.locator('#lead-save-sticky').click();const saved=await savedPromise;assert.equal(saved.status(),200,await saved.text());
      await calendarPage.locator('#lead-save-status').filter({hasText:'Сохранено'}).waitFor();assert.equal((await get('/api/admin/leads/'+overdue.id)).next_contact,'2028-03-02','date-only result is persisted by the actual API');
      assert.ok(calendarRequests.some(request=>request.pathname==='/api/admin/leads'));assert.ok(calendarRequests.some(request=>request.pathname==='/api/admin/day'));assert.ok(calendarRequests.some(request=>request.pathname==='/api/admin/reminders'));
      assert.deepEqual(calendarRequests.filter(request=>request.today!==null),[],'browser never overrides the server day in a request');assert.deepEqual(errors,[]);
      if(shots)await calendarPage.screenshot({path:path.join(shots,'calendar17-'+scenario.shot+'.png'),fullPage:true});
      await context.close();contexts.splice(contexts.indexOf(context),1);
      // Restore the real row for the other browser timezone; no fixture business data is mocked.
      const after=await get('/api/admin/leads/'+overdue.id),reset=await page.request.patch(base+'/api/admin/leads/'+overdue.id,{headers,data:{revision:after.revision,status:after.status,note:after.note,assignee:after.assignee,next_contact:'2026-12-30',next_action:after.next_action}});assert.equal(reset.status(),200,await reset.text());
    }
    console.log('PASS calendar17: opposite browser days, server list/detail/day calendar, fresh quick dates after midnight, New Year and leap-month rollover, explicit real API save, no today override');
  }finally{
    for(const context of contexts)await context.close();
    for(const lead of created){const removed=await page.request.delete(base+'/api/admin/leads/'+lead.id,{headers});assert.equal(removed.status(),200,'remove isolated calendar fixture');}
  }
}
