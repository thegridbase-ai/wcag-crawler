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
  const healthColor = summary.score >= 90 ? '#16a34a' : summary.score >= 80 ? '#16a34a' : summary.score >= 50 ? '#ca8a04' : '#dc2626';
  const healthBg = summary.score >= 90 ? '#f0fdf4' : summary.score >= 80 ? '#f0fdf4' : summary.score >= 50 ? '#fefce8' : '#fef2f2';

  const totalUniqueIssues = (summary.ruleCountBySeverity?.critical || 0) +
    (summary.ruleCountBySeverity?.serious || 0) +
    (summary.ruleCountBySeverity?.moderate || 0) +
    (summary.ruleCountBySeverity?.minor || 0);

  const hostname = new URL(scan.root_url).hostname;
  const pagesWithNoIssues = summary.totalPages - pageSpecificIssues.length;
  const cleanPagePercent = summary.totalPages > 0 ? Math.round((pagesWithNoIssues / summary.totalPages) * 100) : 0;

  // Build strengths
  const strengths: string[] = [];
  if (summary.bySeverity.critical === 0) strengths.push('Zero critical barriers found');
  if (summary.bySeverity.serious === 0) strengths.push('No serious issues detected');
  if (pagesWithNoIssues > 0) strengths.push(`${pagesWithNoIssues} of ${summary.totalPages} pages are clean`);
  if (summary.score >= 80) strengths.push('Strong accessibility foundation');
  if (strengths.length === 0) strengths.push(`${summary.totalPages} pages evaluated`);

  // Build improvements
  const improvements: string[] = [];
  if (summary.bySeverity.critical > 0) improvements.push(`${summary.bySeverity.critical} critical issue${summary.bySeverity.critical > 1 ? 's' : ''} to fix`);
  if (summary.bySeverity.serious > 0) improvements.push(`${summary.bySeverity.serious} serious issue${summary.bySeverity.serious > 1 ? 's' : ''} to address`);
  if (sharedComponents.length > 0) improvements.push(`${sharedComponents.length} shared component${sharedComponents.length > 1 ? 's' : ''} to update`);
  if (summary.bySeverity.moderate > 0) improvements.push(`${summary.bySeverity.moderate} moderate item${summary.bySeverity.moderate > 1 ? 's' : ''} to review`);

  // Top issues
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
      const order: Record<string, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };
      const diff = (order[a[1].impact] ?? 4) - (order[b[1].impact] ?? 4);
      return diff !== 0 ? diff : b[1].count - a[1].count;
    })
    .slice(0, 4);

  // SVG icons
  const icons = {
    globe: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
    pages: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
    search: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    shield: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    check: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    alert: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#c2410c" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    layers: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
    zap: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    arrowDown: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`,
    arrowRight: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
  };

  const impactColor: Record<string, string> = { critical: '#b91c1c', serious: '#c2410c', moderate: '#a16207', minor: '#1d4ed8' };
  const impactBg: Record<string, string> = { critical: '#fef2f2', serious: '#fff7ed', moderate: '#fefce8', minor: '#eff6ff' };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Accessibility Report — ${hostname}</title>
  <style>
    @page { size: A4; margin: 1.4cm 1.6cm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      color: #475569;
      background: #f1f5f9;
      line-height: 1.5;
      font-size: 12px;
    }
    .page {
      max-width: 800px;
      margin: 0 auto;
      background: #fff;
      padding: 32px 36px;
    }
    @media print { body { background: #fff; } .page { padding: 0; } }

    /* ── Header ── */
    .report-header {
      text-align: center;
      margin-bottom: 28px;
      padding-bottom: 20px;
      border-bottom: 2px solid #e2e8f0;
    }
    .report-header .brand {
      font-size: 0.6rem;
      font-weight: 700;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: #94a3b8;
      margin-bottom: 6px;
    }
    .report-header h1 {
      font-size: 1.6rem;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.03em;
      margin-bottom: 2px;
    }
    .report-header .subtitle {
      font-size: 0.85rem;
      color: #64748b;
    }

    /* ── Section Titles ── */
    .section-title {
      font-size: 0.95rem;
      font-weight: 800;
      color: #0f172a;
      text-align: center;
      margin: 24px 0 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid #e2e8f0;
      letter-spacing: -0.01em;
    }

    /* ── Score Hero ── */
    .score-hero {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 20px;
      padding: 20px;
      border-radius: 16px;
      margin-bottom: 20px;
    }
    .score-ring {
      position: relative;
      width: 100px;
      height: 100px;
      flex-shrink: 0;
    }
    .score-ring svg { transform: rotate(-90deg); }
    .score-ring .bg { fill: none; stroke: #e2e8f0; stroke-width: 6; }
    .score-ring .fg { fill: none; stroke-width: 6; stroke-linecap: round; transition: stroke-dashoffset 1s; }
    .score-inner {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .score-inner .num {
      font-size: 2rem;
      font-weight: 900;
      line-height: 1;
    }
    .score-inner .of {
      font-size: 0.55rem;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .score-detail {
      text-align: left;
    }
    .score-detail .label {
      font-size: 1.3rem;
      font-weight: 800;
      line-height: 1.2;
      margin-bottom: 4px;
    }
    .score-detail .desc {
      font-size: 0.8rem;
      color: #64748b;
      max-width: 320px;
    }

    /* ── Scan Stats Flow ── */
    .scan-flow {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      margin-bottom: 20px;
    }
    .flow-card {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 14px 16px;
      text-align: center;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
      min-width: 120px;
    }
    .flow-card .icon { margin-bottom: 6px; display: flex; justify-content: center; }
    .flow-card .big-num {
      font-size: 1.8rem;
      font-weight: 900;
      color: #0f172a;
      line-height: 1;
    }
    .flow-card .flow-label {
      font-size: 0.65rem;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-top: 2px;
    }
    .flow-card .flow-desc {
      font-size: 0.65rem;
      color: #94a3b8;
      margin-top: 2px;
    }
    .flow-arrow {
      display: flex;
      align-items: center;
      color: #cbd5e1;
    }

    /* ── Severity Cards Row ── */
    .severity-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 20px;
    }
    .sev-card {
      border-radius: 10px;
      padding: 12px 10px;
      text-align: center;
      border: 1px solid #e2e8f0;
    }
    .sev-card .sev-num {
      font-size: 1.6rem;
      font-weight: 900;
      line-height: 1;
    }
    .sev-card .sev-label {
      font-size: 0.6rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-top: 2px;
    }
    .sev-card .sev-desc {
      font-size: 0.6rem;
      color: #94a3b8;
      margin-top: 3px;
    }

    /* ── Insights Grid ── */
    .insights-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 20px;
    }
    .insight-card {
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      overflow: hidden;
    }
    .insight-header {
      padding: 8px 14px;
      font-size: 0.7rem;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .insight-header svg { width: 14px; height: 14px; stroke: #fff; }
    .insight-header.green { background: #16a34a; }
    .insight-header.amber { background: #1e40af; }
    .insight-body {
      padding: 10px 14px;
    }
    .insight-item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 5px 0;
      font-size: 0.78rem;
      color: #334155;
    }
    .insight-item + .insight-item { border-top: 1px solid #f1f5f9; }
    .insight-icon {
      flex-shrink: 0;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.6rem;
      font-weight: 700;
      margin-top: 1px;
    }
    .insight-icon.green { background: #dcfce7; color: #16a34a; }
    .insight-icon.blue { background: #dbeafe; color: #1e40af; }

    /* ── Top Issues ── */
    .top-issues {
      margin-bottom: 16px;
    }
    .issue-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      margin-bottom: 6px;
      background: #fff;
    }
    .issue-sev {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.55rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      flex-shrink: 0;
    }
    .issue-name {
      font-size: 0.78rem;
      font-weight: 700;
      color: #0f172a;
      flex-shrink: 0;
    }
    .issue-desc {
      font-size: 0.72rem;
      color: #64748b;
      flex: 1;
    }

    /* ── Footer ── */
    .report-footer {
      margin-top: 20px;
      padding-top: 12px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.6rem;
      color: #94a3b8;
    }
    .report-footer .method {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .report-footer .method span {
      display: flex;
      align-items: center;
      gap: 4px;
    }
  </style>
</head>
<body>
<div class="page">

  <!-- ═══ HEADER ═══ -->
  <div class="report-header">
    <div class="brand">WCAG Accessibility Report</div>
    <h1>Your Accessibility<br>Health Report</h1>
    <div class="subtitle">${escapeHtml(scan.root_url)} &middot; ${reportDate}</div>
  </div>

  <!-- ═══ SCORE HERO ═══ -->
  <div class="score-hero" style="background: ${healthBg}; border: 1px solid ${healthColor}22;">
    <div class="score-ring">
      <svg viewBox="0 0 100 100" width="100" height="100">
        <circle class="bg" cx="50" cy="50" r="42" />
        <circle class="fg" cx="50" cy="50" r="42"
          stroke="${healthColor}"
          stroke-dasharray="${Math.round(2 * Math.PI * 42)}"
          stroke-dashoffset="${Math.round(2 * Math.PI * 42 * (1 - summary.score / 100))}" />
      </svg>
      <div class="score-inner">
        <div class="num" style="color:${healthColor};">${summary.score}</div>
        <div class="of">out of 100</div>
      </div>
    </div>
    <div class="score-detail">
      <div class="label" style="color:${healthColor};">${healthLabel}</div>
      <div class="desc">${summary.score >= 90
        ? `${escapeHtml(hostname)} demonstrates strong accessibility. Your site provides an inclusive experience for users with disabilities.`
        : summary.score >= 80
          ? `${escapeHtml(hostname)} shows good accessibility with room to grow. Most content is accessible.`
          : summary.score >= 50
            ? `${escapeHtml(hostname)} has a foundation but needs attention in key areas for better inclusivity.`
            : `${escapeHtml(hostname)} needs accessibility improvements to ensure equal access for all users.`
      }</div>
    </div>
  </div>

  <!-- ═══ SCAN STATS FLOW ═══ -->
  <div class="section-title">Scan Overview</div>
  <div class="scan-flow">
    <div class="flow-card">
      <div class="icon">${icons.globe}</div>
      <div class="big-num">${summary.totalPages}</div>
      <div class="flow-label">Pages Scanned</div>
      <div class="flow-desc">Discovered via crawling</div>
    </div>
    <div class="flow-arrow">${icons.arrowRight}</div>
    <div class="flow-card">
      <div class="icon">${icons.search}</div>
      <div class="big-num">${summary.totalIssuesRaw}</div>
      <div class="flow-label">Issues Found</div>
      <div class="flow-desc">Raw accessibility violations</div>
    </div>
    <div class="flow-arrow">${icons.arrowRight}</div>
    <div class="flow-card">
      <div class="icon">${icons.layers}</div>
      <div class="big-num">${totalUniqueIssues}</div>
      <div class="flow-label">Unique Issues</div>
      <div class="flow-desc">After deduplication</div>
    </div>
    <div class="flow-arrow">${icons.arrowRight}</div>
    <div class="flow-card">
      <div class="icon">${icons.check}</div>
      <div class="big-num" style="color:${healthColor};">${cleanPagePercent}%</div>
      <div class="flow-label">Clean Pages</div>
      <div class="flow-desc">${pagesWithNoIssues} of ${summary.totalPages} pages</div>
    </div>
  </div>

  <!-- ═══ SEVERITY BREAKDOWN ═══ -->
  <div class="section-title">Issue Breakdown</div>
  <div class="severity-row">
    <div class="sev-card" style="background:${impactBg.critical};">
      <div class="sev-num" style="color:${impactColor.critical};">${summary.bySeverity.critical}</div>
      <div class="sev-label" style="color:${impactColor.critical};">Critical</div>
      <div class="sev-desc">Blocks access entirely</div>
    </div>
    <div class="sev-card" style="background:${impactBg.serious};">
      <div class="sev-num" style="color:${impactColor.serious};">${summary.bySeverity.serious}</div>
      <div class="sev-label" style="color:${impactColor.serious};">Serious</div>
      <div class="sev-desc">Significant barriers</div>
    </div>
    <div class="sev-card" style="background:${impactBg.moderate};">
      <div class="sev-num" style="color:${impactColor.moderate};">${summary.bySeverity.moderate}</div>
      <div class="sev-label" style="color:${impactColor.moderate};">Moderate</div>
      <div class="sev-desc">Some barriers</div>
    </div>
    <div class="sev-card" style="background:${impactBg.minor};">
      <div class="sev-num" style="color:${impactColor.minor};">${summary.bySeverity.minor}</div>
      <div class="sev-label" style="color:${impactColor.minor};">Minor</div>
      <div class="sev-desc">Small inconveniences</div>
    </div>
  </div>

  <!-- ═══ INSIGHTS ═══ -->
  <div class="insights-grid">
    <div class="insight-card">
      <div class="insight-header green">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        What's Strong
      </div>
      <div class="insight-body">
        ${strengths.map(s => `<div class="insight-item"><span class="insight-icon green">&#10003;</span><span>${s}</span></div>`).join('')}
      </div>
    </div>
    <div class="insight-card">
      <div class="insight-header amber">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        What Can Improve
      </div>
      <div class="insight-body">
        ${improvements.length > 0
          ? improvements.map(s => `<div class="insight-item"><span class="insight-icon blue">&#9655;</span><span>${s}</span></div>`).join('')
          : '<div class="insight-item"><span class="insight-icon green">&#10003;</span><span>No significant improvements needed!</span></div>'
        }
      </div>
    </div>
  </div>

  <!-- ═══ TOP ISSUES ═══ -->
  ${topIssues.length > 0 ? `
  <div class="top-issues">
    <div class="section-title">Top Issues to Address</div>
    ${topIssues.map(([ruleId, info]) => `
      <div class="issue-row">
        <span class="issue-sev" style="background:${impactBg[info.impact] || '#f1f5f9'};color:${impactColor[info.impact] || '#64748b'};">${info.impact}</span>
        <span class="issue-name">${escapeHtml(ruleId)}</span>
        <span class="issue-desc">${escapeHtml(info.desc)}</span>
      </div>
    `).join('')}
  </div>
  ` : ''}

  <!-- ═══ FOOTER ═══ -->
  <div class="report-footer">
    <span>Generated by WCAG Crawler</span>
    <div class="method">
      <span>${icons.shield.replace(/width="28" height="28"/g, 'width="12" height="12"')} WCAG 2.1 AA</span>
      <span>${icons.search.replace(/width="28" height="28"/g, 'width="12" height="12"')} axe-core</span>
      <span>${reportDate}</span>
    </div>
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
