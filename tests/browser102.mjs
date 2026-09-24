import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifyRelease102({page,base,shots}) {
  await page.goto(base+'/projects.html?category=public',{waitUntil:'networkidle'});
  await page.locator('[data-filter="public"]').click();
  assert.equal(await page.locator('.catalog-grid .project-card:visible').count(),1);
  await page.locator('.catalog-grid [data-project-id=dvfu] .project-open').click();
  assert.match(await page.locator('main').innerText(),/ФОК-1 и ФОК-2/);
  assert.equal(await page.locator('.visual-gallery,.gallery-zoom').count(),0);
  assert.equal(await page.locator('.case-page-nav a[href="#project-photos"]').count(),0);
  for(const width of [1440,390,320]) {
    await page.setViewportSize({width,height:900});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'DVFU fits '+width);
    if(width!==320)await page.screenshot({path:path.join(shots,'dvfu-'+width+'.png')});
  }
  await page.goto(base+'/request.html?project=dvfu',{waitUntil:'networkidle'});
  await page.locator('.request-project-context').waitFor();
  assert.ok(await page.locator('.request-project-context img').evaluate(img=>img.complete&&img.naturalWidth>0));
  await page.goto(base+'/compare.html?projects=dvfu,museum',{waitUntil:'networkidle'});
  await page.locator('.compare-table').waitFor();
  assert.match(await page.locator('.compare-table').innerText(),/ФОК-1/);
  await page.goto(base+'/map.html',{waitUntil:'networkidle'});
  await page.locator('#map-list [data-id=dvfu]').click();
  assert.match(await page.locator('#map-detail').innerText(),/ФОК-1/);
  await page.goto(base+'/portfolio.html?projects=dvfu',{waitUntil:'networkidle'});
  await page.locator('#portfolio-cards [value=dvfu]').waitFor();
  const pending=page.waitForEvent('download');await page.locator('#portfolio-build').click();
  const pdf=await pending;assert.match(pdf.suggestedFilename(),/\.pdf$/);await pdf.saveAs(path.join(shots,'dvfu-portfolio.pdf'));
  // Staff can edit and preview a case without photos.
  await page.goto(base+'/admin/',{waitUntil:'networkidle'});
  await page.locator('[data-tab=projects]').click();await page.locator('[data-project-edit=dvfu]').click();
  await page.locator('#preview-project').click();await page.locator('#preview-dialog').waitFor({state:'visible'});
  assert.match(await page.frameLocator('#preview-frame').locator('h1').innerText(),/ДВФУ/);
  await page.locator('#close-preview').click();await page.locator('#close-project').click();
  await page.setViewportSize({width:1440,height:1000});
  console.log('PASS 10.2: public filter, text-only case, mobile layout, request context, comparison, map, PDF and admin preview');
}
