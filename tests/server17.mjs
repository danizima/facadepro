import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {setTimeout as delay} from 'node:timers/promises';
const root=new URL('../',import.meta.url).pathname,data=await mkdtemp(path.join(tmpdir(),'facadepro-brief17-'));
const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
const base='http://127.0.0.1:'+port,env={...process.env,DATA_DIR:data,PORT:String(port),PUBLIC_URL:base,NODE_ENV:'test',SMTP_HOST:'',SMTP_FROM:'',SMTP_PASSWORD:'',TELEGRAM_BOT_TOKEN:'',TELEGRAM_CHAT_ID:'',BACKUP_ENABLED:'false'};
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env,stdio:['ignore','ignore','pipe']});let log='';server.stderr.on('data',b=>log+=b);
const key=randomUUID(),details='Размеры 1200×1500; этаж 3. <script>alert(1)</script>';
function form(overrides={}){const f=new FormData();for(const [k,v] of Object.entries({kind:'request',service:'windows',name:'Тест объекта 17',object:'Коммерческое здание',city:'Владивосток',timing:'Нужно обсудить',phone:'+79990000017',consent:'yes',scope:'installation',elementCount:'0012',objectDetails:details,idempotency:key,...overrides}))f.set(k,v);return f;}
const send=f=>fetch(base+'/api/requests',{method:'POST',headers:{Origin:base},body:f});
const read=()=>{const db=new DatabaseSync(path.join(data,'facadepro.sqlite'),{readOnly:true});try{return db.prepare('SELECT payload FROM leads ORDER BY created,id').all().map(row=>JSON.parse(row.payload));}finally{db.close();}};
try{
 for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}if(server.exitCode!==null||i===99)throw Error(log||'Server did not start');await delay(50);}
 for(const bad of ['0','1.5','100001','12x'])assert.equal((await send(form({idempotency:randomUUID(),elementCount:bad}))).status,422,'invalid count '+bad);
 assert.equal((await send(form({idempotency:randomUUID(),objectDetails:'x'.repeat(1501)}))).status,422,'bounded details');
 const first=await send(form());assert.equal(first.status,201);const receipt=await first.json();assert.equal(receipt.received,true);
 const replay=await send(form());assert.equal(replay.status,200);assert.equal((await replay.json()).reference,receipt.reference);
 assert.equal((await send(form({objectDetails:'Изменённые размеры'}))).status,409,'changed details cannot replay accepted request');
 assert.equal(read().length,1);assert.equal(read()[0].elementCount,'12');assert.equal(read()[0].objectDetails,details);assert.equal(read()[0].scope,'installation');
 const oldStyle=form({idempotency:randomUUID(),elementCount:'',objectDetails:''});assert.equal((await send(oldStyle)).status,201);
 const rows=read();assert.equal(rows.length,2);const empty=rows.find(row=>!row.elementCount);assert.equal(Object.hasOwn(empty,'elementCount'),false);assert.equal(Object.hasOwn(empty,'objectDetails'),false,'empty new fields preserve the previous request digest shape');
 console.log('PASS v17 HTTP brief: integer bounds, bounded text, genuine persistence, safe literal content, retry dedupe, changed-input conflict and compatibility of empty optional fields');
}finally{
 if(server.exitCode===null&&server.signalCode===null)await new Promise(r=>{server.once('close',r);server.kill('SIGTERM');});
 await rm(data,{recursive:true,force:true});
}
