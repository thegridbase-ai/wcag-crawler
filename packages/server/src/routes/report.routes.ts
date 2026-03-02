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

  const severityColors = {
    critical: '#ef4444',
    serious: '#f97316',
    moderate: '#eab308',
    minor: '#3b82f6',
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>A11y Report - ${scan.root_url}</title>
  <style>
    :root {
      --bg: #f8f9fa;
      --surface: #ffffff;
      --border: #e2e5e9;
      --primary: #4f46e5;
      --critical: #dc2626;
      --serious: #ea580c;
      --moderate: #ca8a04;
      --minor: #2563eb;
      --success: #16a34a;
      --text: #1f2937;
      --text-muted: #6b7280;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 2rem;
    }
    h1, h2, h3 { font-family: 'JetBrains Mono', monospace; }
    .container { max-width: 1200px; margin: 0 auto; }
    .header { margin-bottom: 2rem; }
    .header h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    .header .url { color: var(--text-muted); font-size: 0.875rem; }
    .score-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 1rem;
      padding: 2rem;
      margin-bottom: 2rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      display: flex;
      align-items: center;
      gap: 2rem;
    }
    .score-circle {
      width: 120px;
      height: 120px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2.5rem;
      font-weight: bold;
      font-family: 'JetBrains Mono', monospace;
    }
    .score-circle.good { background: #dcfce7; border: 3px solid var(--success); color: var(--success); }
    .score-circle.moderate { background: #fef9c3; border: 3px solid var(--moderate); color: var(--moderate); }
    .score-circle.poor { background: #fee2e2; border: 3px solid var(--critical); color: var(--critical); }
    .score-label {
      display: inline-block;
      padding: 0.35rem 1rem;
      border-radius: 9999px;
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-top: 0.75rem;
    }
    .score-label.healthy { background: #dcfce7; color: var(--success); }
    .score-label.good { background: #dcfce7; color: var(--success); }
    .score-label.needs-improvement { background: #fef9c3; color: var(--moderate); }
    .score-label.poor { background: #fee2e2; color: var(--critical); }
    .metrics { display: flex; gap: 2rem; }
    .metric { text-align: center; }
    .metric-value { font-size: 1.5rem; font-weight: bold; font-family: 'JetBrains Mono', monospace; }
    .metric-label { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; }
    .severity-bar {
      display: flex;
      height: 8px;
      border-radius: 4px;
      overflow: hidden;
      margin: 1rem 0;
      width: 100%;
    }
    .severity-bar span { height: 100%; }
    .section { margin-bottom: 2rem; }
    .section h2 { font-size: 1.25rem; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border); }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      padding: 1rem;
      margin-bottom: 1rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
    .card-title { font-weight: 600; }
    .badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border-radius: 0.25rem;
      font-size: 0.75rem;
      font-weight: 500;
      text-transform: uppercase;
    }
    .badge-critical { background: #fee2e2; color: var(--critical); }
    .badge-serious { background: #ffedd5; color: var(--serious); }
    .badge-moderate { background: #fef9c3; color: var(--moderate); }
    .badge-minor { background: #dbeafe; color: var(--minor); }
    .issue { padding: 0.75rem; border-left: 3px solid var(--border); margin-bottom: 0.5rem; background: #f3f4f6; }
    .issue-critical { border-left-color: var(--critical); }
    .issue-serious { border-left-color: var(--serious); }
    .issue-moderate { border-left-color: var(--moderate); }
    .issue-minor { border-left-color: var(--minor); }
    .code {
      font-family: 'Fira Code', monospace;
      font-size: 0.75rem;
      background: #eef0f2;
      padding: 0.5rem;
      border-radius: 0.25rem;
      border: 1px solid var(--border);
      overflow-x: auto;
      margin-top: 0.5rem;
    }
    .text-muted { color: var(--text-muted); font-size: 0.875rem; }
    a { color: var(--primary); }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>A11y Crawler Report</h1>
      <p class="url">${scan.root_url}</p>
      <p class="text-muted">Generated: ${new Date().toISOString()}</p>
    </div>

    <div class="score-card">
      <div style="text-align: center;">
        <div class="score-circle ${summary.score >= 80 ? 'good' : summary.score >= 50 ? 'moderate' : 'poor'}">
          ${summary.score}
        </div>
        <div class="score-label ${summary.score >= 90 ? 'healthy' : summary.score >= 80 ? 'good' : summary.score >= 50 ? 'needs-improvement' : 'poor'}">
          ${summary.score >= 90 ? 'Healthy' : summary.score >= 80 ? 'Good' : summary.score >= 50 ? 'Needs Improvement' : 'Poor'}
        </div>
      </div>
      <div>
        <div class="metrics">
          <div class="metric">
            <div class="metric-value">${summary.totalPages}</div>
            <div class="metric-label">Pages</div>
          </div>
          <div class="metric">
            <div class="metric-value">${summary.totalIssuesDeduplicated}</div>
            <div class="metric-label">Unique Issues</div>
          </div>
          <div class="metric">
            <div class="metric-value" style="color: var(--critical)">${summary.bySeverity.critical}</div>
            <div class="metric-label">Critical</div>
          </div>
          <div class="metric">
            <div class="metric-value" style="color: var(--serious)">${summary.bySeverity.serious}</div>
            <div class="metric-label">Serious</div>
          </div>
        </div>
        <div class="severity-bar">
          <span style="width: ${(summary.bySeverity.critical / summary.totalIssuesRaw) * 100}%; background: var(--critical)"></span>
          <span style="width: ${(summary.bySeverity.serious / summary.totalIssuesRaw) * 100}%; background: var(--serious)"></span>
          <span style="width: ${(summary.bySeverity.moderate / summary.totalIssuesRaw) * 100}%; background: var(--moderate)"></span>
          <span style="width: ${(summary.bySeverity.minor / summary.totalIssuesRaw) * 100}%; background: var(--minor)"></span>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>Shared Components (${sharedComponents.length})</h2>
      ${sharedComponents.map(comp => `
        <div class="card">
          <div class="card-header">
            <span class="card-title">${comp.label}</span>
            <span class="text-muted">Found on ${comp.pageCount} pages</span>
          </div>
          ${comp.issues.map(issue => `
            <div class="issue issue-${issue.impact}">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                <strong>${issue.ruleId}</strong>
                <span class="badge badge-${issue.impact}">${issue.impact}</span>
              </div>
              <p class="text-muted">${issue.description}</p>
              <p class="text-muted">Affects ${issue.affectedPages} pages</p>
              ${issue.htmlSnippet ? `<div class="code">${escapeHtml(issue.htmlSnippet)}</div>` : ''}
            </div>
          `).join('')}
        </div>
      `).join('')}
    </div>

    <div class="section">
      <h2>Page-Specific Issues (${pageSpecificIssues.length} pages)</h2>
      ${pageSpecificIssues.slice(0, 20).map(page => `
        <div class="card">
          <div class="card-header">
            <span class="card-title">${page.url}</span>
            <span class="text-muted">${page.issueCount} issues</span>
          </div>
          ${page.issues.slice(0, 5).map(issue => `
            <div class="issue issue-${issue.impact}">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                <strong>${issue.ruleId}</strong>
                <span class="badge badge-${issue.impact}">${issue.impact}</span>
              </div>
              <p class="text-muted">${issue.description}</p>
            </div>
          `).join('')}
          ${page.issues.length > 5 ? `<p class="text-muted">... and ${page.issues.length - 5} more issues</p>` : ''}
        </div>
      `).join('')}
    </div>

    <footer style="text-align: center; padding: 2rem; color: var(--text-muted);">
      Generated by A11y Crawler — WCAG 2.1 AA Accessibility Scanner
    </footer>
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
