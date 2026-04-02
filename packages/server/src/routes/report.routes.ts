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

  // GET /api/reports/:scanId/fix-report - Generate AI-friendly fix instructions
  router.get('/:scanId/fix-report', (req: Request, res: Response) => {
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

      const markdown = generateFixReportMarkdown(report);
      const hostname = new URL(scan.root_url).hostname;
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="fix-report-${hostname}.md"`);
      res.send(markdown);
    } catch (error) {
      logger.error('Failed to generate fix report', { error: (error as Error).message });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

function generateFixReportMarkdown(report: ReturnType<typeof reportService.generateReport>): string {
  if (!report) return '';

  const { scan, summary, sharedComponents, pageSpecificIssues } = report;
  const hostname = new URL(scan.root_url).hostname;
  const lines: string[] = [];

  lines.push(`# Accessibility Fix Report — ${hostname}`);
  lines.push('');
  lines.push(`**Site:** ${scan.root_url}`);
  lines.push(`**Score:** ${summary.score}/100`);
  lines.push(`**Pages scanned:** ${summary.totalPages}`);
  lines.push(`**Total issues:** ${summary.totalIssuesDeduplicated} unique (${summary.totalIssuesRaw} raw)`);
  lines.push(`**Breakdown:** ${summary.bySeverity.critical} critical, ${summary.bySeverity.serious} serious, ${summary.bySeverity.moderate} moderate, ${summary.bySeverity.minor} minor`);
  lines.push('');
  lines.push(`> This report is structured for AI-assisted fixing. Each issue includes the exact CSS selector, the broken HTML, WCAG criteria, and step-by-step fix instructions. Feed this file to Claude AI or any code assistant to get precise fixes.`);
  lines.push('');
  lines.push(`---`);
  lines.push('');

  // Fix suggestions database (server-side version)
  const fixDb: Record<string, { problem: string; solution: string; before: string; after: string }> = {
    'image-alt': { problem: 'Image missing alt attribute', solution: 'Add alt="descriptive text" to the <img> tag. Use alt="" for decorative images.', before: '<img src="logo.png">', after: '<img src="logo.png" alt="Company Logo">' },
    'label': { problem: 'Form input missing label', solution: 'Add a <label for="inputId"> element associated with the input, or add aria-label attribute.', before: '<input type="text" name="email">', after: '<label for="email">Email</label>\n<input type="text" id="email" name="email">' },
    'link-name': { problem: 'Link has no discernible text', solution: 'Add text content inside the <a> tag, or add aria-label attribute.', before: '<a href="/profile"><i class="icon"></i></a>', after: '<a href="/profile" aria-label="View profile"><i class="icon" aria-hidden="true"></i></a>' },
    'button-name': { problem: 'Button has no discernible text', solution: 'Add text content inside the <button>, or add aria-label attribute.', before: '<button><i class="icon-search"></i></button>', after: '<button aria-label="Search"><i class="icon-search" aria-hidden="true"></i></button>' },
    'color-contrast': { problem: 'Insufficient color contrast', solution: 'Increase the contrast ratio to at least 4.5:1 for normal text, 3:1 for large text. Change the text color to be darker or the background to be lighter.', before: '<span style="color: #999">Light text</span>', after: '<span style="color: #595959">Darker text (4.5:1 ratio)</span>' },
    'heading-order': { problem: 'Heading levels are skipped', solution: 'Use heading levels sequentially (h1 -> h2 -> h3). Do not skip from h1 to h3.', before: '<h1>Title</h1>\n<h3>Section</h3>', after: '<h1>Title</h1>\n<h2>Section</h2>' },
    'region': { problem: 'Content not inside a landmark region', solution: 'Wrap content in a semantic landmark: <main>, <header>, <nav>, <aside>, or <footer>.', before: '<div class="content">...</div>', after: '<main class="content">...</main>' },
    'landmark-one-main': { problem: 'Page has no <main> landmark', solution: 'Add a <main> element to wrap the primary page content.', before: '<div class="content">...</div>', after: '<main class="content">...</main>' },
    'select-name': { problem: 'Select element missing accessible name', solution: 'Add a <label for="selectId"> or aria-label to the select element.', before: '<select name="country">...</select>', after: '<label for="country">Country</label>\n<select id="country" name="country">...</select>' },
    'html-has-lang': { problem: 'HTML element missing lang attribute', solution: 'Add lang="en" (or appropriate language code) to the <html> element.', before: '<html>', after: '<html lang="en">' },
    'bypass': { problem: 'No skip navigation link', solution: 'Add a "Skip to main content" link as the first focusable element on the page.', before: '<body>\n  <nav>...</nav>', after: '<body>\n  <a href="#main" class="skip-link">Skip to main content</a>\n  <nav>...</nav>\n  <main id="main">...</main>' },
    'duplicate-id': { problem: 'Duplicate id attributes on page', solution: 'Make each id unique. Rename duplicates to distinct values.', before: '<div id="content">A</div>\n<div id="content">B</div>', after: '<div id="content-1">A</div>\n<div id="content-2">B</div>' },
    'frame-title': { problem: 'iframe missing title attribute', solution: 'Add a title attribute describing the iframe content.', before: '<iframe src="video.html"></iframe>', after: '<iframe src="video.html" title="Product demo video"></iframe>' },
    'meta-viewport': { problem: 'Viewport prevents user scaling', solution: 'Remove user-scalable=no and maximum-scale=1 from the viewport meta tag.', before: '<meta name="viewport" content="width=device-width, user-scalable=no">', after: '<meta name="viewport" content="width=device-width, initial-scale=1">' },
    'empty-heading': { problem: 'Heading element is empty', solution: 'Add text content to the heading, or remove it if unnecessary.', before: '<h2></h2>', after: '<h2>Section Title</h2>' },
    'aria-hidden-focus': { problem: 'Focusable element inside aria-hidden', solution: 'Either remove aria-hidden from the parent, or add tabindex="-1" to the focusable child.', before: '<div aria-hidden="true"><button>Click</button></div>', after: '<div aria-hidden="true"><button tabindex="-1">Click</button></div>' },
    'document-title': { problem: 'Page missing <title> element', solution: 'Add a descriptive <title> in the <head> section.', before: '<head><meta charset="UTF-8"></head>', after: '<head><meta charset="UTF-8"><title>Page Title - Site</title></head>' },
    'aria-valid-attr-value': { problem: 'ARIA attribute has invalid value', solution: 'Use valid ARIA values. Boolean attributes use "true"/"false", not "yes"/"no".', before: '<div aria-hidden="yes">', after: '<div aria-hidden="true">' },
    'aria-valid-attr': { problem: 'Invalid ARIA attribute name', solution: 'Use a valid ARIA attribute. Check spelling (e.g., aria-labelledby not aria-labelled).', before: '<button aria-labelled="menu">', after: '<button aria-labelledby="menu-label">' },
    'aria-roles': { problem: 'Invalid ARIA role', solution: 'Use a valid WAI-ARIA role value.', before: '<div role="modal">', after: '<div role="dialog" aria-modal="true">' },
    'list': { problem: 'List contains non-list children', solution: 'Ensure <ul>/<ol> only contain <li> elements.', before: '<ul><div>Item</div></ul>', after: '<ul><li>Item</li></ul>' },
    'listitem': { problem: '<li> not inside <ul> or <ol>', solution: 'Wrap <li> elements in a <ul> or <ol>.', before: '<div><li>Item</li></div>', after: '<ul><li>Item</li></ul>' },
    'nested-interactive': { problem: 'Nested interactive elements', solution: 'Remove the nested interactive element. A button inside a link (or vice versa) is invalid.', before: '<button><a href="/link">Click</a></button>', after: '<a href="/link" class="button-style">Click</a>' },
    'scrollable-region-focusable': { problem: 'Scrollable region not keyboard-accessible', solution: 'Add tabindex="0" to make the scrollable container focusable.', before: '<div style="overflow:auto">', after: '<div tabindex="0" style="overflow:auto">' },
    'input-button-name': { problem: 'Input button missing text', solution: 'Add a value attribute for the button text.', before: '<input type="submit">', after: '<input type="submit" value="Submit Form">' },
    'autocomplete-valid': { problem: 'Invalid autocomplete attribute', solution: 'Use valid autocomplete tokens: name, email, tel, street-address, etc.', before: '<input autocomplete="place-city">', after: '<input autocomplete="address-level2">' },
    'valid-lang': { problem: 'Invalid lang attribute value', solution: 'Use a valid BCP 47 language code.', before: '<html lang="english">', after: '<html lang="en">' },
    'tabindex': { problem: 'tabindex greater than 0', solution: 'Use tabindex="0" to add to natural tab order, or tabindex="-1" for programmatic focus.', before: '<div tabindex="5">', after: '<div tabindex="0">' },
  };

  // --- SHARED COMPONENTS ---
  if (sharedComponents.length > 0) {
    lines.push(`## Shared Component Issues`);
    lines.push('');
    lines.push(`These issues appear in shared/repeated components (header, nav, footer) across multiple pages. **Fix once, fix everywhere.**`);
    lines.push('');

    for (const comp of sharedComponents) {
      if (comp.issues.length === 0) continue;

      lines.push(`### ${comp.label} (${comp.region})`);
      lines.push(`Affects **${comp.pageCount} pages**`);
      lines.push('');

      for (const issue of comp.issues) {
        const fix = fixDb[issue.ruleId];
        const impactEmoji = issue.impact === 'critical' ? '[CRITICAL]' : issue.impact === 'serious' ? '[SERIOUS]' : issue.impact === 'moderate' ? '[MODERATE]' : '[MINOR]';

        lines.push(`#### ${impactEmoji} ${issue.ruleId}: ${issue.description}`);
        lines.push('');
        lines.push(`- **Severity:** ${issue.impact}`);
        if (issue.wcagCriteria.length > 0) {
          lines.push(`- **WCAG:** ${issue.wcagCriteria.map(c => `SC ${c}`).join(', ')}`);
        }
        lines.push(`- **Selector:** \`${issue.target}\``);
        lines.push(`- **Affects:** ${issue.affectedPages} pages`);
        if (issue.affectedPageUrls && issue.affectedPageUrls.length > 0) {
          const urlsToShow = issue.affectedPageUrls.slice(0, 5);
          for (const url of urlsToShow) {
            lines.push(`  - ${url}`);
          }
          if (issue.affectedPageUrls.length > 5) {
            lines.push(`  - ...and ${issue.affectedPageUrls.length - 5} more`);
          }
        }
        lines.push('');

        if (issue.htmlSnippet) {
          lines.push(`**Current HTML (broken):**`);
          lines.push('```html');
          lines.push(issue.htmlSnippet);
          lines.push('```');
          lines.push('');
        }

        if (fix) {
          lines.push(`**Problem:** ${fix.problem}`);
          lines.push('');
          lines.push(`**How to fix:** ${fix.solution}`);
          lines.push('');
          lines.push(`**Example fix:**`);
          lines.push('```html');
          lines.push(`<!-- Before (wrong) -->`);
          lines.push(fix.before);
          lines.push('');
          lines.push(`<!-- After (correct) -->`);
          lines.push(fix.after);
          lines.push('```');
        } else {
          lines.push(`**Reference:** ${issue.helpUrl}`);
        }

        lines.push('');
        lines.push(`---`);
        lines.push('');
      }
    }
  }

  // --- PAGE-SPECIFIC ISSUES ---
  if (pageSpecificIssues.length > 0) {
    lines.push(`## Page-Specific Issues`);
    lines.push('');
    lines.push(`These issues are unique to specific pages.`);
    lines.push('');

    // Group by URL path pattern to help identify files
    for (const page of pageSpecificIssues) {
      if (page.issues.length === 0) continue;

      const urlPath = (() => {
        try { return new URL(page.url).pathname; } catch { return page.url; }
      })();

      // Try to guess the file path from URL
      const guessedFile = guessFilePath(urlPath);

      lines.push(`### Page: ${page.title || urlPath}`);
      lines.push(`- **URL:** ${page.url}`);
      if (guessedFile) {
        lines.push(`- **Likely file:** \`${guessedFile}\``);
      }
      lines.push(`- **Issues:** ${page.issueCount}`);
      lines.push('');

      // Group issues by rule for cleaner output
      const issuesByRule = new Map<string, typeof page.issues>();
      for (const issue of page.issues) {
        const key = issue.ruleId;
        if (!issuesByRule.has(key)) {
          issuesByRule.set(key, []);
        }
        issuesByRule.get(key)!.push(issue);
      }

      for (const [ruleId, ruleIssues] of issuesByRule) {
        const first = ruleIssues[0];
        const fix = fixDb[ruleId];
        const impactEmoji = first.impact === 'critical' ? '[CRITICAL]' : first.impact === 'serious' ? '[SERIOUS]' : first.impact === 'moderate' ? '[MODERATE]' : '[MINOR]';

        lines.push(`#### ${impactEmoji} ${ruleId}: ${first.description}`);
        lines.push('');
        lines.push(`- **Severity:** ${first.impact}`);
        if (first.wcagCriteria.length > 0) {
          lines.push(`- **WCAG:** ${first.wcagCriteria.map(c => `SC ${c}`).join(', ')}`);
        }
        lines.push(`- **Occurrences on this page:** ${ruleIssues.length}`);
        lines.push('');

        // Show each occurrence with selector and HTML
        for (let i = 0; i < ruleIssues.length; i++) {
          const issue = ruleIssues[i];
          if (ruleIssues.length > 1) {
            lines.push(`**Occurrence ${i + 1}:**`);
          }
          lines.push(`- Selector: \`${issue.target}\``);
          if (issue.htmlSnippet) {
            lines.push('```html');
            lines.push(issue.htmlSnippet);
            lines.push('```');
          }
          if (issue.failureSummary && !fix) {
            lines.push(`- Fix hint: ${issue.failureSummary}`);
          }
          lines.push('');
        }

        if (fix) {
          lines.push(`**How to fix:** ${fix.solution}`);
          lines.push('');
          lines.push(`**Example:**`);
          lines.push('```html');
          lines.push(`<!-- Before -->`);
          lines.push(fix.before);
          lines.push(`<!-- After -->`);
          lines.push(fix.after);
          lines.push('```');
          lines.push('');
        }

        lines.push(`---`);
        lines.push('');
      }
    }
  }

  // --- SUMMARY TABLE ---
  lines.push(`## Quick Reference: All Issues by Rule`);
  lines.push('');
  lines.push(`| Rule | Severity | Count | Description |`);
  lines.push(`|------|----------|-------|-------------|`);

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
  const sortedRules = [...ruleMap.entries()].sort((a, b) => {
    const order: Record<string, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };
    const diff = (order[a[1].impact] ?? 4) - (order[b[1].impact] ?? 4);
    return diff !== 0 ? diff : b[1].count - a[1].count;
  });
  for (const [ruleId, info] of sortedRules) {
    lines.push(`| ${ruleId} | ${info.impact} | ${info.count} | ${info.desc} |`);
  }
  lines.push('');

  return lines.join('\n');
}

function guessFilePath(urlPath: string): string | null {
  const path = urlPath.replace(/\/$/, '') || '/index';

  // Common web framework patterns
  const patterns: Array<{ match: RegExp; template: (m: RegExpMatchArray) => string }> = [
    // JSP: /path/page.action or /path/page.do -> WEB-INF/jsp/path/page.jsp
    { match: /^(.+)\.(action|do)$/, template: (m) => `WEB-INF/jsp${m[1]}.jsp` },
    // JSF: /path/page.jsf or .xhtml -> /path/page.xhtml
    { match: /^(.+)\.(jsf)$/, template: (m) => `${m[1]}.xhtml` },
    // PHP: /path/page -> /path/page.php
    { match: /^(\/[^.]+)$/, template: (m) => `${m[1]}.php or ${m[1]}.jsp or ${m[1]}/index.html` },
    // Direct file references
    { match: /^(.+\.(html|htm|php|jsp|aspx|cshtml))$/, template: (m) => m[1] },
  ];

  for (const p of patterns) {
    const m = path.match(p.match);
    if (m) return p.template(m);
  }

  return null;
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
