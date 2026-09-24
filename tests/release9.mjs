import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,rm,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const root=new URL('../',import.meta.url).pathname,temp=await mkdtemp(path.join(tmpdir(),'facadepro-v9-')),base='http://127.0.0.1:18748';
const env={...process.env,DATA_DIR:temp,PORT:'18748',PUBLIC_URL:base,NODE_ENV:'test',SMTP_HOST:'',SMTP_FROM:'',TELEGRAM_BOT_TOKEN:'',TELEGRAM_CHAT_ID:''};
const admin=spawnSync(process.execPath,['scripts/create-admin.mjs','tester9'],{cwd:root,env,encoding:'utf8'});assert.equal(admin.status,0);
const password=admin.stdout.match(/Одноразовая выдача пароля: (.+)/)[1];
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env,stdio:['ignore','ignore','pipe']});let log='',cookie='',csrf='';server.stderr.on('data',b=>log+=b);
async function call(route,body,auth=false,method=body?'POST':'GET'){return fetch(base+route,{method,headers:{Origin:base,...(auth?{Cookie:cookie,'X-CSRF-Token':csrf}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});}
const version=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')).version;
const kit=(projects=[],documents=[],profile=true)=>({profile,projects,documents});
try{
 for(let i=0;i<150;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}if(i===149)throw Error(log);await new Promise(r=>setTimeout(r,100));}
 assert.equal((await(await call('/healthz')).json()).version,version);
 const login=await call('/api/admin/login',{username:'tester9',password});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];csrf=(await login.json()).csrf;
 const home=await(await call('/')).text();assert.ok(home.includes('updates.html">Версия '+version));
 assert.equal([...home.matchAll(/<script src=/g)].length,1);assert.equal([...home.matchAll(/<link rel="stylesheet"/g)].length,1);
 const bundle=home.match(/href="(bundles\/site-[a-f0-9]+\.css)"/)[1];
 const plain=await fetch(base+'/'+bundle,{headers:{'Accept-Encoding':'identity'}}),gzip=await fetch(base+'/'+bundle,{headers:{'Accept-Encoding':'gzip'}});
 assert.match(gzip.headers.get('cache-control'),/immutable/);assert.equal(gzip.headers.get('content-encoding'),'gzip');assert.ok(Number(gzip.headers.get('content-length'))<Number(plain.headers.get('content-length'))*.35);assert.equal(await gzip.text(),await plain.text());
 const etag=gzip.headers.get('etag');assert.equal((await fetch(base+'/'+bundle,{headers:{'Accept-Encoding':'gzip','If-None-Match':etag}})).status,304);
 assert.equal((await fetch(base+'/'+bundle,{headers:{'Accept-Encoding':'gzip;q=0, *;q=1'}})).headers.get('content-encoding'),null);
 const head=await fetch(base+'/'+bundle,{method:'HEAD',headers:{'Accept-Encoding':'gzip'}});assert.equal(await head.text(),'');assert.equal(head.headers.get('content-length'),gzip.headers.get('content-length'));
 const adminPage=await call('/admin/');assert.equal(adminPage.headers.get('cache-control'),'no-store');assert.equal(adminPage.headers.get('etag'),null);
 const sitemap=await(await call('/sitemap.xml')).text();for(const task of ['new','repair','leak','glass','height']){const route='/tasks/'+task+'.html';assert.ok(sitemap.includes(route));assert.match(await(await call(route)).text(),new RegExp('request.html\\?solution='+task));}
 const available=await(await call('/api/public/contractor-kit')).json();assert.equal(available.projects.length,12);assert.deepEqual(available.documents,[]);
 for(const input of [kit([],[],false),kit(['missing']),kit(['museum','museum']),kit([],['../uploads/x']),{...kit(),profile:'true'}])assert.equal((await call('/api/contractor-kit',input)).status,422);
 const response=await call('/api/contractor-kit',kit(['museum','restaurant']));assert.equal(response.status,200,await response.clone().text());assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('content-type'),'application/zip');
 const zip=Buffer.from(await response.arrayBuffer()),out=path.join(root,'artifacts/pdf-v9');await mkdir(out,{recursive:true});await writeFile(path.join(out,'contractor-kit.zip'),zip);
 const extracted=spawnSync('python3',['-c',`from zipfile import ZipFile\nimport sys\nz=ZipFile(sys.argv[1]);assert set(z.namelist())=={'01_Карточка_компании.pdf','02_Портфолио.pdf','Состав_пакета.txt'};z.extractall(sys.argv[2]);assert '${version}' in z.read('Состав_пакета.txt').decode('utf-8-sig')`,path.join(out,'contractor-kit.zip'),out],{encoding:'utf8'});assert.equal(extracted.status,0,extracted.stderr);
 let c=await(await call('/api/admin/content',undefined,true)).json();
 const uploadBody=new FormData();uploadBody.append('files',new Blob([Buffer.from('%PDF-1.4\nQA public document\n%%EOF')]),'qa.pdf');
 const uploaded=await fetch(base+'/api/admin/materials/upload',{method:'POST',headers:{Origin:base,Cookie:cookie,'X-CSRF-Token':csrf},body:uploadBody});assert.equal(uploaded.status,201);const file=await uploaded.json();
 const doc={id:'v9-document',kind:'document',title:'Документ проверки',file:file.key,published:false,confirmed:true,project:'museum'};
 async function save(){const r=await call('/api/admin/content',c,true,'PUT');assert.equal(r.status,200,await r.clone().text());c=await r.json();}
 c.materials=[doc];await save();assert.equal((await call('/api/contractor-kit',kit([],['v9-document']),true)).status,422);
 c.materials[0].published=true;await save();assert.equal((await(await call('/api/public/contractor-kit')).json()).documents.length,1);
 const documentZip=await call('/api/contractor-kit',kit([],['v9-document'],false));assert.equal(documentZip.status,200);const checkZip=spawnSync('python3',['-c',"import sys,io,zipfile;z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()));assert z.read('Документы/01_Документ.pdf').startswith(b'%PDF-')"],{input:Buffer.from(await documentZip.arrayBuffer())});assert.equal(checkZip.status,0);
 c.projects.find(p=>p.id==='museum').published=false;await save();assert.equal((await(await call('/api/public/contractor-kit')).json()).documents.length,0);assert.equal((await call('/api/contractor-kit',kit(['museum']),true)).status,422);assert.equal((await call('/api/contractor-kit',kit([],['v9-document']),true)).status,422);
 const updated=await(await call('/')).text();const js=updated.match(/src="(bundles\/page-[a-f0-9]+\.js)"/)[1];assert.equal((await call('/'+js)).status,200);
 console.log('PASS v9: task routes, version, ZIP/PDF generation, current public documents only, hidden project exclusion even for staff, gzip/ETag/HEAD/cache and regenerated bundles');
}finally{const done=new Promise(r=>server.once('close',r));server.kill();await done;await rm(temp,{recursive:true,force:true});}
