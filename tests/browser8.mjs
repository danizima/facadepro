import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

export async function verifyRelease8({page, base, shots}) {
  await page.evaluate(() => localStorage.removeItem('facade_compare'));
  await page.goto(base + '/projects.html?service=glazing&city=' + encodeURIComponent('Владивосток'), {waitUntil:'networkidle'});
  assert.equal(await page.locator('#catalog-service').inputValue(), 'glazing');
  assert.equal(await page.locator('#catalog-city').inputValue(), 'Владивосток');
  const visible = page.locator('.catalog-grid .project-card:visible');
  assert.ok(await visible.count() > 0);
  assert.ok(await visible.evaluateAll(cards => cards.every(c => c.dataset.services.split(' ').includes('glazing') && c.dataset.city === 'Владивосток')));
  await page.locator('#project-search').fill('невозможный-поиск');
  assert.equal(await visible.count(), 0);
  await page.locator('[data-reset-filters]').click();
  assert.equal(await visible.count(), 12);
  assert.equal(new URL(page.url()).search, '');
  const select = id => page.locator('.catalog-grid [data-select-compare="' + id + '"]');
  await select('museum').click(); await select('burny').click(); await select('restaurant').click();
  assert.equal(await select('brusnika').isDisabled(), true);
  await page.reload({waitUntil:'networkidle'});
  assert.equal(await select('museum').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('.selection-chips li').count(), 3);
  await page.locator('[data-remove-selected=restaurant]').click();
  await page.screenshot({path:path.join(shots,'catalog-v8-desktop.png')});
  await page.locator('[data-selection-link]').click();
  await page.locator('.compare-table').waitFor();
  assert.equal(await page.locator('.compare-table thead th').count(), 3);

  await page.goto(base + '/projects/museum.html', {waitUntil:'networkidle'});
  await page.locator('.case-selection [data-select-compare=museum]').waitFor();
  await page.locator('.case-selection a').click();

  await page.locator('.request-project-context').waitFor();
  assert.equal(await page.locator('[name=comparedProjects]').inputValue(), 'museum');
  assert.equal(await page.locator('[name=object]').inputValue(), '');
  assert.equal(await page.locator('[name=city]').inputValue(), '');
  assert.deepEqual(await page.locator('[name=service]:checked').evaluateAll(els => els.map(e=>e.value)), ['glazing','height']);
  await page.locator('[name=object]').selectOption({label:'Общественное здание'});
  await page.locator('[name=city]').fill('Тестовый город');
  await page.locator('#request-next').click();
  await page.locator('.preparation-list summary').click();
  assert.equal(await page.locator('.preparation-list fieldset').count(), 2);
  await page.locator('.preparation-list input').first().check();
  const pending = page.waitForEvent('download');
  await page.locator('[data-checklist-download]').click();
  const download = await pending;
  const text = await readFile(await download.path(), 'utf8');
  assert.match(text, /\[✓\] Фасадные чертежи/); assert.match(text, /Работы на высоте/);
  await page.screenshot({path:path.join(shots,'request-v8-desktop.png')});
  await page.locator('#request-next').click();
  await page.locator('[name=name]').fill('Проверка выпуска 8');
  await page.locator('[name=phone]').fill('+7 999 000 00 00');
  await page.locator('[name=consent]').check();
  await page.locator('#request-next').click();
  await page.locator('#result-title').filter({hasText:'Заявка принята'}).waitFor();
  const leads = await (await page.request.get(base + '/api/admin/leads')).json();
  const lead = leads.rows.find(x => x.payload.name === 'Проверка выпуска 8');
  assert.ok(lead); assert.equal(lead.payload.comparedProjects[0].id, 'museum');
  assert.equal(lead.payload.city, 'Тестовый город');
  await page.goto(base + '/request.html?project=museum', {waitUntil:'networkidle'});
  await page.locator('.request-project-context button').click();
  assert.equal(await page.locator('[name=comparedProjects]').count(), 0);
  assert.equal(new URL(page.url()).searchParams.has('project'), false);

  const projectData = await (await page.request.get(base + '/api/public/projects')).json();
  await page.route('**/api/public/projects', route => route.fulfill({json:{projects:projectData.projects.filter(p=>p.id!=='museum')}}));
  await page.goto(base + '/projects.html', {waitUntil:'networkidle'});
  assert.equal(await page.locator('[data-select-compare=museum]').isDisabled(), true);
  assert.equal(await page.locator('[data-remove-selected=museum]').count(), 0);
  await page.goto(base + '/request.html?project=museum', {waitUntil:'networkidle'});
  assert.equal(await page.locator('[name=comparedProjects]').count(), 0);
  await page.unroute('**/api/public/projects');

  for (const width of [390,320]) {
    await page.setViewportSize({width,height:844});
    await page.goto(base + '/projects.html', {waitUntil:'networkidle'});
    await select('museum').click();
    assert.equal(await page.locator('.mobile-actions').isVisible(), false);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    if(width===390) await page.screenshot({path:path.join(shots,'catalog-v8-mobile.png')});
    await page.locator('.menu-toggle').click();
    assert.equal(await page.locator('.selection-tray').isVisible(), false);
    await page.keyboard.press('Escape');
    await page.locator('[data-selection-link]').click();
    await page.locator('.compare-table').waitFor();
    await page.goto(base + '/request.html?project=museum', {waitUntil:'networkidle'});
    await page.locator('.request-project-context').waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    if(width===390) await page.locator('.request-project-context').screenshot({path:path.join(shots,'request-v8-mobile.png')});
    await page.goto(base + '/services/glazing.html', {waitUntil:'networkidle'});
    await page.locator('[data-checklist-items] input').first().check();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.evaluate(() => localStorage.setItem('facade_compare', JSON.stringify(['burny'])));
  }
  await page.evaluate(() => localStorage.removeItem('facade_compare'));
  await page.setViewportSize({width:1440,height:1000});
  console.log('PASS v8 browser: catalogue filters, persistent selection, stale project removal, request attribution, checklist download and mobile layout');
}
