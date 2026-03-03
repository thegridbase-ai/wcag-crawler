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
  const healthLabel = summary.score >= 90 ? 'Healthy' : summary.score >= 80 ? 'Good' : summary.score >= 50 ? 'Needs Improvement' : 'Poor';
  const healthClass = summary.score >= 90 ? 'healthy' : summary.score >= 80 ? 'good' : summary.score >= 50 ? 'moderate' : 'poor';

  const totalUniqueIssues = (summary.ruleCountBySeverity?.critical || 0) +
    (summary.ruleCountBySeverity?.serious || 0) +
    (summary.ruleCountBySeverity?.moderate || 0) +
    (summary.ruleCountBySeverity?.minor || 0);

  const hostname = new URL(scan.root_url).hostname;

  // Build strengths list
  const strengths: string[] = [];
  if (summary.score >= 50) strengths.push(`Overall accessibility score of <strong>${summary.score}/100</strong> — the site has a solid foundation.`);
  if (summary.bySeverity.critical === 0) strengths.push('No critical accessibility barriers were found.');
  if (summary.bySeverity.serious === 0) strengths.push('No serious accessibility issues detected.');
  if (summary.bySeverity.critical === 0 && summary.bySeverity.serious === 0) strengths.push('All pages are free of high-severity blockers — great work!');
  const pagesWithNoIssues = summary.totalPages - pageSpecificIssues.length;
  if (pagesWithNoIssues > 0) strengths.push(`<strong>${pagesWithNoIssues}</strong> of ${summary.totalPages} pages have no page-specific issues.`);
  if (summary.totalPages >= 10) strengths.push(`Comprehensive coverage: <strong>${summary.totalPages} pages</strong> were evaluated.`);
  if (strengths.length === 0) strengths.push(`${summary.totalPages} pages were scanned for accessibility issues.`);

  // Build improvements list (top 5 most impactful)
  const improvements: string[] = [];
  if (summary.bySeverity.critical > 0) improvements.push(`Resolve <strong>${summary.bySeverity.critical}</strong> critical issue${summary.bySeverity.critical > 1 ? 's' : ''} that block access to content.`);
  if (summary.bySeverity.serious > 0) improvements.push(`Address <strong>${summary.bySeverity.serious}</strong> serious issue${summary.bySeverity.serious > 1 ? 's' : ''} to remove significant barriers.`);
  if (sharedComponents.length > 0) improvements.push(`Fix shared component issues (${sharedComponents.length}) — each fix improves multiple pages at once.`);
  if (summary.bySeverity.moderate > 0) improvements.push(`Review <strong>${summary.bySeverity.moderate}</strong> moderate issue${summary.bySeverity.moderate > 1 ? 's' : ''} for a better user experience.`);
  if (summary.bySeverity.minor > 0) improvements.push(`Polish <strong>${summary.bySeverity.minor}</strong> minor issue${summary.bySeverity.minor > 1 ? 's' : ''} as part of routine maintenance.`);

  // Top issue types (by unique rule count)
  const allIssues = [
    ...sharedComponents.flatMap(c => c.issues),
    ...pageSpecificIssues.flatMap(p => p.issues),
  ];
  const ruleMap = new Map<string, { count: number; impact: string; desc: string }>();
  for (const issue of allIssues) {
    const existing = ruleMap.get(issue.ruleId);
    if (!existing) {
      ruleMap.set(issue.ruleId, { count: 1, impact: issue.impact, desc: issue.description });
    } else {
      existing.count++;
    }
  }
  const topIssues = [...ruleMap.entries()]
    .sort((a, b) => {
      const impactOrder: Record<string, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };
      const diff = (impactOrder[a[1].impact] ?? 4) - (impactOrder[b[1].impact] ?? 4);
      return diff !== 0 ? diff : b[1].count - a[1].count;
    })
    .slice(0, 5);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Accessibility Health Summary — ${hostname}</title>
  <style>
    @page { size: A4; margin: 1.8cm 2cm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      color: #334155;
      background: #fff;
      line-height: 1.55;
      font-size: 13px;
    }

    /* Header strip */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 14px;
      border-bottom: 3px solid #0f172a;
      margin-bottom: 18px;
    }
    .header h1 {
      font-size: 1.35rem;
      font-weight: 700;
      color: #0f172a;
      letter-spacing: -0.02em;
    }
    .header .site-url {
      font-size: 0.85rem;
      color: #64748b;
      margin-top: 2px;
    }
    .header .date {
      font-size: 0.75rem;
      color: #94a3b8;
      text-align: right;
      white-space: nowrap;
    }

    /* Score hero */
    .score-hero {
      display: flex;
      align-items: center;
      gap: 24px;
      padding: 18px 24px;
      border-radius: 12px;
      margin-bottom: 18px;
    }
    .score-hero.healthy { background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border: 1px solid #bbf7d0; }
    .score-hero.good { background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border: 1px solid #bbf7d0; }
    .score-hero.moderate { background: linear-gradient(135deg, #fefce8 0%, #fef9c3 100%); border: 1px solid #fef08a; }
    .score-hero.poor { background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border: 1px solid #fecaca; }
    .score-circle {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      background: #fff;
    }
    .score-hero.healthy .score-circle { border: 4px solid #16a34a; }
    .score-hero.good .score-circle { border: 4px solid #16a34a; }
    .score-hero.moderate .score-circle { border: 4px solid #ca8a04; }
    .score-hero.poor .score-circle { border: 4px solid #dc2626; }
    .score-num { font-size: 1.8rem; font-weight: 800; line-height: 1; }
    .score-hero.healthy .score-num { color: #16a34a; }
    .score-hero.good .score-num { color: #16a34a; }
    .score-hero.moderate .score-num { color: #ca8a04; }
    .score-hero.poor .score-num { color: #dc2626; }
    .score-label { font-size: 0.6rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; }
    .score-text h2 {
      font-size: 1.1rem;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 4px;
    }
    .score-text p { color: #475569; font-size: 0.85rem; }

    /* Quick stats row */
    .stats-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 18px;
    }
    .stat-box {
      text-align: center;
      padding: 10px 8px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
    }
    .stat-box .num { font-size: 1.4rem; font-weight: 800; color: #0f172a; line-height: 1.2; }
    .stat-box .lbl { font-size: 0.65rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; }
    .stat-box.critical .num { color: #b91c1c; }
    .stat-box.serious .num { color: #c2410c; }
    .stat-box.moderate .num { color: #a16207; }
    .stat-box.minor .num { color: #1d4ed8; }

    /* Two-column layout */
    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 18px;
    }
    .col-card {
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      overflow: hidden;
    }
    .col-card-header {
      padding: 8px 14px;
      font-weight: 700;
      font-size: 0.8rem;
      color: #fff;
      letter-spacing: 0.03em;
    }
    .col-card-header.green { background: #16a34a; }
    .col-card-header.blue { background: #1e40af; }
    .col-card-body {
      padding: 12px 14px;
    }
    .col-card-body ul {
      list-style: none;
      padding: 0;
    }
    .col-card-body li {
      padding: 5px 0;
      font-size: 0.8rem;
      color: #334155;
      border-bottom: 1px solid #f1f5f9;
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }
    .col-card-body li:last-child { border-bottom: none; }
    .col-card-body li .icon { flex-shrink: 0; font-size: 0.85rem; margin-top: 1px; }

    /* Top issues table */
    .issues-section {
      margin-bottom: 16px;
    }
    .issues-section h3 {
      font-size: 0.85rem;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 8px;
    }
    .issues-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.78rem;
    }
    .issues-table th {
      background: #0f172a;
      color: #fff;
      padding: 6px 10px;
      text-align: left;
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .issues-table td {
      padding: 6px 10px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: top;
    }
    .issues-table tr:nth-child(even) td { background: #f8fafc; }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.6rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .badge-critical { background: #fef2f2; color: #b91c1c; }
    .badge-serious { background: #fff7ed; color: #c2410c; }
    .badge-moderate { background: #fefce8; color: #a16207; }
    .badge-minor { background: #eff6ff; color: #1d4ed8; }

    /* Severity mini bar */
    .severity-mini {
      display: flex;
      height: 8px;
      border-radius: 4px;
      overflow: hidden;
      background: #f1f5f9;
      margin-bottom: 6px;
    }
    .severity-mini span { height: 100%; }
    .severity-legend {
      display: flex;
      gap: 12px;
      font-size: 0.7rem;
      color: #64748b;
    }
    .severity-legend .dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 2px;
      margin-right: 4px;
      vertical-align: middle;
    }

    /* Footer */
    .footer {
      margin-top: 14px;
      padding-top: 10px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      font-size: 0.65rem;
      color: #94a3b8;
    }

    @media print {
      body { font-size: 11px; }
    }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <div>
      <h1>Accessibility Health Summary</h1>
      <div class="site-url">${escapeHtml(scan.root_url)}</div>
    </div>
    <div class="date">
      ${reportDate}<br>
      WCAG 2.1 AA &middot; ${summary.totalPages} pages
    </div>
  </div>

  <!-- Score Hero -->
  <div class="score-hero ${healthClass}">
    <div class="score-circle">
      <div class="score-num">${summary.score}</div>
      <div class="score-label">/ 100</div>
    </div>
    <div class="score-text">
      <h2>${healthLabel}</h2>
      <p>${summary.score >= 90
        ? `${escapeHtml(hostname)} demonstrates strong accessibility practices. The site provides an inclusive experience for users with disabilities.`
        : summary.score >= 80
          ? `${escapeHtml(hostname)} shows good accessibility with room for improvement. Most content is accessible to users with disabilities.`
          : summary.score >= 50
            ? `${escapeHtml(hostname)} has a foundation for accessibility but needs attention in key areas to improve the experience for all users.`
            : `${escapeHtml(hostname)} requires accessibility improvements to ensure equal access for all users.`
      }</p>
    </div>
  </div>

  <!-- Quick Stats -->
  <div class="stats-row">
    <div class="stat-box">
      <div class="num">${summary.totalPages}</div>
      <div class="lbl">Pages Scanned</div>
    </div>
    <div class="stat-box">
      <div class="num">${totalUniqueIssues}</div>
      <div class="lbl">Unique Issues</div>
    </div>
    <div class="stat-box">
      <div class="num">${summary.totalIssuesDeduplicated}</div>
      <div class="lbl">Total Occurrences</div>
    </div>
    <div class="stat-box">
      <div class="num">${sharedComponents.length}</div>
      <div class="lbl">Shared Components</div>
    </div>
  </div>

  <!-- Severity Mini Bar -->
  <div style="margin-bottom: 18px;">
    <div class="severity-mini">
      ${summary.totalIssuesRaw > 0 ? `
        <span style="width:${(summary.bySeverity.critical / summary.totalIssuesRaw) * 100}%;background:#b91c1c;"></span>
        <span style="width:${(summary.bySeverity.serious / summary.totalIssuesRaw) * 100}%;background:#c2410c;"></span>
        <span style="width:${(summary.bySeverity.moderate / summary.totalIssuesRaw) * 100}%;background:#a16207;"></span>
        <span style="width:${(summary.bySeverity.minor / summary.totalIssuesRaw) * 100}%;background:#1d4ed8;"></span>
      ` : '<span style="width:100%;background:#16a34a;"></span>'}
    </div>
    <div class="severity-legend">
      <span><span class="dot" style="background:#b91c1c;"></span>Critical (${summary.bySeverity.critical})</span>
      <span><span class="dot" style="background:#c2410c;"></span>Serious (${summary.bySeverity.serious})</span>
      <span><span class="dot" style="background:#a16207;"></span>Moderate (${summary.bySeverity.moderate})</span>
      <span><span class="dot" style="background:#1d4ed8;"></span>Minor (${summary.bySeverity.minor})</span>
    </div>
  </div>

  <!-- Strengths & Improvements -->
  <div class="two-col">
    <div class="col-card">
      <div class="col-card-header green">What's Strong</div>
      <div class="col-card-body">
        <ul>
          ${strengths.map(s => `<li><span class="icon">&#10003;</span><span>${s}</span></li>`).join('')}
        </ul>
      </div>
    </div>
    <div class="col-card">
      <div class="col-card-header blue">What Can Improve</div>
      <div class="col-card-body">
        <ul>
          ${improvements.length > 0
            ? improvements.map(s => `<li><span class="icon">&#9655;</span><span>${s}</span></li>`).join('')
            : '<li><span class="icon">&#10003;</span><span>No significant improvements needed — keep up the great work!</span></li>'
          }
        </ul>
      </div>
    </div>
  </div>

  <!-- Top Issues -->
  ${topIssues.length > 0 ? `
  <div class="issues-section">
    <h3>Top Issues to Address</h3>
    <table class="issues-table">
      <thead><tr><th>Issue</th><th>Severity</th><th>Description</th></tr></thead>
      <tbody>
        ${topIssues.map(([ruleId, info]) => `
          <tr>
            <td style="font-weight:600;color:#0f172a;white-space:nowrap;">${escapeHtml(ruleId)}</td>
            <td><span class="badge badge-${info.impact}">${info.impact}</span></td>
            <td>${escapeHtml(info.desc)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  <!-- Footer -->
  <div class="footer">
    <span>Generated by WCAG Crawler &middot; Automated Accessibility Scanner</span>
    <span>${reportDate} &middot; WCAG 2.1 AA &middot; axe-core</span>
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
