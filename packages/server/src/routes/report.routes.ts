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
            format: 'Letter',
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
  // Vivid, print-friendly colors
  const healthColor = summary.score >= 90 ? '#059669' : summary.score >= 80 ? '#059669' : summary.score >= 50 ? '#d97706' : '#dc2626';

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

  // Saturated print-friendly palette
  const sevColor: Record<string, string> = { critical: '#dc2626', serious: '#ea580c', moderate: '#d97706', minor: '#2563eb' };

  // SVG icons (compact)
  const ico = {
    globe: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1e293b" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
    search: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1e293b" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    layers: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1e293b" stroke-width="1.5"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
    check: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="${healthColor}" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    arrowR: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1e293b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
  };

  const circumference = Math.round(2 * Math.PI * 44);
  const dashOffset = Math.round(circumference * (1 - summary.score / 100));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Accessibility Report — ${hostname}</title>
  <style>
    @page { size: Letter; margin: 1.2cm 1.4cm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      color: #1e293b;
      background: #fff;
      line-height: 1.5;
      font-size: 12px;
    }
    .page { max-width: 780px; margin: 0 auto; padding: 28px 32px; }
    @media print { .page { padding: 0; } }

    /* ── Header ── */
    .hdr { text-align: center; margin-bottom: 14px; }
    .hdr .brand {
      display: inline-block;
      font-size: 0.6rem; font-weight: 700;
      letter-spacing: 0.18em; text-transform: uppercase;
      color: #64748b; background: #f1f5f9;
      padding: 3px 12px; border-radius: 4px;
      margin-bottom: 8px;
    }
    .hdr h1 { font-size: 1.5rem; font-weight: 800; color: #0f172a; letter-spacing: -0.03em; line-height: 1.3; }
    .hdr .sub { font-size: 0.8rem; color: #64748b; margin-top: 4px; }

    /* ── Divider ── */
    .divider { height: 2px; background: linear-gradient(90deg, transparent, #cbd5e1, transparent); margin: 12px 0; }

    /* ── Section Titles ── */
    .stitle {
      font-size: 0.85rem; font-weight: 800; color: #0f172a;
      text-align: center; margin: 18px 0 10px;
      text-transform: uppercase; letter-spacing: 0.08em;
    }

    /* ── Score Hero ── */
    .hero {
      display: flex; align-items: center; justify-content: center;
      gap: 24px; padding: 16px 28px;
      background: #fff; border: 2px solid ${healthColor};
      border-radius: 16px; margin-bottom: 4px;
    }
    .ring { position: relative; width: 120px; height: 120px; flex-shrink: 0; }
    .ring svg { transform: rotate(-90deg); }
    .ring .bg { fill: none; stroke: #e2e8f0; stroke-width: 5; }
    .ring .fg { fill: none; stroke: ${healthColor}; stroke-width: 5; stroke-linecap: round; }
    .ring-inner {
      position: absolute; inset: 0;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
    }
    .ring-inner .n { font-size: 2.2rem; font-weight: 900; color: ${healthColor}; line-height: 1; }
    .ring-inner .o { font-size: 0.55rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; }
    .hero-text h2 { font-size: 1.4rem; font-weight: 800; color: ${healthColor}; margin-bottom: 4px; }
    .hero-text p { font-size: 0.82rem; color: #475569; max-width: 340px; line-height: 1.5; }

    /* ── Flow ── */
    .flow { display: flex; align-items: stretch; justify-content: center; gap: 4px; margin-bottom: 6px; }
    .fcard {
      flex: 1; max-width: 145px;
      background: #fff; border: 1.5px solid #e2e8f0; border-radius: 12px;
      padding: 12px 10px; text-align: center;
    }
    .fcard .fi { margin-bottom: 4px; display: flex; justify-content: center; }
    .fcard .fn { font-size: 1.7rem; font-weight: 900; color: #0f172a; line-height: 1.1; }
    .fcard .fl { font-size: 0.6rem; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 1px; }
    .fcard .fd { font-size: 0.58rem; color: #94a3b8; margin-top: 2px; }
    .farr { display: flex; align-items: center; padding: 0 2px; }

    /* ── Severity Row ── */
    .srow { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 6px; }
    .sc {
      background: #fff; border-radius: 10px;
      padding: 10px 8px; text-align: center;
      border-left: 5px solid; border-top: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;
    }
    .sc .sn { font-size: 1.8rem; font-weight: 900; line-height: 1; }
    .sc .sl { font-size: 0.6rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; margin-top: 3px; }
    .sc .sd { font-size: 0.58rem; color: #94a3b8; margin-top: 3px; }

    /* ── Insights ── */
    .igrid { display: grid; grid-template-columns: 1fr; gap: 10px; margin-top: 18px; margin-bottom: 8px; }
    .icard { border-radius: 12px; overflow: hidden; border: 1.5px solid #e2e8f0; }
    .ihdr {
      padding: 7px 14px; font-size: 0.68rem; font-weight: 800;
      letter-spacing: 0.06em; text-transform: uppercase; color: #fff;
      display: flex; align-items: center; gap: 6px;
    }
    .ihdr svg { width: 13px; height: 13px; stroke: #fff; }
    .ihdr.g { background: #059669; }
    .ihdr.b { background: #1d4ed8; }
    .ibody { padding: 8px 14px; }
    .iitem { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 0.78rem; color: #1e293b; }
    .iitem + .iitem { border-top: 1px solid #f1f5f9; }
    .iico {
      flex-shrink: 0; width: 18px; height: 18px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 0.65rem; font-weight: 800;
    }
    .iico.g { background: #d1fae5; color: #059669; }
    .iico.b { background: #dbeafe; color: #1d4ed8; }

    /* ── Top Issues ── */
    .tissues { margin-bottom: 6px; }
    .irow {
      display: flex; align-items: center; gap: 10px;
      padding: 7px 12px; margin-bottom: 5px;
      background: #fff; border-left: 4px solid; border-radius: 6px;
      border-top: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;
    }
    .isev {
      display: inline-block; padding: 2px 8px; border-radius: 3px;
      font-size: 0.55rem; font-weight: 800; text-transform: uppercase;
      letter-spacing: 0.04em; color: #fff; flex-shrink: 0;
    }
    .iname { font-size: 0.78rem; font-weight: 700; color: #0f172a; flex-shrink: 0; }
    .idesc { font-size: 0.72rem; color: #64748b; flex: 1; }

    /* ── Evaluation Methods ── */
    .evalmethods {
      margin-top: 12px; padding: 10px 14px;
      background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;
    }
    .evalmethods .stitle { margin-bottom: 8px; }
    .evalmethods p {
      font-size: 0.72rem; color: #475569; line-height: 1.6; margin: 0 0 6px 0;
    }
    .evalmethods ul {
      font-size: 0.72rem; color: #475569; line-height: 1.6;
      margin: 4px 0 0 0; padding-left: 18px;
    }
    .evalmethods li { margin-bottom: 3px; }

    /* ── Footer ── */
    .ftr {
      margin-top: 10px; padding-top: 8px;
      border-top: 2px solid #e2e8f0;
      display: flex; justify-content: space-between;
      font-size: 0.6rem; color: #94a3b8;
    }
  </style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="hdr">
    <div class="brand">WCAG 2.1 AA Accessibility Report</div>
    <h1>Your Accessibility Health Report</h1>
    <div class="sub">${escapeHtml(scan.root_url)} &middot; ${reportDate}</div>
  </div>
  <div class="divider"></div>

  <!-- SCORE -->
  <div class="hero">
    <div class="ring">
      <svg viewBox="0 0 100 100" width="120" height="120">
        <circle class="bg" cx="50" cy="50" r="44"/>
        <circle class="fg" cx="50" cy="50" r="44"
          stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}"/>
      </svg>
      <div class="ring-inner">
        <div class="n">${summary.score}</div>
        <div class="o">out of 100</div>
      </div>
    </div>
    <div class="hero-text">
      <h2>${healthLabel}</h2>
      <p>${summary.score >= 90
        ? `${escapeHtml(hostname)} demonstrates strong accessibility practices. Your site provides an inclusive experience for all users.`
        : summary.score >= 80
          ? `${escapeHtml(hostname)} shows good accessibility with room to grow. Most content is accessible to users with disabilities.`
          : summary.score >= 50
            ? `${escapeHtml(hostname)} has an accessibility foundation but needs attention in key areas for a more inclusive experience.`
            : `${escapeHtml(hostname)} needs accessibility improvements to ensure equal access for all users.`
      }</p>
    </div>
  </div>

  <!-- SCAN FLOW -->
  <div class="stitle">Scan Overview</div>
  <div class="flow">
    <div class="fcard">
      <div class="fi">${ico.globe}</div>
      <div class="fn">${summary.totalPages}</div>
      <div class="fl">Pages Scanned</div>
      <div class="fd">Discovered via crawling</div>
    </div>
    <div class="farr">${ico.arrowR}</div>
    <div class="fcard">
      <div class="fi">${ico.search}</div>
      <div class="fn">${summary.totalIssuesRaw}</div>
      <div class="fl">Issues Found</div>
      <div class="fd">Raw violations detected</div>
    </div>
    <div class="farr">${ico.arrowR}</div>
    <div class="fcard">
      <div class="fi">${ico.layers}</div>
      <div class="fn">${totalUniqueIssues}</div>
      <div class="fl">Unique Issues</div>
      <div class="fd">After deduplication</div>
    </div>
    <div class="farr">${ico.arrowR}</div>
    <div class="fcard">
      <div class="fi">${ico.check}</div>
      <div class="fn" style="color:${healthColor};">${cleanPagePercent}%</div>
      <div class="fl">Clean Pages</div>
      <div class="fd">${pagesWithNoIssues} of ${summary.totalPages} pages</div>
    </div>
  </div>

  <!-- SEVERITY -->
  <div class="stitle">Issue Breakdown</div>
  <div class="srow">
    <div class="sc" style="border-left-color:${sevColor.critical};">
      <div class="sn" style="color:${sevColor.critical};">${summary.bySeverity.critical}</div>
      <div class="sl" style="color:${sevColor.critical};">Critical</div>
      <div class="sd">Blocks access entirely</div>
    </div>
    <div class="sc" style="border-left-color:${sevColor.serious};">
      <div class="sn" style="color:${sevColor.serious};">${summary.bySeverity.serious}</div>
      <div class="sl" style="color:${sevColor.serious};">Serious</div>
      <div class="sd">Significant barriers</div>
    </div>
    <div class="sc" style="border-left-color:${sevColor.moderate};">
      <div class="sn" style="color:${sevColor.moderate};">${summary.bySeverity.moderate}</div>
      <div class="sl" style="color:${sevColor.moderate};">Moderate</div>
      <div class="sd">Some barriers</div>
    </div>
    <div class="sc" style="border-left-color:${sevColor.minor};">
      <div class="sn" style="color:${sevColor.minor};">${summary.bySeverity.minor}</div>
      <div class="sl" style="color:${sevColor.minor};">Minor</div>
      <div class="sd">Small inconveniences</div>
    </div>
  </div>

  <!-- INSIGHTS -->
  <div class="igrid">
    <div class="icard">
      <div class="ihdr g">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        What's Strong
      </div>
      <div class="ibody">
        ${strengths.map(s => `<div class="iitem"><span class="iico g">&#10003;</span><span>${s}</span></div>`).join('')}
      </div>
    </div>
  </div>

  <!-- TOP ISSUES -->
  ${topIssues.length > 0 ? `
  <div class="tissues">
    <div class="stitle">Top Issues to Address</div>
    ${topIssues.map(([ruleId, info]) => `
      <div class="irow" style="border-left-color:${sevColor[info.impact] || '#94a3b8'};">
        <span class="isev" style="background:${sevColor[info.impact] || '#94a3b8'};">${info.impact}</span>
        <span class="iname">${escapeHtml(ruleId)}</span>
        <span class="idesc">${escapeHtml(info.desc)}</span>
      </div>
    `).join('')}
  </div>
  ` : ''}

  <!-- EVALUATION METHODS -->
  <div class="evalmethods">
    <div class="stitle">Evaluation Methods</div>
    <p>This report was generated using automated accessibility testing with the following methodology:</p>
    <ul>
      <li><strong>Engine:</strong> axe-core (Deque Systems) &mdash; an industry-standard, open-source accessibility testing engine.</li>
      <li><strong>Standard:</strong> WCAG 2.1 Level A and Level AA success criteria.</li>
      <li><strong>Scope:</strong> Automated detection of programmatically identifiable violations including color contrast, missing alt text, ARIA attribute misuse, form labeling, heading structure, keyboard accessibility, and document language.</li>
    </ul>
  </div>

  <!-- FOOTER -->
  <div class="ftr">
    <span>Generated by WCAG Crawler &middot; Automated Accessibility Scanner</span>
    <span>Powered by axe-core (Deque Systems) &middot; WCAG 2.1 AA &middot; ${reportDate}</span>
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
