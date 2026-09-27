import {isDeepStrictEqual} from 'node:util';
import {mergePortfolioUpdate} from './portfolio-update.mjs';

// Seed descriptions may be expanded only while their underlying facts still
// match the reviewed source. Each field additionally keeps the generic
// before/after check, so later CMS edits are never overwritten.
export function mergeContentUpdate13(current, update) {
  const updates = update.updates.filter(patch => {
    const project = current.projects.find(p => p.id === patch.id);
    return project && Object.entries(patch.guards || {}).every(([key, value]) =>
      isDeepStrictEqual(project[key] ?? '', value));
  });
  const next = mergePortfolioUpdate(current, {...update, updates});
  const settings = next.settings;
  if (settings?.inn === '2543104214' && settings.kpp === '254301001' && !settings.ogrn) {
    settings.ogrn = '1162536089759';
  }
  return next;
}

export function applyContentUpdate13(db, update) {
  db.exec('CREATE TABLE IF NOT EXISTS content_migrations(name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  db.exec('BEGIN IMMEDIATE');
  try {
    if (!db.prepare('SELECT name FROM content_migrations WHERE name=?').get(update.id)) {
      const row = db.prepare('SELECT revision,json FROM content WHERE id=1').get();
      const current = JSON.parse(row.json), next = mergeContentUpdate13(current, update);
      if (!isDeepStrictEqual(current, next)) {
        db.prepare('UPDATE content SET revision=revision+1,json=? WHERE id=1').run(JSON.stringify(next));
      }
      db.prepare('INSERT INTO content_migrations VALUES(?,?)').run(update.id, new Date().toISOString());
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
