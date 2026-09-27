import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createBackup,pruneBackups,maintenanceConfig} from '../backend/backups.mjs';

// Does not import store.mjs: taking a backup must not migrate a database or send
// notifications. Use the same app environment when preserving SMTP fallbacks.
const dataDir=path.resolve(process.env.DATA_DIR||new URL('../data',import.meta.url).pathname);
const config=maintenanceConfig(process.env);
let db;
try {
  db=new DatabaseSync(path.join(dataDir,'facadepro.sqlite'),{readOnly:true});
  const version=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')).version;
  const result=await createBackup({db,dataDir,version});
  await pruneBackups(path.join(dataDir,'backups'),{keep:config.keep,maxAgeDays:config.maxAgeDays});
  console.log(JSON.stringify({ok:true,backup:result.name,createdAt:result.createdAt,files:result.files,bytes:result.bytes}));
} catch {console.error('Backup failed. Existing copies were retained; check paths, permissions and free disk space.');process.exitCode=1;}
finally {db?.close();}
