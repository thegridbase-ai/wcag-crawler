export type WcagVersion = '2.1' | '2.2';

export interface ScanConfig {
  maxPages: number;
  maxDepth: number;
  concurrency: number;
  delay: number;
  excludePatterns: string[];
  waitForSelector: string | null;
  respectRobotsTxt: boolean;
  viewport: { width: number; height: number };
  authentication: { authType: 'form' | 'basic'; loginUrl: string; username: string; password: string } | null;
  wcagVersion: WcagVersion;
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
  error_message?: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  pages?: PageSummary[];
}

export interface PageSummary {
  id: string;
  url: string;
  title: string | null;
  status: 'pending' | 'scanning' | 'complete' | 'error' | 'skipped';
  issueCount: number;
  skipReason?: string | null;
  httpStatus?: number | null;
}

export interface Issue {
  ruleId: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  description: string;
  target: string;
  htmlSnippet: string;
  helpUrl: string;
  wcagCriteria: string[];
  failureSummary?: string | null;
  affectedPages?: number;
  affectedPageUrls?: string[]; // List of page URLs where this issue appears
  allTargets?: string[]; // Multiple selectors when issues are grouped
}

export interface SharedComponent {
  id: string;
  label: string;
  region: string;
  pageCount: number;
  pageUrls: string[];
  issues: Issue[];
}

export interface PageIssue {
  url: string;
  title: string | null;
  sourceUrl?: string | null;
  issueCount: number;
  issues: Issue[];
}

export interface ReportSummary {
  score: number;
  totalPages: number;
  totalIssuesRaw: number;
  totalIssuesDeduplicated: number;
  bySeverity: {
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
  };
  ruleCountBySeverity: {
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
  };
  topRules: Array<{
    ruleId: string;
    count: number;
    impact: string;
  }>;
}

export interface SkippedPage {
  url: string;
  reason: string;
  reasonLabel: string;
  httpStatus: number | null;
}

export interface FullReport {
  scan: Scan;
  summary: ReportSummary;
  sharedComponents: SharedComponent[];
  pageSpecificIssues: PageIssue[];
  skippedPages?: SkippedPage[];
}

// Socket events
export interface CrawlPageFoundEvent {
  scanId: string;
  url: string;
  title: string;
  depth: number;
  totalFound: number;
}

export interface ScanProgressEvent {
  scanId: string;
  scannedPages: number;
  totalPages: number;
  percentage: number;
}

export interface ScanPageCompleteEvent {
  scanId: string;
  url: string;
  issueCount: number;
}

export interface ScanCompleteEvent {
  scanId: string;
  summary: {
    totalPages: number;
    totalIssues: number;
    score: number;
  };
}
