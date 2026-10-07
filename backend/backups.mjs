import {DatabaseSync,backup as sqliteBackup} from 'node:sqlite';
import {mkdir,readFile,writeFile,readdir,copyFile,chmod,lstat,rename,rm} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash,createDecipheriv,randomUUID} from 'node:crypto';
import path from 'node:path';
import {CLOSED_RETENTION_DAYS,purgeClosedLeads} from './retention.mjs';

const DAY=86400000;
const NAME=/^facadepro-\d{8}T\d{9}Z-[a-f0-9]{8}$/;
const ENV_KEYS=['NODE_ENV','PUBLIC_URL','PORT','TRUST_PROXY','COOKIE_SECURE','SMTP_HOST','SMTP_PORT','SMTP_SECURITY','SMTP_FROM','SMTP_USER','SMTP_PASSWORD','LEAD_TO','TELEGRAM_BOT_TOKEN','TELEGRAM_CHAT_ID'];
const allowed=key=>['facadepro.sqlite','secret','runtime-config.json'].includes(key)||/^(uploads|media|materials|quotes)\/[a-zA-Z0-9_.-]+$/.test(key);
function safeFile(root,key) {
  if(typeof key!=='string'||!allowed(key)||key.split('/').some(part=>part==='.'||part==='..'))throw Error('Invalid backup path');
  return path.join(root,key);
}
async function hashFile(file) {
  const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');
}
async function regular(file) {
  const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink())throw Error('Backup requires regular files');return info;
}
async function putFile(source,target) {
  await regular(source);await mkdir(path.dirname(target),{recursive:true,mode:0o700});
  await copyFile(source,target);await chmod(target,0o600);await regular(target);
}
function databaseReferences(db) {
  const refs=db.prepare('SELECT id,size FROM files').all().map(row=>({path:'uploads/'+row.id,size:row.size}));
  if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='quote_versions'").get())refs.push(...db.prepare('SELECT file_key,size FROM quote_versions').all().map(row=>({path:row.file_key,size:row.size})));
  const walk=value=>{
    if(typeof value==='string'&&/^(media|materials)\//.test(value))refs.push({path:value});
    else if(Array.isArray(value))value.forEach(walk);
    else if(value&&typeof value==='object')Object.values(value).forEach(walk);
  };
  const current=db.prepare('SELECT json FROM content WHERE id=1').get();if(current)walk(JSON.parse(current.json));
  return refs;
}
export async function verifyBackup(directory) {
  const dirInfo=await lstat(directory);if(!dirInfo.isDirectory()||dirInfo.isSymbolicLink())throw Error('Invalid backup directory');
  for(const folder of ['uploads','media','materials','quotes']) {
    try {const info=await lstat(path.join(directory,folder));if(!info.isDirectory()||info.isSymbolicLink())throw Error('Invalid backup data directory');}
    catch(error){if(error.code!=='ENOENT')throw error;}
  }
  await regular(path.join(directory,'manifest.json'));
  const manifest=JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8'));
  if(manifest.format!==1||!Number.isFinite(Date.parse(manifest.createdAt))||!Array.isArray(manifest.files))throw Error('Invalid backup manifest');
  const entries=new Map();
  for(const entry of manifest.files) {
    if(entries.has(entry.path)||!Number.isSafeInteger(entry.size)||entry.size<0||!/^[a-f0-9]{64}$/.test(entry.sha256))throw Error('Invalid backup manifest entry');
    const file=safeFile(directory,entry.path),info=await regular(file);
    if(info.size!==entry.size||await hashFile(file)!==entry.sha256)throw Error('Backup checksum mismatch');
    entries.set(entry.path,entry);
  }
  for(const name of ['facadepro.sqlite','secret','runtime-config.json'])if(!entries.has(name))throw Error('Incomplete backup');
  const secret=await readFile(path.join(directory,'secret'),'utf8');if(!/^[a-f0-9]{96}$/.test(secret))throw Error('Invalid backup encryption key');
  const runtime=JSON.parse(await readFile(path.join(directory,'runtime-config.json'),'utf8'));
  if(!runtime||Array.isArray(runtime)||Object.entries(runtime).some(([k,v])=>!ENV_KEYS.includes(k)||typeof v!=='string'))throw Error('Invalid saved runtime configuration');
  const db=new DatabaseSync(path.join(directory,'facadepro.sqlite'),{readOnly:true});
  try {
    const check=db.prepare('PRAGMA integrity_check').all();
    if(check.length!==1||Object.values(check[0])[0]!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Backup database integrity failed');
    for(const ref of databaseReferences(db)) {
      const entry=entries.get(ref.path);if(!entry||ref.size!==undefined&&entry.size!==ref.size)throw Error('A database attachment is missing from backup');
    }
    if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='notification_settings'").get()) {
      const row=db.prepare('SELECT sealed FROM notification_settings WHERE id=1').get();
      if(row) {
        const value=Buffer.from(row.sealed,'base64'),key=createHash('sha256').update(secret+'notifications-v6').digest();
        const cipher=createDecipheriv('aes-256-gcm',key,value.subarray(0,12));cipher.setAuthTag(value.subarray(12,28));
        JSON.parse(Buffer.concat([cipher.update(value.subarray(28)),cipher.final()]).toString());
      }
    }
    const columns=new Set(db.prepare('PRAGMA table_info(leads)').all().map(row=>row.name));
    const leads=db.prepare('SELECT id,revision,status,'+(columns.has('closed_at')?'closed_at':"'' AS closed_at")+' FROM leads').all();
    return {verified:true,createdAt:manifest.createdAt,version:manifest.version,files:manifest.files.length,bytes:manifest.files.reduce((sum,f)=>sum+f.size,0),leads};
  } finally {db.close();}
}

export async function createBackup({db,dataDir,backupDir=path.join(dataDir,'backups'),version='',environment=process.env,now=new Date()}) {
  await mkdir(backupDir,{recursive:true,mode:0o700});await chmod(backupDir,0o700);
  const name='facadepro-'+now.toISOString().replace(/[-:.]/g,'')+'-'+randomUUID().slice(0,8);
  const stage=path.join(backupDir,'.incomplete-'+randomUUID()),target=path.join(backupDir,name);
  await mkdir(stage,{mode:0o700});
  try {
    // SQLite's online backup includes committed WAL pages. A raw .sqlite copy
    // would silently miss those pages while the application is running.
    await sqliteBackup(db,path.join(stage,'facadepro.sqlite'));
    const snapshotDb=new DatabaseSync(path.join(stage,'facadepro.sqlite'));
    try {snapshotDb.exec('PRAGMA journal_mode=DELETE');} finally {snapshotDb.close();}
    await chmod(path.join(stage,'facadepro.sqlite'),0o600);
    await putFile(path.join(dataDir,'secret'),path.join(stage,'secret'));
    const runtime=Object.fromEntries(ENV_KEYS.filter(k=>environment[k]!==undefined).map(k=>[k,String(environment[k])]));
    await writeFile(path.join(stage,'runtime-config.json'),JSON.stringify(runtime),{mode:0o600,flag:'wx'});
    const files=['facadepro.sqlite','secret','runtime-config.json'];
    for(const folder of ['uploads','media','materials','quotes']) {
      await mkdir(path.join(stage,folder),{mode:0o700});
      const source=path.join(dataDir,folder);
      let entries;try{const info=await lstat(source);if(!info.isDirectory()||info.isSymbolicLink())throw Error('Invalid source data directory');entries=await readdir(source);}catch(error){if(error.code==='ENOENT')continue;throw error;}
      for(const entry of entries) {
        const key=folder+'/'+entry;
        await putFile(safeFile(dataDir,key),safeFile(stage,key));files.push(key);
      }
    }
    const manifest={format:1,createdAt:now.toISOString(),version,files:[]};
    for(const key of files.sort()) {
      const file=safeFile(stage,key),info=await regular(file);
      manifest.files.push({path:key,size:info.size,sha256:await hashFile(file)});
    }
    await writeFile(path.join(stage,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600,flag:'wx'});
    // A concurrent deletion can make the snapshot incomplete. Reject it and
    // preserve older copies; never publish an apparently successful bad copy.
    const verified=await verifyBackup(stage);
    await rename(stage,target);return {...verified,name,directory:target};
  } catch(error) {await rm(stage,{recursive:true,force:true});throw error;}
}

export async function pruneBackups(backupDir,{now=new Date(),keep=14,maxAgeDays=14}={}) {
  if(!Number.isInteger(keep)||keep<1||keep>90||maxAgeDays<1||maxAgeDays>90)throw Error('Invalid backup retention');
  const entries=(await readdir(backupDir)).filter(name=>NAME.test(name)).sort().reverse();
  const removed=[];
  for(let i=0;i<entries.length;i++) {
    const directory=path.join(backupDir,entries[i]);
    // Only our complete directories are eligible; never follow links or remove
    // a user's unrelated backup directory. Keep the newest successful copy.
    const info=await lstat(directory);if(!info.isDirectory()||info.isSymbolicLink())continue;
    const manifest=JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8'));
    if(manifest.format!==1||!Number.isFinite(Date.parse(manifest.createdAt)))continue;
    if(i>0&&(i>=keep||now.getTime()-Date.parse(manifest.createdAt)>maxAgeDays*DAY)) {
      await rm(directory,{recursive:true});removed.push(entries[i]);
    }
  }
  return removed;
}

export async function restoreBackup(directory,target) {
  const verified=await verifyBackup(directory);
  try {await lstat(target);throw Error('Restore destination already exists; use a new directory');}
  catch(error){if(error.code!=='ENOENT')throw error;}
  const stage=target+'.restore-'+randomUUID();await mkdir(stage,{mode:0o700});
  try {
    const manifest=JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8'));
    for(const entry of manifest.files)await putFile(safeFile(directory,entry.path),safeFile(stage,entry.path));
    await putFile(path.join(directory,'manifest.json'),path.join(stage,'manifest.json'));
    for(const folder of ['uploads','media','materials','quotes'])await mkdir(path.join(stage,folder),{recursive:true,mode:0o700});
    await verifyBackup(stage);
    // mkdir is exclusive: refuse an existing target even if it appeared while
    // copying. A restore never overlays a running DATA_DIR.
    await mkdir(target,{mode:0o700});
    try {for(const entry of await readdir(stage))await rename(path.join(stage,entry),path.join(target,entry));}
    catch(error){throw Error('Restore staging failed; keep the source backup and inspect the new destination',{cause:error});}
    await rm(stage,{recursive:true});return {...verified,directory:target};
  } catch(error) {await rm(stage,{recursive:true,force:true});throw error;}
}

export function maintenanceConfig(environment=process.env) {
  const number=(key,fallback,min,max)=>{const v=environment[key]===undefined?fallback:Number(environment[key]);if(!Number.isInteger(v)||v<min||v>max)throw Error('Invalid '+key);return v;};
  return {enabled:environment.BACKUP_ENABLED===undefined?environment.NODE_ENV==='production':environment.BACKUP_ENABLED==='true',intervalHours:number('BACKUP_INTERVAL_HOURS',24,1,168),keep:number('BACKUP_MAX_COPIES',14,1,90),maxAgeDays:number('BACKUP_RETENTION_DAYS',14,1,90)};
}

export function createMaintenance({db,dataDir,version,environment=process.env}) {
  const config=maintenanceConfig(environment),backupDir=path.join(dataDir,'backups');let running=null;
  let state={lastBackupAt:null,lastVerifiedAt:null,lastAttemptAt:null,lastError:null,lastRetention:null};
  async function readState(){try{state={...state,...JSON.parse(await readFile(path.join(backupDir,'status.json'),'utf8'))};}catch(error){if(error.code!=='ENOENT')state.lastError='Не удалось прочитать состояние резервирования.';}}
  async function saveState(){await mkdir(backupDir,{recursive:true,mode:0o700});const file=path.join(backupDir,'.status-'+randomUUID());await writeFile(file,JSON.stringify(state)+'\n',{mode:0o600});await rename(file,path.join(backupDir,'status.json'));}
  const loaded=readState();
  async function execute(force=false) {
    await loaded;if(!config.enabled)return;
    const now=new Date();
    if(!force&&state.lastBackupAt&&now.getTime()-Date.parse(state.lastBackupAt)<config.intervalHours*3600000)return;
    state.lastAttemptAt=now.toISOString();
    try {
      const snapshot=await createBackup({db,dataDir,backupDir,version,environment,now});
      state.lastBackupAt=snapshot.createdAt;state.lastVerifiedAt=new Date().toISOString();state.lastError=null;
      state.lastRetention=await purgeClosedLeads(db,dataDir,snapshot);
      await pruneBackups(backupDir,{keep:config.keep,maxAgeDays:config.maxAgeDays});
    } catch {state.lastError='Локальная резервная копия или обслуживание не завершены. Проверьте свободное место и журнал сервера.';console.error('Local data maintenance failed; existing backups were retained.');}
    await saveState();
  }
  return {
    run(force=false){if(!running)running=execute(force).finally(()=>{running=null;});return running;},
    async status(){await loaded;return {retention:{closedDays:CLOSED_RETENTION_DAYS,activeLeads:'preserved',contracts:'preserved'},backups:{...config,...state,running:Boolean(running),localOnly:true}};},
    async wait(){if(running)await running;}
  };
}
