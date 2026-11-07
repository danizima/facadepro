import {createHash} from 'node:crypto';

// Match the retired public contact without publishing its old values in source.
const retiredManagers=new Set([
 '3bfb0591dc118d749b60927dfd9c8ddb768002f65d11937e124212a13904be9b',
 '10b287e837b7297e0363a2a0fb6ad85b9c99d234ab94974a6b5469cfe74d6f73',
 'b4114869e2d417507a22959dc381c18f12739afc6e19c6b4feea825003a53a1c',
 '38532a539be72c912ab76e135e6639d85c9ecb6a10ac80be34beb8b692d4df4a',
 '96efa34f0e80ac4d71a5eac83d34e8ad27d38868e22d96598632714d1f9c9b7c',
 '2063f94cb04602d0519932e674c0fc8ebee993a424b525904bc865e5a5a72ae3',
 'a49b147e63da12ec370a47d8400a1fd9cea33a3d45a5c80ef3426ab04b3c06dc'
]);
const retiredPhone='a039eb20696e7d3a5b3fa54fccc1893bb92ce4f1460df568b01e7667917789a7';
const fingerprint=value=>createHash('sha256').update(value).digest('hex');
const nameKey=value=>value.normalize('NFKC').toLowerCase().replaceAll('ё','е').replace(/[^\p{L}]+/gu,' ').trim();
const phoneKey=value=>value.normalize('NFKC').replace(/\D/g,'').replace(/^[78](?=\d{10}$)/,'');

export function publicContact(manager,phone){
 return {
  manager:typeof manager==='string'&&retiredManagers.has(fingerprint(nameKey(manager)))?'Отдел проектов':manager,
  phone:typeof phone==='string'&&fingerprint(phoneKey(phone))===retiredPhone?'':phone
 };
}

// Startup must also clean restored copies. Only changed rows get new revisions;
// share tokens, documents, project choices, and CRM history stay intact.
export function removeRetiredContacts(db){
 db.exec('BEGIN IMMEDIATE');
 try{
  const row=db.prepare('SELECT json FROM content WHERE id=1').get(), value=JSON.parse(row.json);
  const {settings}=value;
  const next=publicContact(settings.manager,settings.phone);
  if(next.manager!==settings.manager||next.phone!==settings.phone){
   Object.assign(settings,next);
   db.prepare('UPDATE content SET revision=revision+1,json=? WHERE id=1').run(JSON.stringify(value));
  }
  if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='showcases'").get()){
   const update=db.prepare('UPDATE showcases SET revision=revision+1,manager=?,phone=? WHERE token=?');
   for(const old of db.prepare('SELECT token,manager,phone FROM showcases').all()){
    const next=publicContact(old.manager,old.phone);
    if(next.manager!==old.manager||next.phone!==old.phone)update.run(next.manager,next.phone,old.token);
   }
  }
  db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error;}
}
