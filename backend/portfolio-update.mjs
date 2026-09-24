import {isDeepStrictEqual} from 'node:util';

// Apply approved editorial changes without replacing later CMS edits.
export function mergePortfolioUpdate(current, update) {
  const next = structuredClone(current);
  for (const patch of update.updates) {
    const project = next.projects.find(p => p.id === patch.id);
    if (!project) continue;
    for (const field of patch.fields) {
      let target = project;
      for (const key of field.path.slice(0, -1)) target = target[key] ??= {};
      const key = field.path.at(-1);
      if (isDeepStrictEqual(target[key] ?? '', field.before)) target[key] = structuredClone(field.after);
    }
  }
  for (const project of update.additions) {
    if (!next.projects.some(p => p.id === project.id)) next.projects.push(structuredClone(project));
  }
  return next;
}

export function applyPortfolioUpdate(db, update) {
  db.exec('CREATE TABLE IF NOT EXISTS content_migrations(name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  db.exec('BEGIN IMMEDIATE');
  try {
    if (!db.prepare('SELECT name FROM content_migrations WHERE name=?').get(update.id)) {
      const row = db.prepare('SELECT revision,json FROM content WHERE id=1').get();
      const current = JSON.parse(row.json), next = mergePortfolioUpdate(current, update);
      if (!isDeepStrictEqual(current, next)) {
        db.prepare('UPDATE content SET revision=revision+1,json=? WHERE id=1').run(JSON.stringify(next));
      }
      db.prepare('INSERT INTO content_migrations VALUES(?,?)').run(update.id, new Date().toISOString());
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
