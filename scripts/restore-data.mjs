import path from 'node:path';
import {verifyBackup,restoreBackup} from '../backend/backups.mjs';

const args=process.argv.slice(2);
try {
  if(args.length===2&&args[0]==='--verify') {
    const result=await verifyBackup(path.resolve(args[1]));
    console.log(JSON.stringify({ok:true,verified:true,createdAt:result.createdAt,files:result.files,leads:result.leads.length}));
  } else if(args.length===3&&args[1]==='--to-new-directory') {
    const result=await restoreBackup(path.resolve(args[0]),path.resolve(args[2]));
    console.log(JSON.stringify({ok:true,restored:true,createdAt:result.createdAt,files:result.files,leads:result.leads.length}));
    console.log('Restored to a new directory only. No service was started. Private runtime-config.json contains the saved app settings; apply them separately when switching the stopped service.');
  } else {
    console.error('Usage: node scripts/restore-data.mjs --verify BACKUP_DIRECTORY\n       node scripts/restore-data.mjs BACKUP_DIRECTORY --to-new-directory NEW_DATA_DIRECTORY');
    process.exitCode=2;
  }
} catch {console.error('Verification or restore failed. The existing data directory was not replaced. Check backup integrity and use a destination that does not exist.');process.exitCode=1;}
