#!/usr/bin/env node

// WCAG Accessibility Scanner - GitHub Action Runner
// Standalone script with zero external dependencies (uses Node.js built-in fetch)
// Calls the WCAG Crawler API, polls for completion, and outputs GitHub Actions summary

const API_URL = (process.env.INPUT_API_URL || 'https://wcag-crawler-server.onrender.com').replace(/\/$/, '');
const TARGET_URL = process.env.INPUT_URL;
const MAX_PAGES = parseInt(process.env.INPUT_MAX_PAGES || '50', 10);
const MAX_DEPTH = parseInt(process.env.INPUT_MAX_DEPTH || '3', 10);
const THRESHOLD = parseInt(process.env.INPUT_THRESHOLD || '0', 10);
const FAIL_ON_CRITICAL = (process.env.INPUT_FAIL_ON_CRITICAL || 'false').toLowerCase() === 'true';

// Polling configuration
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_DURATION_MS = 30 * 60 * 1000; // 30 minutes max

// GitHub Actions helpers
const isGitHubActions = !!process.env.GITHUB_ACTIONS;

function setOutput(name, value) {
  if (isGitHubActions && process.env.GITHUB_OUTPUT) {
    const fs = require('fs');
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
}

function log(message) {
  const timestamp = new Date().toISOString().slice(11, 19);
  console.log(`[${timestamp}] ${message}`);
}

function logGroup(title) {
  if (isGitHubActions) {
    console.log(`::group::${title}`);
  } else {
    console.log(`\n--- ${title} ---`);
  }
}

function logGroupEnd() {
  if (isGitHubActions) {
    console.log('::endgroup::');
  }
}

function annotation(level, message, properties = {}) {
  if (isGitHubActions) {
    const props = Object.entries(properties)
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    const propStr = props ? ` ${props}` : '';
    console.log(`::${level}${propStr}::${message}`);
  } else {
    const prefix = level === 'error' ? 'ERROR' : level === 'warning' ? 'WARN' : 'INFO';
    console.log(`[${prefix}] ${message}`);
  }
}

async function writeSummary(content) {
  if (isGitHubActions && process.env.GITHUB_STEP_SUMMARY) {
    const fs = require('fs');
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, content + '\n');
  }
}

// API request helper with retries
async function apiRequest(path, options = {}) {
  const url = `${API_URL}${path}`;
  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'wcag-crawler-github-action/1.0',
          ...options.headers,
        },
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`HTTP ${response.status}: ${body}`);
      }

      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = attempt * 2000;
        log(`Request failed (attempt ${attempt}/${maxRetries}), retrying in ${delay / 1000}s...`);
        await sleep(delay);
      }
    }
  }

  throw new Error(`API request failed after ${maxRetries} attempts: ${lastError.message}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Status display helpers
function statusEmoji(status) {
  const map = {
    pending: '...',
    crawling: '[Crawling]',
    scanning: '[Scanning]',
    analyzing: '[Analyzing]',
    complete: '[Complete]',
    failed: '[Failed]',
  };
  return map[status] || status;
}

function scoreGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

function scoreColor(score) {
  if (score >= 90) return 'brightgreen';
  if (score >= 80) return 'green';
  if (score >= 70) return 'yellowgreen';
  if (score >= 50) return 'orange';
  return 'red';
}

// Main execution
async function main() {
  console.log('');
  console.log('===========================================');
  console.log('  WCAG Accessibility Scanner');
  console.log('  Powered by axe-core + smart dedup');
  console.log('===========================================');
  console.log('');

  // Validate inputs
  if (!TARGET_URL) {
    annotation('error', 'Missing required input: url');
    console.error('The "url" input is required. Please provide the URL to scan.');
    process.exit(1);
  }

  try {
    new URL(TARGET_URL);
  } catch {
    annotation('error', `Invalid URL: ${TARGET_URL}`);
    console.error(`"${TARGET_URL}" is not a valid URL. Please provide a full URL including the protocol (e.g., https://example.com).`);
    process.exit(1);
  }

  log(`Target URL: ${TARGET_URL}`);
  log(`Max pages: ${MAX_PAGES}`);
  log(`Max depth: ${MAX_DEPTH}`);
  log(`Threshold: ${THRESHOLD}`);
  log(`Fail on critical: ${FAIL_ON_CRITICAL}`);
  log(`API endpoint: ${API_URL}`);
  console.log('');

  // Step 1: Start the scan
  logGroup('Starting scan');
  log('Sending scan request to WCAG Crawler API...');

  let scanResponse;
  try {
    scanResponse = await apiRequest('/api/scans', {
      method: 'POST',
      body: JSON.stringify({
        url: TARGET_URL,
        config: {
          maxPages: MAX_PAGES,
          maxDepth: MAX_DEPTH,
          concurrency: 3,
          delay: 500,
          respectRobotsTxt: true,
          viewport: { width: 1280, height: 720 },
        },
      }),
    });
  } catch (error) {
    annotation('error', `Failed to start scan: ${error.message}`);
    console.error('Could not connect to the WCAG Crawler API. Is the server running?');
    console.error(`API URL: ${API_URL}`);
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }

  const scanId = scanResponse.id;
  log(`Scan started: ${scanId}`);
  setOutput('scan-id', scanId);
  logGroupEnd();

  // Step 2: Poll for completion
  logGroup('Waiting for scan to complete');
  const startTime = Date.now();
  let lastStatus = '';
  let scanData;

  while (true) {
    const elapsed = Date.now() - startTime;
    if (elapsed > MAX_POLL_DURATION_MS) {
      annotation('error', `Scan timed out after ${MAX_POLL_DURATION_MS / 60000} minutes`);
      process.exit(1);
    }

    try {
      scanData = await apiRequest(`/api/scans/${scanId}`);
    } catch (error) {
      log(`Poll error: ${error.message} (will retry)`);
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    if (scanData.status !== lastStatus) {
      const elapsedStr = Math.round(elapsed / 1000);
      const pageInfo = scanData.total_pages ? ` | ${scanData.scanned_pages || 0}/${scanData.total_pages} pages` : '';
      log(`${statusEmoji(scanData.status)} Status: ${scanData.status}${pageInfo} (${elapsedStr}s)`);
      lastStatus = scanData.status;
    }

    if (scanData.status === 'complete') {
      break;
    }

    if (scanData.status === 'failed') {
      annotation('error', 'Scan failed on the server. Check the WCAG Crawler dashboard for details.');
      process.exit(1);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  const totalTime = Math.round((Date.now() - startTime) / 1000);
  log(`Scan completed in ${totalTime}s`);
  logGroupEnd();

  // Step 3: Fetch the full report
  logGroup('Fetching report');
  let report;
  try {
    report = await apiRequest(`/api/reports/${scanId}`);
  } catch (error) {
    annotation('error', `Failed to fetch report: ${error.message}`);
    process.exit(1);
  }

  const { summary, sharedComponents, pageSpecificIssues } = report;
  const score = summary.score;

  log(`Score: ${score}/100 (Grade: ${scoreGrade(score)})`);
  log(`Pages scanned: ${summary.totalPages}`);
  log(`Unique issues: ${summary.totalIssuesDeduplicated} (${summary.totalIssuesRaw} raw)`);
  log(`Critical: ${summary.bySeverity.critical} | Serious: ${summary.bySeverity.serious} | Moderate: ${summary.bySeverity.moderate} | Minor: ${summary.bySeverity.minor}`);
  logGroupEnd();

  // Set outputs
  setOutput('score', score);
  setOutput('total-issues', summary.totalIssuesDeduplicated);
  setOutput('critical-count', summary.bySeverity.critical);
  setOutput('serious-count', summary.bySeverity.serious);
  setOutput('moderate-count', summary.bySeverity.moderate);
  setOutput('minor-count', summary.bySeverity.minor);
  setOutput('report-url', `${API_URL}/api/reports/${scanId}/export`);

  // Step 4: Generate annotations for critical/serious issues
  logGroup('Processing issues');

  // Annotate shared component issues (critical + serious only)
  for (const component of sharedComponents) {
    for (const issue of component.issues) {
      if (issue.impact === 'critical') {
        annotation('error', `[${issue.ruleId}] ${issue.description} (${component.label}, affects ${issue.affectedPages} pages)`, {
          title: `Critical A11y: ${issue.ruleId}`,
        });
      } else if (issue.impact === 'serious') {
        annotation('warning', `[${issue.ruleId}] ${issue.description} (${component.label}, affects ${issue.affectedPages} pages)`, {
          title: `Serious A11y: ${issue.ruleId}`,
        });
      }
    }
  }

  // Annotate page-specific issues (critical + serious only, limit to top 10 pages)
  const topPages = pageSpecificIssues.slice(0, 10);
  for (const page of topPages) {
    for (const issue of page.issues) {
      if (issue.impact === 'critical') {
        annotation('error', `[${issue.ruleId}] ${issue.description} on ${page.url}`, {
          title: `Critical A11y: ${issue.ruleId}`,
        });
      } else if (issue.impact === 'serious') {
        annotation('warning', `[${issue.ruleId}] ${issue.description} on ${page.url}`, {
          title: `Serious A11y: ${issue.ruleId}`,
        });
      }
    }
  }

  log(`Annotations created for critical and serious issues`);
  logGroupEnd();

  // Step 5: Write GitHub Step Summary
  const reportUrl = `${API_URL}/api/reports/${scanId}/export`;

  const severityBar = buildSeverityBar(summary.bySeverity, summary.totalIssuesRaw);
  const topRulesTable = buildTopRulesTable(summary.topRules);
  const sharedComponentsList = buildSharedComponentsList(sharedComponents);
  const pageList = buildPageList(pageSpecificIssues);

  const passedThreshold = score >= THRESHOLD;
  const passedCritical = !FAIL_ON_CRITICAL || summary.bySeverity.critical === 0;
  const passed = passedThreshold && passedCritical;

  const statusBadge = passed
    ? `![Pass](https://img.shields.io/badge/a11y-PASS-brightgreen)`
    : `![Fail](https://img.shields.io/badge/a11y-FAIL-red)`;

  const scoreBadge = `![Score](https://img.shields.io/badge/score-${score}%2F100-${scoreColor(score)})`;

  const summaryMarkdown = `## WCAG Accessibility Report

${statusBadge} ${scoreBadge}

| Metric | Value |
|--------|-------|
| URL | \`${TARGET_URL}\` |
| Score | **${score}/100** (Grade: ${scoreGrade(score)}) |
| Pages Scanned | ${summary.totalPages} |
| Total Issues (deduplicated) | ${summary.totalIssuesDeduplicated} |
| Total Issues (raw) | ${summary.totalIssuesRaw} |
| Scan Duration | ${totalTime}s |

### Issues by Severity

| Severity | Count | Unique Rules |
|----------|------:|--------------|
| Critical | ${summary.bySeverity.critical} | ${summary.ruleCountBySeverity.critical} |
| Serious | ${summary.bySeverity.serious} | ${summary.ruleCountBySeverity.serious} |
| Moderate | ${summary.bySeverity.moderate} | ${summary.ruleCountBySeverity.moderate} |
| Minor | ${summary.bySeverity.minor} | ${summary.ruleCountBySeverity.minor} |

${severityBar}

### Top Issues

${topRulesTable}

${sharedComponentsList}

${pageList}

---

${passed ? 'Scan **passed** all checks.' : buildFailureReason(passedThreshold, passedCritical, score, THRESHOLD, summary.bySeverity.critical)}

[Download Full HTML Report](${reportUrl})

---
<sub>Generated by <a href="https://github.com/cankilic-gh/wcag-crawler">WCAG Accessibility Scanner</a> (axe-core + smart deduplication)</sub>
`;

  await writeSummary(summaryMarkdown);

  // Step 6: Determine exit code
  if (!passed) {
    console.log('');
    if (!passedThreshold) {
      annotation('error', `Accessibility score ${score} is below the threshold of ${THRESHOLD}`, {
        title: 'A11y Threshold Not Met',
      });
    }
    if (!passedCritical) {
      annotation('error', `Found ${summary.bySeverity.critical} critical accessibility issue(s) and fail-on-critical is enabled`, {
        title: 'Critical A11y Issues Found',
      });
    }
    console.log('');
    console.log('===========================================');
    console.log('  SCAN FAILED');
    console.log('===========================================');
    process.exit(1);
  }

  console.log('');
  console.log('===========================================');
  console.log(`  SCAN PASSED (Score: ${score}/100)`);
  console.log('===========================================');
  process.exit(0);
}

// Markdown builders

function buildSeverityBar(bySeverity, total) {
  if (total === 0) return '';

  const segments = [
    { label: 'Critical', count: bySeverity.critical, color: '🔴' },
    { label: 'Serious', count: bySeverity.serious, color: '🟠' },
    { label: 'Moderate', count: bySeverity.moderate, color: '🟡' },
    { label: 'Minor', count: bySeverity.minor, color: '🔵' },
  ];

  const bar = segments
    .filter(s => s.count > 0)
    .map(s => {
      const pct = Math.round((s.count / total) * 100);
      return `${s.color} ${s.label}: ${s.count} (${pct}%)`;
    })
    .join(' | ');

  return `> ${bar}`;
}

function buildTopRulesTable(topRules) {
  if (!topRules || topRules.length === 0) return '_No issues found._';

  const severityIcon = (impact) => {
    const map = { critical: '🔴', serious: '🟠', moderate: '🟡', minor: '🔵' };
    return map[impact] || '';
  };

  let table = '| Rule | Severity | Occurrences |\n';
  table += '|------|----------|------------:|\n';

  for (const rule of topRules.slice(0, 10)) {
    table += `| \`${rule.ruleId}\` | ${severityIcon(rule.impact)} ${rule.impact} | ${rule.count} |\n`;
  }

  return table;
}

function buildSharedComponentsList(sharedComponents) {
  if (!sharedComponents || sharedComponents.length === 0) return '';

  let md = '### Shared Component Issues\n\n';
  md += 'These issues appear in shared components (header, nav, footer) across multiple pages:\n\n';

  for (const comp of sharedComponents.slice(0, 5)) {
    md += `<details>\n<summary><strong>${escapeMarkdown(comp.label)}</strong> (${comp.issues.length} issues, ${comp.pageCount} pages)</summary>\n\n`;

    for (const issue of comp.issues.slice(0, 10)) {
      const icon = issue.impact === 'critical' ? '🔴' : issue.impact === 'serious' ? '🟠' : issue.impact === 'moderate' ? '🟡' : '🔵';
      md += `- ${icon} **\`${issue.ruleId}\`** - ${escapeMarkdown(issue.description)} (${issue.affectedPages} pages)\n`;
      if (issue.wcagCriteria && issue.wcagCriteria.length > 0) {
        md += `  - WCAG: ${issue.wcagCriteria.join(', ')}\n`;
      }
    }

    if (comp.issues.length > 10) {
      md += `- _...and ${comp.issues.length - 10} more issues_\n`;
    }

    md += '\n</details>\n\n';
  }

  if (sharedComponents.length > 5) {
    md += `_...and ${sharedComponents.length - 5} more shared components_\n\n`;
  }

  return md;
}

function buildPageList(pageSpecificIssues) {
  if (!pageSpecificIssues || pageSpecificIssues.length === 0) return '';

  let md = '### Page-Specific Issues\n\n';

  const topPages = pageSpecificIssues.slice(0, 10);

  md += '| Page | Issues | Top Issue |\n';
  md += '|------|-------:|----------|\n';

  for (const page of topPages) {
    const topIssue = page.issues[0];
    const topIssueStr = topIssue ? `\`${topIssue.ruleId}\` (${topIssue.impact})` : '-';
    const shortUrl = page.url.length > 60 ? page.url.substring(0, 57) + '...' : page.url;
    md += `| ${escapeMarkdown(shortUrl)} | ${page.issueCount} | ${topIssueStr} |\n`;
  }

  if (pageSpecificIssues.length > 10) {
    md += `\n_...and ${pageSpecificIssues.length - 10} more pages with issues_\n`;
  }

  return md;
}

function buildFailureReason(passedThreshold, passedCritical, score, threshold, criticalCount) {
  const reasons = [];
  if (!passedThreshold) {
    reasons.push(`Score **${score}** is below the required threshold of **${threshold}**.`);
  }
  if (!passedCritical) {
    reasons.push(`Found **${criticalCount}** critical issue(s) with \`fail-on-critical\` enabled.`);
  }
  return `Scan **failed**:\n${reasons.map(r => `- ${r}`).join('\n')}`;
}

function escapeMarkdown(text) {
  if (!text) return '';
  return text.replace(/[|]/g, '\\|').replace(/\n/g, ' ');
}

// CLI help
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
WCAG Accessibility Scanner - GitHub Action

Usage:
  Set environment variables and run:
    INPUT_URL=https://example.com node action/index.js

Environment Variables:
  INPUT_URL           (required) The URL to scan
  INPUT_MAX_PAGES     Max pages to crawl (default: 50)
  INPUT_MAX_DEPTH     Max crawl depth (default: 3)
  INPUT_THRESHOLD     Minimum score to pass, 0-100 (default: 0)
  INPUT_FAIL_ON_CRITICAL  Fail if critical issues found (default: false)
  INPUT_API_URL       WCAG Crawler API URL (default: https://wcag-crawler-server.onrender.com)

  GITHUB_ACTIONS      Set automatically in GitHub Actions
  GITHUB_STEP_SUMMARY Path to step summary file (set by GitHub)
  GITHUB_OUTPUT       Path to output file (set by GitHub)

Exit Codes:
  0  Scan passed all checks
  1  Scan failed (threshold not met, critical issues found, or error)

Learn more: https://github.com/cankilic-gh/wcag-crawler
`);
  process.exit(0);
}

// Run
main().catch(error => {
  annotation('error', `Unexpected error: ${error.message}`);
  console.error(error.stack || error);
  process.exit(1);
});
