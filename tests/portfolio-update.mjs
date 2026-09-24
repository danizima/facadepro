import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {applyPortfolioUpdate} from '../backend/portfolio-update.mjs';

const update=JSON.parse(readFileSync(new URL('../source/portfolio-update10-2.json',import.meta.url)));
const seed=JSON.parse(readFileSync(new URL('../source/content.json',import.meta.url)));
const old=structuredClone(seed);
old.projects=old.projects.filter(p=>!update.additions.some(a=>a.id===p.id));
for(const patch of update.updates) {
  const p=old.projects.find(p=>p.id===patch.id);
  for(const field of patch.fields) {
    let target=p; for(const key of field.path.slice(0,-1)) target=target[key]??={};
    target[field.path.at(-1)]=field.before;
  }
}
function database(value) {
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE content(id INTEGER PRIMARY KEY,revision INTEGER,json TEXT); CREATE TABLE leads(id TEXT,payload TEXT)');
  db.prepare('INSERT INTO content VALUES(1,7,?)').run(JSON.stringify(value));
  db.prepare('INSERT INTO leads VALUES(?,?)').run('existing','unchanged enquiry');
  return db;
}
const read=db=>{const r=db.prepare('SELECT * FROM content').get();return {revision:r.revision,value:JSON.parse(r.json)};};
// Existing CMS edits, visibility and photos survive the release.
const edited=structuredClone(old),lider=edited.projects.find(p=>p.id==='lider');
edited.settings.manager='Редактор';lider.work='Описание менеджера';lider.published=false;lider.images=['media/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg'];
lider.case.challenge='Уточнение от инженера';
const db=database(edited);applyPortfolioUpdate(db,update);let result=read(db);
assert.equal(result.revision,8);assert.equal(result.value.settings.manager,'Редактор');
const saved=result.value.projects.find(p=>p.id==='lider');
assert.equal(saved.work,lider.work);assert.equal(saved.case.challenge,lider.case.challenge);assert.equal(saved.published,false);assert.deepEqual(saved.images,lider.images);
assert.match(saved.case.solution,/Дом №4/);
assert.equal(result.value.projects.find(p=>p.id==='meridiany').period,'2023–2025');
assert.deepEqual(result.value.projects.find(p=>p.id==='dvfu').images,[]);
assert.equal(db.prepare('SELECT payload FROM leads').get().payload,'unchanged enquiry');
// Restart must neither duplicate DVFU nor undo a subsequent deletion/edit.
result.value.projects=result.value.projects.filter(p=>p.id!=='dvfu');
result.value.projects.find(p=>p.id==='meridiany').period='Редакция после выпуска';
db.prepare('UPDATE content SET json=?').run(JSON.stringify(result.value));
applyPortfolioUpdate(db,update);assert.deepEqual(read(db),result);db.close();
// Fresh installation already has the new text and needs no extra revision.
const fresh=database(seed);applyPortfolioUpdate(fresh,update);assert.equal(read(fresh).revision,7);fresh.close();
// A failed migration marker must roll back the content update as well.
const failed=database(old);
failed.exec("CREATE TABLE content_migrations(name TEXT PRIMARY KEY,applied_at TEXT); CREATE TRIGGER reject_marker BEFORE INSERT ON content_migrations BEGIN SELECT RAISE(ABORT,'test failure'); END");
assert.throws(()=>applyPortfolioUpdate(failed,update),/test failure/);assert.deepEqual(read(failed),{revision:7,value:old});failed.close();
console.log('PASS portfolio update: migration, preserved CMS edits/media/visibility/leads, once-only restart and transaction rollback');
