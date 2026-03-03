import { Router, Request, Response } from 'express';
import { chromium } from 'playwright';
import { ScanModel } from '../models/scan.model.js';
import { reportService } from '../services/report.service.js';
import { logger } from '../utils/logger.js';

export function createReportRoutes(): Router {
  const router = Router();

  // GET /api/reports/:scanId - Get full report
  router.get('/:scanId', (req: Request, res: Response) => {
    try {
      const scan = ScanModel.findById(req.params.scanId);
      if (!scan) {
        res.status(404).json({ error: 'Scan not found' });
        return;
      }

      if (scan.status !== 'complete') {
        res.status(400).json({ error: 'Scan not complete', status: scan.status });
        return;
      }

      const report = reportService.generateReport(scan.id);
      if (!report) {
        res.status(500).json({ error: 'Failed to generate report' });
        return;
      }

      res.json(report);
    } catch (error) {
      logger.error('Failed to get report', { error: (error as Error).message });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/reports/:scanId/export - Export as HTML or PDF
  router.get('/:scanId/export', async (req: Request, res: Response) => {
    try {
      const scan = ScanModel.findById(req.params.scanId);
      if (!scan) {
        res.status(404).json({ error: 'Scan not found' });
        return;
      }

      if (scan.status !== 'complete') {
        res.status(400).json({ error: 'Scan not complete', status: scan.status });
        return;
      }

      const report = reportService.generateReport(scan.id);
      if (!report) {
        res.status(500).json({ error: 'Failed to generate report' });
        return;
      }

      const html = generateExportHtml(report);
      const format = req.query.format || 'html';

      if (format === 'pdf') {
        const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        try {
          const page = await browser.newPage();
          await page.setContent(html, { waitUntil: 'networkidle' });
          const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' },
          });
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="a11y-report-${scan.id}.pdf"`);
          res.send(pdf);
        } finally {
          await browser.close();
        }
      } else {
        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Content-Disposition', `attachment; filename="a11y-report-${scan.id}.html"`);
        res.send(html);
      }
    } catch (error) {
      logger.error('Failed to export report', { error: (error as Error).message });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

function generateExportHtml(report: ReturnType<typeof reportService.generateReport>): string {
  if (!report) return '';

  const { scan, summary, sharedComponents, pageSpecificIssues } = report;

  const reportDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const conformanceStatus = summary.score >= 90 ? 'Meets' : summary.score >= 50 ? 'Partially Meets' : 'Does Not Meet';
  const healthLabel = summary.score >= 90 ? 'Healthy' : summary.score >= 80 ? 'Good' : summary.score >= 50 ? 'Needs Improvement' : 'Poor';
  const healthClass = summary.score >= 90 ? 'healthy' : summary.score >= 80 ? 'good' : summary.score >= 50 ? 'moderate' : 'poor';

  const totalUniqueIssues = (summary.ruleCountBySeverity?.critical || 0) +
    (summary.ruleCountBySeverity?.serious || 0) +
    (summary.ruleCountBySeverity?.moderate || 0) +
    (summary.ruleCountBySeverity?.minor || 0);

  const hostname = new URL(scan.root_url).hostname;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WCAG 2.1 AA Accessibility Audit Report — ${hostname}</title>
  <style>
    @page {
      size: A4;
      margin: 2cm 2.2cm 2.5cm 2.2cm;
      @bottom-center { content: counter(page) " / " counter(pages); font-size: 9px; color: #94a3b8; }
    }
    :root {
      --navy: #0f172a;
      --slate: #334155;
      --slate-light: #64748b;
      --border: #e2e8f0;
      --border-strong: #cbd5e1;
      --surface: #ffffff;
      --bg: #f8fafc;
      --bg-alt: #f1f5f9;
      --primary: #1e40af;
      --primary-light: #3b82f6;
      --critical: #b91c1c;
      --critical-bg: #fef2f2;
      --serious: #c2410c;
      --serious-bg: #fff7ed;
      --moderate-color: #a16207;
      --moderate-bg: #fefce8;
      --minor-color: #1d4ed8;
      --minor-bg: #eff6ff;
      --success: #15803d;
      --success-bg: #f0fdf4;
      --warning-color: #a16207;
      --warning-bg: #fefce8;
      --danger: #b91c1c;
      --danger-bg: #fef2f2;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      color: var(--slate);
      background: #fff;
      line-height: 1.7;
      font-size: 14px;
    }

    /* ── Cover Page ── */
    .cover-page {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 4rem 3.5rem;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      color: #fff;
      page-break-after: always;
    }
    .cover-badge {
      display: inline-block;
      padding: 0.4rem 1rem;
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 4px;
      font-size: 0.75rem;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.7);
      margin-bottom: 2rem;
    }
    .cover-title {
      font-size: 2.4rem;
      font-weight: 700;
      line-height: 1.2;
      margin-bottom: 0.75rem;
      letter-spacing: -0.02em;
    }
    .cover-subtitle {
      font-size: 1.15rem;
      color: rgba(255,255,255,0.6);
      margin-bottom: 3rem;
      font-weight: 400;
    }
    .cover-divider {
      width: 60px;
      height: 3px;
      background: var(--primary-light);
      margin-bottom: 2.5rem;
    }
    .cover-meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
    }
    .cover-meta-item label {
      display: block;
      font-size: 0.65rem;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.4);
      margin-bottom: 0.25rem;
    }
    .cover-meta-item span {
      font-size: 0.95rem;
      color: rgba(255,255,255,0.9);
    }
    .cover-footer {
      margin-top: auto;
      padding-top: 3rem;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .cover-footer-left {
      font-size: 0.8rem;
      color: rgba(255,255,255,0.4);
    }
    .cover-confidential {
      font-size: 0.65rem;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      padding: 0.3rem 0.8rem;
      border: 1px solid rgba(255,255,255,0.15);
      color: rgba(255,255,255,0.4);
    }

    /* ── Page Container ── */
    .page { padding: 2rem 2.5rem; }
    .page-break { page-break-before: always; }

    /* ── Typography ── */
    h1 { font-size: 1.65rem; font-weight: 700; color: var(--navy); letter-spacing: -0.02em; }
    h2 { font-size: 1.2rem; font-weight: 700; color: var(--navy); margin-bottom: 1rem; letter-spacing: -0.01em; }
    h3 { font-size: 1rem; font-weight: 600; color: var(--navy); margin-bottom: 0.5rem; }
    .section-number { color: var(--primary); margin-right: 0.5rem; }
    .section-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding-bottom: 0.75rem;
      border-bottom: 2px solid var(--navy);
      margin-bottom: 1.25rem;
      margin-top: 2rem;
    }
    .section-header h2 { margin-bottom: 0; }

    /* ── Table of Contents ── */
    .toc { margin: 2rem 0; }
    .toc-item {
      display: flex;
      justify-content: space-between;
      padding: 0.6rem 0;
      border-bottom: 1px solid var(--border);
      font-size: 0.9rem;
      color: var(--slate);
      text-decoration: none;
    }
    .toc-item:hover { color: var(--primary); }
    .toc-section-num { color: var(--primary); font-weight: 600; margin-right: 0.75rem; min-width: 1.5rem; }

    /* ── Executive Summary ── */
    .exec-grid {
      display: grid;
      grid-template-columns: 200px 1fr;
      gap: 2rem;
      margin: 1.5rem 0;
    }
    .score-ring {
      width: 160px;
      height: 160px;
      border-radius: 50%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      margin: 0 auto;
    }
    .score-ring.healthy { background: var(--success-bg); border: 4px solid var(--success); }
    .score-ring.good { background: var(--success-bg); border: 4px solid var(--success); }
    .score-ring.moderate { background: var(--warning-bg); border: 4px solid var(--warning-color); }
    .score-ring.poor { background: var(--danger-bg); border: 4px solid var(--danger); }
    .score-number { font-size: 3rem; font-weight: 800; line-height: 1; }
    .score-ring.healthy .score-number { color: var(--success); }
    .score-ring.good .score-number { color: var(--success); }
    .score-ring.moderate .score-number { color: var(--warning-color); }
    .score-ring.poor .score-number { color: var(--danger); }
    .score-out-of { font-size: 0.7rem; color: var(--slate-light); text-transform: uppercase; letter-spacing: 0.1em; margin-top: 2px; }
    .health-badge {
      display: inline-block;
      padding: 0.3rem 1rem;
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      margin-top: 0.75rem;
    }
    .health-badge.healthy { background: var(--success-bg); color: var(--success); border: 1px solid #bbf7d0; }
    .health-badge.good { background: var(--success-bg); color: var(--success); border: 1px solid #bbf7d0; }
    .health-badge.moderate { background: var(--warning-bg); color: var(--warning-color); border: 1px solid #fef08a; }
    .health-badge.poor { background: var(--danger-bg); color: var(--danger); border: 1px solid #fecaca; }

    .conformance-statement {
      background: var(--bg-alt);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.25rem;
      margin-bottom: 1.25rem;
    }
    .conformance-statement strong { color: var(--navy); }

    /* ── Metrics Grid ── */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1rem;
      margin: 1.5rem 0;
    }
    .metric-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.25rem;
      text-align: center;
    }
    .metric-card .value {
      font-size: 2rem;
      font-weight: 800;
      color: var(--navy);
      line-height: 1;
    }
    .metric-card .label {
      font-size: 0.7rem;
      color: var(--slate-light);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-top: 0.5rem;
    }
    .metric-card.critical .value { color: var(--critical); }
    .metric-card.serious .value { color: var(--serious); }
    .metric-card.moderate .value { color: var(--moderate-color); }
    .metric-card.minor .value { color: var(--minor-color); }

    /* ── Severity Bar ── */
    .severity-bar-wrap { margin: 1.5rem 0; }
    .severity-bar {
      display: flex;
      height: 12px;
      border-radius: 6px;
      overflow: hidden;
      background: var(--bg-alt);
    }
    .severity-bar span { height: 100%; }
    .severity-legend {
      display: flex;
      gap: 1.5rem;
      margin-top: 0.75rem;
      font-size: 0.8rem;
    }
    .severity-legend-item {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .severity-dot {
      width: 10px;
      height: 10px;
      border-radius: 2px;
    }

    /* ── Tables ── */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
      margin: 1rem 0;
    }
    th {
      background: var(--navy);
      color: #fff;
      padding: 0.6rem 1rem;
      text-align: left;
      font-weight: 600;
      font-size: 0.7rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    td {
      padding: 0.6rem 1rem;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }
    tr:nth-child(even) td { background: var(--bg); }

    /* ── Issue Cards ── */
    .issue-card {
      border: 1px solid var(--border);
      border-radius: 8px;
      margin-bottom: 1rem;
      overflow: hidden;
    }
    .issue-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1rem;
      background: var(--bg);
      border-bottom: 1px solid var(--border);
    }
    .issue-card-body { padding: 1rem; }
    .issue-rule { font-weight: 700; color: var(--navy); font-size: 0.9rem; }
    .issue-wcag { font-size: 0.75rem; color: var(--slate-light); }
    .badge {
      display: inline-block;
      padding: 0.2rem 0.6rem;
      border-radius: 4px;
      font-size: 0.65rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .badge-critical { background: var(--critical-bg); color: var(--critical); border: 1px solid #fecaca; }
    .badge-serious { background: var(--serious-bg); color: var(--serious); border: 1px solid #fed7aa; }
    .badge-moderate { background: var(--moderate-bg); color: var(--moderate-color); border: 1px solid #fef08a; }
    .badge-minor { background: var(--minor-bg); color: var(--minor-color); border: 1px solid #bfdbfe; }
    .issue-desc { color: var(--slate); font-size: 0.85rem; margin: 0.5rem 0; }
    .issue-meta { font-size: 0.75rem; color: var(--slate-light); }
    .code-block {
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 0.75rem;
      background: #1e293b;
      color: #e2e8f0;
      padding: 0.75rem 1rem;
      border-radius: 6px;
      overflow-x: auto;
      margin-top: 0.75rem;
      line-height: 1.5;
    }

    /* ── Component Card ── */
    .component-card {
      border: 1px solid var(--border);
      border-radius: 8px;
      margin-bottom: 1.25rem;
      overflow: hidden;
    }
    .component-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1rem;
      background: var(--bg-alt);
      border-bottom: 1px solid var(--border);
      font-weight: 600;
      color: var(--navy);
    }
    .component-header .page-count {
      font-size: 0.75rem;
      color: var(--slate-light);
      font-weight: 400;
      background: var(--surface);
      padding: 0.2rem 0.6rem;
      border-radius: 4px;
      border: 1px solid var(--border);
    }
    .component-issues { padding: 1rem; }

    /* ── Page Section ── */
    .page-section {
      border: 1px solid var(--border);
      border-radius: 8px;
      margin-bottom: 1rem;
      overflow: hidden;
    }
    .page-section-header {
      padding: 0.6rem 1rem;
      background: var(--bg);
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .page-section-url {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--navy);
      word-break: break-all;
    }
    .page-section-count {
      font-size: 0.7rem;
      color: var(--slate-light);
      background: var(--surface);
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      border: 1px solid var(--border);
      white-space: nowrap;
    }
    .page-section-body { padding: 0.75rem 1rem; }
    .page-issue {
      padding: 0.5rem 0;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
    }
    .page-issue:last-child { border-bottom: none; }

    /* ── Footer ── */
    .report-footer {
      margin-top: 3rem;
      padding-top: 1.5rem;
      border-top: 2px solid var(--navy);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.75rem;
      color: var(--slate-light);
    }

    /* ── Utilities ── */
    .text-muted { color: var(--slate-light); }
    .text-sm { font-size: 0.85rem; }
    .text-xs { font-size: 0.75rem; }
    .mt-1 { margin-top: 0.5rem; }
    .mt-2 { margin-top: 1rem; }
    .mb-1 { margin-bottom: 0.5rem; }
    .mb-2 { margin-bottom: 1rem; }

    /* ── Print ── */
    @media print {
      body { font-size: 11px; }
      .cover-page { min-height: auto; padding: 3rem; }
      .page { padding: 0; }
      .issue-card, .component-card, .page-section { break-inside: avoid; }
    }
  </style>
</head>
<body>

  <!-- ═══════ COVER PAGE ═══════ -->
  <div class="cover-page">
    <div class="cover-badge">Confidential</div>
    <h1 class="cover-title">Website Accessibility<br>Conformance Evaluation Report</h1>
    <p class="cover-subtitle">WCAG 2.1 Level AA Automated Assessment</p>
    <div class="cover-divider"></div>
    <div class="cover-meta">
      <div class="cover-meta-item">
        <label>Target Website</label>
        <span>${scan.root_url}</span>
      </div>
      <div class="cover-meta-item">
        <label>Report Date</label>
        <span>${reportDate}</span>
      </div>
      <div class="cover-meta-item">
        <label>Standard</label>
        <span>WCAG 2.1 Level AA</span>
      </div>
      <div class="cover-meta-item">
        <label>Pages Evaluated</label>
        <span>${summary.totalPages} pages</span>
      </div>
      <div class="cover-meta-item">
        <label>Testing Method</label>
        <span>Automated (axe-core)</span>
      </div>
      <div class="cover-meta-item">
        <label>Conformance Status</label>
        <span>${conformanceStatus} WCAG 2.1 AA</span>
      </div>
    </div>
    <div class="cover-footer">
      <div class="cover-footer-left">Generated by WCAG Crawler — Automated Accessibility Scanner</div>
      <div class="cover-confidential">For authorized use only</div>
    </div>
  </div>

  <!-- ═══════ TABLE OF CONTENTS ═══════ -->
  <div class="page">
    <h1 style="margin-bottom: 0.5rem;">Table of Contents</h1>
    <p class="text-muted text-sm mb-2">Report structure and navigation</p>
    <div class="toc">
      <a class="toc-item" href="#executive-summary"><span><span class="toc-section-num">1</span>Executive Summary</span></a>
      <a class="toc-item" href="#scope"><span><span class="toc-section-num">2</span>Scope &amp; Methodology</span></a>
      <a class="toc-item" href="#score"><span><span class="toc-section-num">3</span>Score Overview</span></a>
      <a class="toc-item" href="#severity"><span><span class="toc-section-num">4</span>Issue Distribution by Severity</span></a>
      <a class="toc-item" href="#shared"><span><span class="toc-section-num">5</span>Shared Component Issues (${sharedComponents.length})</span></a>
      <a class="toc-item" href="#pages"><span><span class="toc-section-num">6</span>Page-Specific Findings (${pageSpecificIssues.length} pages)</span></a>
      <a class="toc-item" href="#recommendations"><span><span class="toc-section-num">7</span>Recommendations</span></a>
      <a class="toc-item" href="#references"><span><span class="toc-section-num">8</span>References</span></a>
    </div>
  </div>

  <!-- ═══════ EXECUTIVE SUMMARY ═══════ -->
  <div class="page page-break" id="executive-summary">
    <div class="section-header">
      <h2><span class="section-number">1.</span> Executive Summary</h2>
    </div>

    <div class="conformance-statement">
      <strong>Conformance Statement:</strong> The website <strong>${hostname}</strong> <strong>${conformanceStatus.toLowerCase()}</strong> WCAG 2.1 Level AA conformance requirements based on automated evaluation of ${summary.totalPages} page${summary.totalPages === 1 ? '' : 's'}.
      ${summary.score >= 90
        ? ' The site demonstrates strong accessibility practices with minor issues remaining.'
        : summary.score >= 80
          ? ' The site shows good accessibility but has areas requiring attention.'
          : summary.score >= 50
            ? ' Significant accessibility barriers were identified that require remediation.'
            : ' Critical accessibility barriers exist that prevent equal access for users with disabilities.'}
    </div>

    <div class="exec-grid">
      <div style="text-align: center;">
        <div class="score-ring ${healthClass}">
          <div class="score-number">${summary.score}</div>
          <div class="score-out-of">out of 100</div>
        </div>
        <div class="health-badge ${healthClass}">${healthLabel}</div>
      </div>
      <div>
        <h3 style="margin-bottom: 0.75rem;">Key Findings</h3>
        <table>
          <tr><td style="width: 60%;"><strong>Total Pages Scanned</strong></td><td>${summary.totalPages}</td></tr>
          <tr><td><strong>Unique Issues Found</strong></td><td>${totalUniqueIssues}</td></tr>
          <tr><td><strong>Total Issue Occurrences</strong></td><td>${summary.totalIssuesRaw}</td></tr>
          <tr><td><strong>Shared Component Issues</strong></td><td>${sharedComponents.length} components</td></tr>
          <tr><td><strong>Critical Issues</strong></td><td style="color: var(--critical); font-weight: 700;">${summary.bySeverity.critical}</td></tr>
          <tr><td><strong>Serious Issues</strong></td><td style="color: var(--serious); font-weight: 700;">${summary.bySeverity.serious}</td></tr>
        </table>
      </div>
    </div>
  </div>

  <!-- ═══════ SCOPE & METHODOLOGY ═══════ -->
  <div class="page page-break" id="scope">
    <div class="section-header">
      <h2><span class="section-number">2.</span> Scope &amp; Methodology</h2>
    </div>

    <h3>2.1 Evaluation Scope</h3>
    <table>
      <tr><td style="width: 35%;"><strong>Website URL</strong></td><td>${scan.root_url}</td></tr>
      <tr><td><strong>Pages Evaluated</strong></td><td>${summary.totalPages} pages (auto-discovered via crawling)</td></tr>
      <tr><td><strong>Crawl Depth</strong></td><td>Up to ${scan.config?.maxDepth || 3} levels</td></tr>
      <tr><td><strong>Target Standard</strong></td><td>WCAG 2.1 Level AA</td></tr>
      <tr><td><strong>Evaluation Date</strong></td><td>${reportDate}</td></tr>
    </table>

    <h3 class="mt-2">2.2 Testing Methodology</h3>
    <p class="text-sm" style="margin-bottom: 0.75rem;">
      This assessment was conducted using automated testing tools. Automated testing can identify approximately 30–40% of WCAG conformance issues.
      A comprehensive evaluation should also include manual testing with assistive technologies.
    </p>
    <table>
      <tr><td style="width: 35%;"><strong>Testing Engine</strong></td><td>axe-core (Deque Systems)</td></tr>
      <tr><td><strong>Browser</strong></td><td>Chromium (Playwright)</td></tr>
      <tr><td><strong>Viewport</strong></td><td>${scan.config?.viewport?.width || 1280} × ${scan.config?.viewport?.height || 720}px</td></tr>
      <tr><td><strong>Deduplication</strong></td><td>Region fingerprinting with shared component detection</td></tr>
    </table>

    <div class="conformance-statement mt-2">
      <strong>Limitation Notice:</strong> This report reflects automated testing results only. Manual evaluation with screen readers (NVDA, JAWS, VoiceOver), keyboard-only navigation, and cognitive accessibility review is recommended for full WCAG 2.1 AA conformance verification.
    </div>
  </div>

  <!-- ═══════ SCORE OVERVIEW ═══════ -->
  <div class="page page-break" id="score">
    <div class="section-header">
      <h2><span class="section-number">3.</span> Score Overview</h2>
    </div>

    <div class="metrics-grid">
      <div class="metric-card">
        <div class="value">${summary.score}</div>
        <div class="label">Accessibility Score</div>
      </div>
      <div class="metric-card">
        <div class="value">${summary.totalPages}</div>
        <div class="label">Pages Scanned</div>
      </div>
      <div class="metric-card">
        <div class="value">${totalUniqueIssues}</div>
        <div class="label">Unique Issues</div>
      </div>
      <div class="metric-card">
        <div class="value">${summary.totalIssuesRaw}</div>
        <div class="label">Total Occurrences</div>
      </div>
    </div>

    <div class="metrics-grid">
      <div class="metric-card critical">
        <div class="value">${summary.bySeverity.critical}</div>
        <div class="label">Critical</div>
      </div>
      <div class="metric-card serious">
        <div class="value">${summary.bySeverity.serious}</div>
        <div class="label">Serious</div>
      </div>
      <div class="metric-card moderate">
        <div class="value">${summary.bySeverity.moderate}</div>
        <div class="label">Moderate</div>
      </div>
      <div class="metric-card minor">
        <div class="value">${summary.bySeverity.minor}</div>
        <div class="label">Minor</div>
      </div>
    </div>
  </div>

  <!-- ═══════ SEVERITY DISTRIBUTION ═══════ -->
  <div class="page page-break" id="severity">
    <div class="section-header">
      <h2><span class="section-number">4.</span> Issue Distribution by Severity</h2>
    </div>

    <div class="severity-bar-wrap">
      <div class="severity-bar">
        ${summary.totalIssuesRaw > 0 ? `
          <span style="width: ${(summary.bySeverity.critical / summary.totalIssuesRaw) * 100}%; background: var(--critical);"></span>
          <span style="width: ${(summary.bySeverity.serious / summary.totalIssuesRaw) * 100}%; background: var(--serious);"></span>
          <span style="width: ${(summary.bySeverity.moderate / summary.totalIssuesRaw) * 100}%; background: var(--moderate-color);"></span>
          <span style="width: ${(summary.bySeverity.minor / summary.totalIssuesRaw) * 100}%; background: var(--minor-color);"></span>
        ` : '<span style="width: 100%; background: var(--success);"></span>'}
      </div>
      <div class="severity-legend">
        <div class="severity-legend-item"><span class="severity-dot" style="background: var(--critical);"></span> Critical (${summary.bySeverity.critical})</div>
        <div class="severity-legend-item"><span class="severity-dot" style="background: var(--serious);"></span> Serious (${summary.bySeverity.serious})</div>
        <div class="severity-legend-item"><span class="severity-dot" style="background: var(--moderate-color);"></span> Moderate (${summary.bySeverity.moderate})</div>
        <div class="severity-legend-item"><span class="severity-dot" style="background: var(--minor-color);"></span> Minor (${summary.bySeverity.minor})</div>
      </div>
    </div>

    <h3 class="mt-2">Severity Level Definitions</h3>
    <table>
      <thead><tr><th>Level</th><th>Definition</th></tr></thead>
      <tbody>
        <tr><td><span class="badge badge-critical">Critical</span></td><td>Completely blocks access to fundamental content or functionality for users with disabilities.</td></tr>
        <tr><td><span class="badge badge-serious">Serious</span></td><td>Creates significant barriers that make it very difficult for users with disabilities to access content.</td></tr>
        <tr><td><span class="badge badge-moderate">Moderate</span></td><td>Creates some barriers but does not prevent access to fundamental features.</td></tr>
        <tr><td><span class="badge badge-minor">Minor</span></td><td>Creates minor inconvenience but does not significantly impact accessibility.</td></tr>
      </tbody>
    </table>
  </div>

  <!-- ═══════ SHARED COMPONENT ISSUES ═══════ -->
  <div class="page page-break" id="shared">
    <div class="section-header">
      <h2><span class="section-number">5.</span> Shared Component Issues</h2>
    </div>
    <p class="text-sm mb-2">These issues appear in shared components (headers, navigation, footers) and affect multiple pages. Fixing these provides the highest return on investment.</p>

    ${sharedComponents.length === 0 ? '<p class="text-muted">No shared component issues detected.</p>' : ''}

    ${sharedComponents.map(comp => `
      <div class="component-card">
        <div class="component-header">
          <span>${escapeHtml(comp.label)}</span>
          <span class="page-count">Found on ${comp.pageCount} pages</span>
        </div>
        <div class="component-issues">
          ${comp.issues.map(issue => `
            <div class="issue-card" style="margin-bottom: 0.75rem;">
              <div class="issue-card-header">
                <div>
                  <span class="issue-rule">${escapeHtml(issue.ruleId)}</span>
                  ${issue.wcagCriteria ? `<span class="issue-wcag" style="margin-left: 0.5rem;">${escapeHtml(issue.wcagCriteria.join(', '))}</span>` : ''}
                </div>
                <span class="badge badge-${issue.impact}">${issue.impact}</span>
              </div>
              <div class="issue-card-body">
                <p class="issue-desc">${escapeHtml(issue.description)}</p>
                <p class="issue-meta">Affects ${issue.affectedPages} page${issue.affectedPages === 1 ? '' : 's'}</p>
                ${issue.htmlSnippet ? `<div class="code-block">${escapeHtml(issue.htmlSnippet)}</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('')}
  </div>

  <!-- ═══════ PAGE-SPECIFIC FINDINGS ═══════ -->
  <div class="page page-break" id="pages">
    <div class="section-header">
      <h2><span class="section-number">6.</span> Page-Specific Findings</h2>
    </div>
    <p class="text-sm mb-2">Issues unique to individual pages, after deduplication of shared component issues. ${pageSpecificIssues.length > 30 ? `Showing first 30 of ${pageSpecificIssues.length} pages.` : ''}</p>

    ${pageSpecificIssues.length === 0 ? '<p class="text-muted">No page-specific issues detected.</p>' : ''}

    ${pageSpecificIssues.slice(0, 30).map(page => `
      <div class="page-section">
        <div class="page-section-header">
          <span class="page-section-url">${escapeHtml(page.url)}</span>
          <span class="page-section-count">${page.issueCount} issue${page.issueCount === 1 ? '' : 's'}</span>
        </div>
        <div class="page-section-body">
          ${page.issues.slice(0, 8).map(issue => `
            <div class="page-issue">
              <div style="flex: 1;">
                <strong style="font-size: 0.85rem; color: var(--navy);">${escapeHtml(issue.ruleId)}</strong>
                <p class="issue-desc">${escapeHtml(issue.description)}</p>
              </div>
              <span class="badge badge-${issue.impact}">${issue.impact}</span>
            </div>
          `).join('')}
          ${page.issues.length > 8 ? `<p class="text-muted text-xs mt-1">+ ${page.issues.length - 8} more issue${page.issues.length - 8 === 1 ? '' : 's'} on this page</p>` : ''}
        </div>
      </div>
    `).join('')}
  </div>

  <!-- ═══════ RECOMMENDATIONS ═══════ -->
  <div class="page page-break" id="recommendations">
    <div class="section-header">
      <h2><span class="section-number">7.</span> Recommendations</h2>
    </div>

    <h3>7.1 Immediate Priority (Critical & Serious)</h3>
    <p class="text-sm mb-1">Address these issues first as they directly prevent users with disabilities from accessing content.</p>
    <ul style="margin: 0.75rem 0 1.5rem 1.5rem; font-size: 0.85rem; line-height: 1.8;">
      ${summary.bySeverity.critical > 0 ? `<li>Resolve all <strong>${summary.bySeverity.critical} critical</strong> issues — these completely block access to content.</li>` : ''}
      ${summary.bySeverity.serious > 0 ? `<li>Remediate <strong>${summary.bySeverity.serious} serious</strong> issues — these create significant barriers for users with disabilities.</li>` : ''}
      ${sharedComponents.length > 0 ? `<li>Prioritize shared component fixes (${sharedComponents.length} components) — each fix resolves issues across multiple pages simultaneously.</li>` : ''}
    </ul>

    <h3>7.2 Secondary Priority (Moderate & Minor)</h3>
    <p class="text-sm mb-1">These issues should be addressed in subsequent development cycles.</p>
    <ul style="margin: 0.75rem 0 1.5rem 1.5rem; font-size: 0.85rem; line-height: 1.8;">
      ${summary.bySeverity.moderate > 0 ? `<li>Address <strong>${summary.bySeverity.moderate} moderate</strong> issues to improve overall user experience.</li>` : ''}
      ${summary.bySeverity.minor > 0 ? `<li>Resolve <strong>${summary.bySeverity.minor} minor</strong> issues as part of ongoing maintenance.</li>` : ''}
      ${summary.bySeverity.moderate === 0 && summary.bySeverity.minor === 0 ? '<li>No moderate or minor issues found.</li>' : ''}
    </ul>

    <h3>7.3 General Best Practices</h3>
    <ul style="margin: 0.75rem 0 1.5rem 1.5rem; font-size: 0.85rem; line-height: 1.8;">
      <li>Incorporate accessibility testing into CI/CD pipelines for early detection.</li>
      <li>Conduct manual testing with screen readers (NVDA, JAWS, VoiceOver) to complement automated findings.</li>
      <li>Perform keyboard-only navigation testing across all interactive elements.</li>
      <li>Establish an accessibility remediation timeline and assign ownership for each issue category.</li>
      <li>Schedule periodic re-scans to track progress and prevent regression.</li>
    </ul>
  </div>

  <!-- ═══════ REFERENCES ═══════ -->
  <div class="page page-break" id="references">
    <div class="section-header">
      <h2><span class="section-number">8.</span> References</h2>
    </div>
    <table>
      <thead><tr><th>Resource</th><th>URL</th></tr></thead>
      <tbody>
        <tr><td>WCAG 2.1 Specification</td><td>https://www.w3.org/TR/WCAG21/</td></tr>
        <tr><td>Understanding WCAG 2.1</td><td>https://www.w3.org/WAI/WCAG21/Understanding/</td></tr>
        <tr><td>WCAG Techniques</td><td>https://www.w3.org/WAI/WCAG21/Techniques/</td></tr>
        <tr><td>Section 508 Standards</td><td>https://www.section508.gov/</td></tr>
        <tr><td>EN 301 549 (EU Standard)</td><td>https://www.etsi.org/deliver/etsi_en/301500_301599/301549/</td></tr>
        <tr><td>axe-core Rule Descriptions</td><td>https://dequeuniversity.com/rules/axe/</td></tr>
        <tr><td>WCAG-EM Report Methodology</td><td>https://www.w3.org/TR/WCAG-EM/</td></tr>
      </tbody>
    </table>
  </div>

  <!-- ═══════ FOOTER ═══════ -->
  <div class="page">
    <div class="report-footer">
      <span>WCAG Crawler — Automated Accessibility Assessment Report</span>
      <span>Generated: ${reportDate}</span>
      <span>Confidential</span>
    </div>
  </div>

</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
