import {db,fail,text,STATUSES} from './store.mjs';
export function dateOnly(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value+'T00:00:00.000Z').toISOString().slice(0,10)===value;}
export function staff(){return db.prepare('SELECT username FROM admins ORDER BY username').all().map(x=>x.username);}
export function todayParam(value){const date=value||new Date().toISOString().slice(0,10);if(!dateOnly(date))throw fail(422,'Проверьте дату.');return date;}
export function reminders(today,assignee=''){
 const active="status NOT IN ('won','closed') AND (?='' OR assignee=?)";
 const count=(test,...args)=>db.prepare('SELECT COUNT(*) n FROM leads WHERE '+active+' AND '+test).get(assignee,assignee,...args).n;
 return {today,overdue:count("next_contact<>'' AND next_contact<?",today),todayCount:count('next_contact=?',today),upcoming:count('next_contact>?',today),unscheduled:count("next_contact=''")};
}
export function listLeads(params,username){
 const status=params.get('status')||'',q=(params.get('q')||'').slice(0,100),offset=Math.max(0,Math.min(100000,Math.floor(Number(params.get('offset'))||0))),today=todayParam(params.get('today'));
 let assignee=params.get('assignee')||'';if(assignee==='@me')assignee=username;
 const due=params.get('due')||'';if(status&&!STATUSES[status]||!['','overdue','today','upcoming','unscheduled'].includes(due))throw fail(422,'Неизвестный фильтр.');
 let where="WHERE (?='' OR status=?) AND (?='' OR reference LIKE ? OR payload LIKE ?)";const args=[status,status,q,'%'+q+'%','%'+q+'%'];
 if(assignee){where+=' AND assignee=?';args.push(assignee);}
 if(due){where+=" AND status NOT IN ('won','closed')";if(due==='unscheduled')where+=" AND next_contact=''";else{where+=" AND next_contact<>'' AND next_contact"+({overdue:'<',today:'=',upcoming:'>'})[due]+'?';args.push(today);}}
 const order=due&&due!=='unscheduled'?'next_contact ASC,created DESC':'created DESC';
 const rows=db.prepare('SELECT id,reference,created,kind,status,payload,revision,assignee,next_contact,next_action FROM leads '+where+' ORDER BY '+order+' LIMIT 50 OFFSET ?').all(...args,offset).map(r=>({...r,payload:JSON.parse(r.payload)}));
 return {rows,total:db.prepare('SELECT COUNT(*) n FROM leads '+where).get(...args).n,offset,statuses:STATUSES,staff:staff(),reminders:reminders(today,assignee),today};
}
export function updateFollowup(lead,body){
 const assignee=text(body.assignee??lead.assignee,60),nextContact=text(body.next_contact??lead.next_contact,10),nextAction=text(body.next_action??lead.next_action,500);
 if(assignee&&!staff().includes(assignee))throw fail(422,'Ответственный сотрудник не найден.');
 if(nextContact&&!dateOnly(nextContact))throw fail(422,'Укажите корректную дату следующего контакта.');
 if(nextContact&&!nextAction)throw fail(422,'Укажите следующее действие для напоминания.');
 return {assignee,nextContact,nextAction};
}
