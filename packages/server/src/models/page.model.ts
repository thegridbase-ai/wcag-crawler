import { getDatabase } from '../db/database.js';
import { nanoid } from 'nanoid';

export interface Page {
  id: string;
  scan_id: string;
  url: string;
  title: string | null;
  status: 'pending' | 'scanning' | 'complete' | 'error';
  issue_count: number;
  page_specific_issue_count: number;
  http_status: number | null;
  load_time_ms: number | null;
  scanned_at: string | null;
  regions_fingerprint: Record<string, string> | null;
  source_url: string | null;
}

export const PageModel = {
  create(scanId: string, url: string, sourceUrl?: string): Page {
    const db = getDatabase();
    const id = `page_${nanoid(12)}`;
    const stmt = db.prepare(`
      INSERT INTO pages (id, scan_id, url, status, source_url)
      VALUES (?, ?, ?, 'pending', ?)
    `);
    stmt.run(id, scanId, url, sourceUrl || null);
    return this.findById(id)!;
  },

  findById(id: string): Page | null {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM pages WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      ...row,
      regions_fingerprint: row.regions_fingerprint ? JSON.parse(row.regions_fingerprint as string) : null,
    } as Page;
  },

  findByScanId(scanId: string): Page[] {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM pages WHERE scan_id = ? ORDER BY url');
    const rows = stmt.all(scanId) as Record<string, unknown>[];
    return rows.map(row => ({
      ...row,
      regions_fingerprint: row.regions_fingerprint ? JSON.parse(row.regions_fingerprint as string) : null,
    })) as Page[];
  },

  findByUrl(scanId: string, url: string): Page | null {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM pages WHERE scan_id = ? AND url = ?');
    const row = stmt.get(scanId, url) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      ...row,
      regions_fingerprint: row.regions_fingerprint ? JSON.parse(row.regions_fingerprint as string) : null,
    } as Page;
  },

  updateStatus(id: string, status: Page['status'], meta?: { title?: string; http_status?: number; load_time_ms?: number }): void {
    const db = getDatabase();
    const updates: Record<string, unknown> = { status };
    if (status === 'complete' || status === 'error') {
      updates.scanned_at = new Date().toISOString();
    }
    if (meta?.title) updates.title = meta.title;
    if (meta?.http_status) updates.http_status = meta.http_status;
    if (meta?.load_time_ms) updates.load_time_ms = meta.load_time_ms;

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const stmt = db.prepare(`UPDATE pages SET ${setClauses} WHERE id = ?`);
    stmt.run(...Object.values(updates), id);
  },

  updateIssueCounts(id: string, issueCount: number, pageSpecificCount: number): void {
    const db = getDatabase();
    const stmt = db.prepare('UPDATE pages SET issue_count = ?, page_specific_issue_count = ? WHERE id = ?');
    stmt.run(issueCount, pageSpecificCount, id);
  },

  updateRegionsFingerprint(id: string, fingerprints: Record<string, string>): void {
    const db = getDatabase();
    const stmt = db.prepare('UPDATE pages SET regions_fingerprint = ? WHERE id = ?');
    stmt.run(JSON.stringify(fingerprints), id);
  },

  countByScanId(scanId: string): number {
    const db = getDatabase();
    const stmt = db.prepare('SELECT COUNT(*) as count FROM pages WHERE scan_id = ?');
    const row = stmt.get(scanId) as { count: number };
    return row.count;
  },

  countScannedByScanId(scanId: string): number {
    const db = getDatabase();
    const stmt = db.prepare("SELECT COUNT(*) as count FROM pages WHERE scan_id = ? AND status IN ('complete', 'error')");
    const row = stmt.get(scanId) as { count: number };
    return row.count;
  },
};
