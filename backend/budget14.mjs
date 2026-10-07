const services = ['glazing','windows','repair'];
const scopes = ['installation','supply-installation'];
const defaults = {
  rates: [],
  regions: [{id:'vladivostok',label:'Владивосток и Приморье',multiplier:1},{id:'moscow',label:'Москва и область',multiplier:1},{id:'russia',label:'Другой регион России',multiplier:1}],
  heights: [{id:'low',label:'До 10 м',multiplier:1},{id:'medium',label:'10–30 м',multiplier:1},{id:'high',label:'Выше 30 м',multiplier:1}]
};

export function createBudget({db,fail,text,audit}) {
  db.exec('CREATE TABLE IF NOT EXISTS budget_settings(id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, updated_at TEXT NOT NULL, json TEXT NOT NULL)');
  if(!db.prepare('SELECT id FROM budget_settings WHERE id=1').get())db.prepare('INSERT INTO budget_settings VALUES(1,1,?,?)').run('',JSON.stringify(defaults));
  function config(){
    const row=db.prepare('SELECT * FROM budget_settings WHERE id=1').get(),c=JSON.parse(row.json);
    return {...c,configured:c.rates.length>0,revision:row.revision,updatedAt:row.updated_at};
  }
  function number(value,min,max,label){
    if((typeof value!=='number'&&typeof value!=='string')||String(value).trim()==='')throw fail(422,'Проверьте '+label+'.');
    const n=Number(value);
    if(!Number.isFinite(n)||n<min||n>max)throw fail(422,'Проверьте '+label+'.');
    return n;
  }
  function factors(rows,name){
    if(!Array.isArray(rows)||!rows.length||rows.length>20)throw fail(422,'Добавьте '+name+'.');
    const ids=new Set();
    return rows.map(row=>{
      if(!row||typeof row!=='object'||!/^[a-z][a-z0-9-]{0,39}$/.test(row.id)||ids.has(row.id))throw fail(422,'Проверьте идентификаторы: '+name+'.');
      ids.add(row.id);
      return {id:row.id,label:text(row.label,100,true),multiplier:number(row.multiplier,0.1,100,'коэффициент')};
    });
  }
  function save(input,username){
    if(!input||input.revision!==config().revision)throw fail(409,'Прайс изменился. Откройте настройки заново.');
    if(!Array.isArray(input.rates)||input.rates.length>6)throw fail(422,'Допустимо до шести ставок.');
    const keys=new Set(),rates=input.rates.map(row=>{
      if(!row||!services.includes(row.service)||!scopes.includes(row.scope)||keys.has(row.service+':'+row.scope))throw fail(422,'Проверьте направление и состав работ.');
      keys.add(row.service+':'+row.scope);
      const min=number(row.min,0.01,1e7,'нижнюю ставку'),max=number(row.max,min,1e7,'верхнюю ставку');
      if(Math.abs(min*100-Math.round(min*100))>1e-6||Math.abs(max*100-Math.round(max*100))>1e-6)throw fail(422,'Ставки указываются с точностью до копейки.');
      return {service:row.service,scope:row.scope,label:text(row.label||'',100),unit:'m2',min,max};
    });
    const next={rates,regions:factors(input.regions,'регионы'),heights:factors(input.heights,'высотные группы')};
    const result=db.prepare('UPDATE budget_settings SET revision=revision+1,updated_at=?,json=? WHERE id=1 AND revision=?').run(new Date().toISOString(),JSON.stringify(next),input.revision);
    if(!result.changes)throw fail(409,'Прайс изменился. Откройте настройки заново.');
    audit(username,'budget_updated','rates');return config();
  }
  function estimate(input){
    if(!input||!services.includes(input.service)||!scopes.includes(input.scope))throw fail(422,'Выберите направление и состав работ.');
    const c=config(),area=number(input.area,1,1e6,'площадь'),region=c.regions.find(r=>r.id===input.region),height=c.heights.find(h=>h.id===input.height);
    if(!region||!height)throw fail(422,'Выберите регион и высоту.');
    const row=c.rates.find(r=>r.service===input.service&&r.scope===input.scope);
    const summary={service:input.service,scope:input.scope,area,region:region.label,height:height.label};
    if(!row)return {available:false,currency:'RUB',rateRevision:c.revision,summary};
    const factor=area*region.multiplier*height.multiplier;
    const min=Math.floor(row.min*factor),max=Math.ceil(row.max*factor);
    if(!Number.isSafeInteger(min)||!Number.isSafeInteger(max))throw fail(422,'Объём слишком велик для предварительного расчёта.');
    return {available:true,min,max,currency:'RUB',rateRevision:c.revision,summary};
  }
  return {config,save,estimate};
}
