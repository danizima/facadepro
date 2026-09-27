import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {applyContentUpdate13,mergeContentUpdate13} from '../backend/content-update13.mjs';

const update=JSON.parse(readFileSync(new URL('../source/portfolio-update13.json',import.meta.url)));
const seed=JSON.parse(readFileSync(new URL('../source/content.json',import.meta.url)));
const old=structuredClone(seed);
delete old.settings.ogrn;
for(const patch of update.updates){
  const project=old.projects.find(p=>p.id===patch.id);
  Object.assign(project,patch.guards);
  for(const field of patch.fields){
    let target=project;
    for(const key of field.path.slice(0,-1))target=target[key]??={};
    target[field.path.at(-1)]=field.before;
  }
}
const database=value=>{
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE content(id INTEGER PRIMARY KEY,revision INTEGER,json TEXT)');
  db.prepare('INSERT INTO content VALUES(1,4,?)').run(JSON.stringify(value));
  return db;
};
const read=db=>{const row=db.prepare('SELECT * FROM content').get();return {revision:row.revision,value:JSON.parse(row.json)};};
const db=database(old);
applyContentUpdate13(db,update);
assert.deepEqual(read(db),{revision:5,value:seed});
applyContentUpdate13(db,update);
assert.deepEqual(read(db),{revision:5,value:seed});
db.close();

const edited=structuredClone(old),burny=edited.projects.find(p=>p.id==='burny'),novy=edited.projects.find(p=>p.id==='novy');
burny.work='Состав работ уточнён инженером';
novy.case.result='Результат уточнён менеджером';novy.published=false;novy.images=['media/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg'];
edited.settings.ogrn='1234567890123';
const saved=mergeContentUpdate13(edited,update);
assert.deepEqual(saved.projects.find(p=>p.id==='burny'),burny);
const savedNovy=saved.projects.find(p=>p.id==='novy');
assert.equal(savedNovy.case.result,novy.case.result);assert.equal(savedNovy.published,false);assert.deepEqual(savedNovy.images,novy.images);
assert.match(savedNovy.case.solution,/1 270 м²/);assert.equal(saved.settings.ogrn,'1234567890123');
const changedCompany=structuredClone(old);changedCompany.settings.inn='1234567890';
assert.equal(mergeContentUpdate13(changedCompany,update).settings.ogrn,undefined);
const deleted=structuredClone(old);deleted.projects=deleted.projects.filter(p=>p.id!=='golden-horn');
assert.ok(!mergeContentUpdate13(deleted,update).projects.some(p=>p.id==='golden-horn'));
const fresh=database(seed);applyContentUpdate13(fresh,update);assert.deepEqual(read(fresh),{revision:4,value:seed});fresh.close();

const failed=database(old);
failed.exec("CREATE TABLE content_migrations(name TEXT PRIMARY KEY,applied_at TEXT); CREATE TRIGGER reject_marker BEFORE INSERT ON content_migrations BEGIN SELECT RAISE(ABORT,'test failure'); END");
assert.throws(()=>applyContentUpdate13(failed,update),/test failure/);
assert.deepEqual(read(failed),{revision:4,value:old});failed.close();
console.log('PASS v13 content: reviewed case migration, CMS changes/source guards, OGRN identity, once-only execution and rollback');
