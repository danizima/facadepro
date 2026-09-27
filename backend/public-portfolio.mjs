// One public PDF per content revision and application version. Private shared
// selections and recipient-specific portfolios never enter this cache.
export function createPublicPortfolio({readContent,generate,version}) {
  let cached=null;
  const pending=new Map();
  const keyFor=value=>version+':'+value.revision;
  const fail=(status,message)=>Object.assign(new Error(message),{status});
  async function build(current,key) {
    let promise=pending.get(key);
    if(!promise) {
      const projects=current.projects.filter(project=>project.published!==false).slice(0,20);
      if(!projects.length)throw fail(404,'Портфолио пока не опубликовано. Обратитесь к менеджеру.');
      promise=Promise.resolve().then(()=>generate({projects,settings:current.settings,recipient:''}));
      pending.set(key,promise);
    }
    try{return await promise;}
    finally{if(pending.get(key)===promise)pending.delete(key);}
  }
  return async function publicPortfolio() {
    for(let attempt=0;attempt<3;attempt++) {
      const current=readContent(),key=keyFor(current);
      if(cached?.key===key)return cached.pdf;
      const pdf=await build(current,key);
      // An editor can hide a project while Python renders. Never return the
      // previous visibility state even to the request that started that render.
      if(keyFor(readContent())!==key)continue;
      cached={key,pdf};return pdf;
    }
    throw fail(503,'Портфолио обновляется. Повторите скачивание через минуту.');
  };
}
