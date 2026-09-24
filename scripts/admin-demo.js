// Offline demonstration. No accounts, network requests, cookies, or persistence.
window.facadeAdminDemo=true;
const demoContent=DEMO_CONTENT;
window.facadeAdminAssets=DEMO_IMAGES;
let demoRevision=1;
const demoDay=offset=>{const d=new Date();d.setDate(d.getDate()+offset);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
const demoStaff=['Демонстрация','Второй сотрудник'];
function demoReminder(today,assignee=''){const list=demoLeads.filter(l=>!['won','closed'].includes(l.status)&&(!assignee||l.assignee===assignee));return {today,overdue:list.filter(l=>l.next_contact&&l.next_contact<today).length,todayCount:list.filter(l=>l.next_contact===today).length,upcoming:list.filter(l=>l.next_contact>today).length,unscheduled:list.filter(l=>!l.next_contact).length};}

let demoLeads=[{id:'00000000-0000-4000-8000-000000000001',reference:'DEMO-001',created:'2026-09-23T08:00:00.000Z',kind:'quote',status:'new',assignee:'Демонстрация',next_contact:demoDay(-1),next_action:'Уточнить исходные данные по объекту',note:'Пример обращения для знакомства с панелью.',revision:1,payload:{services:['glazing','windows'],object:'Общественное здание',city:'Демонстрационный объект',area:'2500',timing:'В течение 1–3 месяцев',documents:'Есть проект и спецификации',comment:'Это пример, а не реальная заявка. Можно изменить статус и заметку.',name:'Пример заказчика',company:'Демонстрационная компания',email:'demo@example.com',phone:'',sourcePage:'/quote.html'},files:[{id:'00000000-0000-4000-8000-000000000002',name:'Тестовое_ТЗ.txt',size:180}],notifications:[{kind:'manager',state:'pending'},{kind:'receipt',state:'pending'}]}];
demoLeads.push({...structuredClone(demoLeads[0]),id:'00000000-0000-4000-8000-000000000003',reference:'DEMO-002',assignee:'Второй сотрудник',next_contact:demoDay(0),next_action:'Обсудить состав работ',files:[]});
demoLeads.push({...structuredClone(demoLeads[0]),id:'00000000-0000-4000-8000-000000000004',reference:'DEMO-003',assignee:'',next_contact:'',next_action:'',files:[]});
window.fetch=async(input,options={})=>{
 const url=new URL(typeof input==='string'?input:input.url,'https://demo.invalid'),route=url.pathname,method=options.method||'GET',body=options.body instanceof FormData?options.body:options.body?JSON.parse(options.body):{};
 const result=(data,status=200)=>Promise.resolve(new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}}));
 if(route==='/api/admin/session')return result({username:'Демонстрация',csrf:'demo-only',smtpConfigured:false});
 if(route==='/api/admin/logout')return result({ok:true});
 if(route==='/api/admin/login')return result({error:'В демонстрации вход не нужен. Обновите страницу.'},400);
 if(route==='/api/admin/content'&&method==='GET')return result({...demoContent,revision:demoRevision});
 if(route==='/api/admin/content'&&method==='PUT'){if(body.revision!==demoRevision)return result({error:'Обновите данные демонстрации.'},409);demoContent.settings=body.settings;demoContent.projects=body.projects;demoRevision++;return result({...demoContent,revision:demoRevision});}
 if(route==='/api/admin/staff')return result({staff:demoStaff});
 if(route==='/api/admin/reminders')return result(demoReminder(url.searchParams.get('today')||demoDay(0),url.searchParams.get('mine')==='1'?'Демонстрация':''));
 if(route==='/api/admin/leads'&&method==='GET'){
  const q=(url.searchParams.get('q')||'').toLowerCase(),status=url.searchParams.get('status')||'',due=url.searchParams.get('due')||'',today=url.searchParams.get('today')||demoDay(0);let assignee=url.searchParams.get('assignee')||'';if(assignee==='@me')assignee='Демонстрация';
  const rows=demoLeads.filter(l=>(!status||l.status===status)&&(!assignee||l.assignee===assignee)&&JSON.stringify(l).toLowerCase().includes(q)&&(!due||(!['won','closed'].includes(l.status)&&(due==='unscheduled'?!l.next_contact:due==='overdue'?l.next_contact&&l.next_contact<today:due==='today'?l.next_contact===today:l.next_contact>today))));return result({rows,total:rows.length,offset:0,today,staff:demoStaff,reminders:demoReminder(today,assignee)});
 }
 const match=route.match(/^\/api\/admin\/leads\/([a-f0-9-]+)(\/retry)?$/);if(match){const lead=demoLeads.find(l=>l.id===match[1]);if(!lead)return result({error:'Пример удалён. Обновите страницу, чтобы восстановить демонстрацию.'},404);if(method==='GET')return result(lead);if(method==='PATCH'){if(body.revision!==lead.revision)return result({error:'Данные изменились. Откройте заявку повторно.'},409);if(body.next_contact&&!body.next_action?.trim())return result({error:'Укажите следующее действие для напоминания.'},422);lead.status=body.status;lead.note=body.note;lead.assignee=body.assignee||'';lead.next_contact=body.next_contact||'';lead.next_action=body.next_action||'';lead.revision++;return result({ok:true,revision:lead.revision});}if(method==='DELETE'){demoLeads=demoLeads.filter(l=>l.id!==lead.id);return result({ok:true});}return result({ok:true});}
 if(route==='/api/admin/media'&&method==='POST'){const file=body.get('files'),key='media/demo-'+Date.now()+'.jpg';window.facadeAdminAssets[key]=URL.createObjectURL(file);return result({key,url:window.facadeAdminAssets[key]},201);}
 if(route==='/api/admin/stats')return result({days:Number(url.searchParams.get('days'))||30,sessions:0,totalLeads:demoLeads.length,funnel:['page_view','request_start','step_2','step_3','submitted'].map(event=>({event,count:0})),pages:[],services:[],sources:[],leadPages:demoLeads.length?[{page:'/quote.html',count:demoLeads.length}]:[],leadsByDay:demoLeads.length?[{day:demoDay(0),count:demoLeads.length}]:[]});
 return result({error:'Это действие доступно в рабочей версии после размещения.'},400);
};
document.addEventListener('click',event=>{const a=event.target.closest('a[href^="/api/admin/files/"]');if(!a)return;event.preventDefault();const blob=new Blob(['Демонстрационное техническое задание.\nФАСАД.PRO — пример работы с вложениями.'],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='Тестовое_ТЗ.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);});
