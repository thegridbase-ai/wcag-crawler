-- A11y Crawler Database Schema

CREATE TABLE IF NOT EXISTS scans (
  id TEXT PRIMARY KEY,
  root_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  config JSON NOT NULL,
  total_pages INTEGER DEFAULT 0,
  scanned_pages INTEGER DEFAULT 0,
  total_issues INTEGER DEFAULT 0,
  critical_count INTEGER DEFAULT 0,
  serious_count INTEGER DEFAULT 0,
  moderate_count INTEGER DEFAULT 0,
  minor_count INTEGER DEFAULT 0,
  score REAL,
  error_message TEXT,
  started_at DATETIME,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  issue_count INTEGER DEFAULT 0,
  page_specific_issue_count INTEGER DEFAULT 0,
  http_status INTEGER,
  load_time_ms INTEGER,
  scanned_at DATETIME,
  regions_fingerprint JSON,
  source_url TEXT
);

CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  axe_rule_id TEXT NOT NULL,
  description TEXT NOT NULL,
  help TEXT,
  help_url TEXT,
  impact TEXT NOT NULL,
  wcag_tags JSON,
  target_selector TEXT,
  html_snippet TEXT,
  dom_region TEXT,
  region_fingerprint TEXT,
  failure_summary TEXT,
  is_shared_component BOOLEAN DEFAULT FALSE,
  shared_component_group TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shared_components (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  region TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  label TEXT,
  page_count INTEGER DEFAULT 0,
  issue_count INTEGER DEFAULT 0,
  sample_html TEXT,
  page_urls JSON
);

CREATE INDEX IF NOT EXISTS idx_issues_scan ON issues(scan_id);
CREATE INDEX IF NOT EXISTS idx_issues_shared ON issues(scan_id, is_shared_component, shared_component_group);
CREATE INDEX IF NOT EXISTS idx_pages_scan ON pages(scan_id);
CREATE INDEX IF NOT EXISTS idx_shared_scan ON shared_components(scan_id);
