// A recipient-specific PDF never shares the public portfolio cache. Content
// revisions cover project text, images and company settings, not just visibility.
export function createSelectedPortfolio({readContent,generate,text,fail}) {
  return async function selectedPortfolio(input) {
    const ids=input.projects;
    if(!Array.isArray(ids)||ids.length<1||ids.length>20||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'))throw fail(422,'Выберите от 1 до 20 разных объектов.');
    const current=readContent();
    const projects=ids.map(id=>current.projects.find(project=>project.id===id&&project.published!==false));
    if(projects.some(project=>!project))throw fail(422,'Один из объектов больше не опубликован. Обновите подборку.');
    const recipient=text(input.recipient||'',140);
    const pdf=await generate({projects,settings:current.settings,recipient});
    const latest=readContent();
    if(latest.revision!==current.revision||ids.some(id=>!latest.projects.some(project=>project.id===id&&project.published!==false)))throw fail(409,'Портфолио обновилось. Повторите сборку подборки.');
    return pdf;
  };
}
