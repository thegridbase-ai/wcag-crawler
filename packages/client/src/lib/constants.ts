export const SEVERITY_COLORS = {
  critical: {
    bg: 'bg-critical/10',
    text: 'text-critical',
    border: 'border-critical/20',
    hex: '#dc2626',
  },
  serious: {
    bg: 'bg-serious/10',
    text: 'text-serious',
    border: 'border-serious/20',
    hex: '#ea580c',
  },
  moderate: {
    bg: 'bg-moderate/10',
    text: 'text-moderate',
    border: 'border-moderate/20',
    hex: '#ca8a04',
  },
  minor: {
    bg: 'bg-minor/10',
    text: 'text-minor',
    border: 'border-minor/20',
    hex: '#2563eb',
  },
} as const;

export const REGION_ICONS = {
  header: '🔝',
  nav: '🧭',
  footer: '🔻',
  aside: '📎',
  main: '📄',
  unknown: '❓',
} as const;

export const STATUS_LABELS = {
  pending: 'Pending',
  crawling: 'Crawling',
  scanning: 'Scanning',
  analyzing: 'Analyzing',
  complete: 'Complete',
  failed: 'Failed',
} as const;

export const VIEWPORT_PRESETS = [
  { label: 'Desktop', width: 1280, height: 720 },
  { label: 'Tablet', width: 768, height: 1024 },
  { label: 'Mobile', width: 375, height: 667 },
] as const;

export const WCAG_VERSIONS = [
  {
    value: '2.1' as const,
    label: 'WCAG 2.1',
    description: 'Stable industry baseline (AA). Covers all 2.0 + 2.1 success criteria.',
  },
  {
    value: '2.2' as const,
    label: 'WCAG 2.2',
    description: 'Latest standard (AA). Adds 9 new criteria: target size, focus visibility, dragging, accessible auth, consistent help, redundant entry.',
  },
] as const;

export const DEFAULT_SCAN_CONFIG = {
  maxPages: 50,
  maxDepth: 3,
  concurrency: 3,
  delay: 500,
  excludePatterns: [],
  waitForSelector: null,
  respectRobotsTxt: true,
  viewport: { width: 1280, height: 720 },
  authentication: null,
  wcagVersion: '2.1' as const,
};
