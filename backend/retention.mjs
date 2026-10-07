import {rm} from 'node:fs/promises';
import path from 'node:path';

export const CLOSED_RETENTION_DAYS = 180;
const DAY = 86400000;

export function initializeRetention(db, now = new Date()) {
  const columns = new Set(db.prepare('PRAGMA table_info(leads)').all().map(row => row.name));
  if (!columns.has('closed_at')) db.exec("ALTER TABLE leads ADD COLUMN closed_at TEXT NOT NULL DEFAULT ''");
  // An old creation date is not evidence of closure. Existing closed leads get a
  // full grace period from migration; won means a contract, not an expired lead.
  db.prepare("UPDATE leads SET closed_at=? WHERE status='closed' AND closed_at=''").run(now.toISOString());
  db.exec(`CREATE INDEX IF NOT EXISTS leads_retention ON leads(status,closed_at);
    CREATE TRIGGER IF NOT EXISTS leads_closed_insert AFTER INSERT ON leads
    WHEN NEW.status='closed' AND NEW.closed_at=''
    BEGIN UPDATE leads SET closed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id; END;
    CREATE TRIGGER IF NOT EXISTS leads_closed_transition AFTER UPDATE OF status ON leads
    WHEN OLD.status<>NEW.status
    BEGIN UPDATE leads SET closed_at=CASE WHEN NEW.status='closed'
      THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE '' END WHERE id=NEW.id; END;`);
}

export function retentionCandidates(db, now = new Date()) {
  const protectPortal=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='lead_portals'").get()?` AND NOT EXISTS(SELECT 1 FROM lead_portals p WHERE p.lead_id=leads.id AND p.revoked=0 AND p.expires>${now.getTime()})`:'';
  return db.prepare(`SELECT id,revision,closed_at FROM leads
    WHERE status='closed' AND closed_at<>'' AND closed_at<?
      AND (next_contact='' OR next_contact<=?)${protectPortal}`).all(
    new Date(now.getTime() - CLOSED_RETENTION_DAYS * DAY).toISOString(), now.toISOString().slice(0,10));
}

export async function purgeClosedLeads(db, dataDir, verifiedSnapshot, now = new Date()) {
  if (!verifiedSnapshot?.verified || !Number.isFinite(Date.parse(verifiedSnapshot.createdAt)) || now.getTime()-Date.parse(verifiedSnapshot.createdAt)>DAY ||
      Date.parse(verifiedSnapshot.createdAt)>now.getTime()) throw Error('A fresh verified backup is required for retention');
  const backedUp = new Map(verifiedSnapshot.leads.map(row => [row.id, row]));
  const candidates = retentionCandidates(db, now).filter(row => {
    const saved=backedUp.get(row.id);
    return saved?.revision===row.revision && saved.closed_at===row.closed_at && saved.status==='closed';
  });
  const files=[],quoteFiles=[];
  const hasQuotes=Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='quote_versions'").get());
  // No awaits inside this transaction: reopening/updating cannot race deletion.
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const row of candidates) {
      files.push(...db.prepare('SELECT id FROM files WHERE lead_id=?').all(row.id).map(file=>file.id));
      if(hasQuotes)quoteFiles.push(...db.prepare('SELECT file_key FROM quote_versions WHERE lead_id=?').all(row.id).map(file=>file.file_key));
      db.prepare('DELETE FROM leads WHERE id=?').run(row.id);
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  let orphanedFiles=0;
  for (const id of files) {
    if (!/^[a-f0-9-]{36}$/.test(id)) { orphanedFiles++; continue; }
    try { await rm(path.join(dataDir,'uploads',id),{force:true}); } catch { orphanedFiles++; }
  }
  for(const key of quoteFiles){if(!/^quotes\/[a-f0-9-]{36}\.pdf$/.test(key)){orphanedFiles++;continue;}try{await rm(path.join(dataDir,key),{force:true});}catch{orphanedFiles++;}}
  return {removedLeads:candidates.length,removedFiles:files.length+quoteFiles.length-orphanedFiles,orphanedFiles};
}
