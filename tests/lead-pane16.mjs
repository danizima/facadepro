// Old regression scenarios follow the same controls through the v16 sections.
export async function showLeadPane(page,name){
 const button=page.locator('[data-lead-pane="'+name+'"]');
 if(await button.count())await button.click();
}
