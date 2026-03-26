import { getDatabase } from '../db/database.js';
import { nanoid } from 'nanoid';

export interface ScanConfig {
  maxPages: number;
  maxDepth: number;
  concurrency: number;
  delay: number;
  excludePatterns: string[];
  waitForSelector: string | null;
  respectRobotsTxt: boolean;
  viewport: { width: number; height: number };
  authentication: { loginUrl: string; username: string; password: string } | null;
}

export interface Scan {
  id: string;
  root_url: string;
  status: 'pending' | 'crawling' | 'scanning' | 'analyzing' | 'complete' | 'failed';
  config: ScanConfig;
  total_pages: number;
  scanned_pages: number;
  total_issues: number;
  critical_count: number;
  serious_count: number;
  moderate_count: number;
  minor_count: number;
  score: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export const ScanModel = {
  create(rootUrl: string, config: ScanConfig): Scan {
    const db = getDatabase();
    const id = `scan_${nanoid(12)}`;
    const stmt = db.prepare(`
      INSERT INTO scans (id, root_url, status, config)
      VALUES (?, ?, 'pending', ?)
    `);
    stmt.run(id, rootUrl, JSON.stringify(config));
    return this.findById(id)!;
  },

  findById(id: string): Scan | null {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM scans WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      ...row,
      config: JSON.parse(row.config as string),
    } as Scan;
  },

  findAll(limit = 50, offset = 0): Scan[] {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM scans ORDER BY created_at DESC LIMIT ? OFFSET ?');
    const rows = stmt.all(limit, offset) as Record<string, unknown>[];
    return rows.map(row => ({
      ...row,
      config: JSON.parse(row.config as string),
    })) as Scan[];
  },

  updateStatus(id: string, status: Scan['status']): void {
    const db = getDatabase();
    const updates: Record<string, unknown> = { status };
    if (status === 'crawling') {
      updates.started_at = new Date().toISOString();
    } else if (status === 'complete' || status === 'failed') {
      updates.completed_at = new Date().toISOString();
    }
    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const stmt = db.prepare(`UPDATE scans SET ${setClauses} WHERE id = ?`);
    stmt.run(...Object.values(updates), id);
  },

  updateCounts(id: string, counts: Partial<Pick<Scan, 'total_pages' | 'scanned_pages' | 'total_issues' | 'critical_count' | 'serious_count' | 'moderate_count' | 'minor_count' | 'score'>>): void {
    const db = getDatabase();
    const setClauses = Object.keys(counts).map(k => `${k} = ?`).join(', ');
    const stmt = db.prepare(`UPDATE scans SET ${setClauses} WHERE id = ?`);
    stmt.run(...Object.values(counts), id);
  },

  delete(id: string): void {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM scans WHERE id = ?');
    stmt.run(id);
  },
};
