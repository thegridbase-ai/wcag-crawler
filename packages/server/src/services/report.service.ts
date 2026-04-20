import { ScanModel, Scan } from '../models/scan.model.js';
import { PageModel } from '../models/page.model.js';
import { IssueModel, Issue } from '../models/issue.model.js';
import { deduplicationService, SharedComponent } from './deduplication.service.js';
import { logger } from '../utils/logger.js';

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

export interface SharedComponentReport {
  id: string;
  label: string;
  region: string;
  pageCount: number;
  pageUrls: string[];
  issues: Array<{
    ruleId: string;
    impact: string;
    description: string;
    target: string;
    htmlSnippet: string;
    helpUrl: string;
    wcagCriteria: string[];
    affectedPages: number;
    affectedPageUrls: string[];
  }>;
}

export interface PageIssueReport {
  url: string;
  title: string | null;
  sourceUrl: string | null;
  issueCount: number;
  issues: Array<{
    ruleId: string;
    impact: string;
    description: string;
    target: string;
    htmlSnippet: string;
    helpUrl: string;
    wcagCriteria: string[];
    failureSummary: string | null;
  }>;
}

export interface FullReport {
  scan: Scan;
  summary: ReportSummary;
  sharedComponents: SharedComponentReport[];
  pageSpecificIssues: PageIssueReport[];
}

export class ReportService {
  generateReport(scanId: string): FullReport | null {
    const scan = ScanModel.findById(scanId);
    if (!scan) {
      logger.error('Scan not found', { scanId });
      return null;
    }

    const pages = PageModel.findByScanId(scanId);
    const issues = IssueModel.findByScanId(scanId);
    const sharedComponents = deduplicationService.getSharedComponents(scanId);

    const summary = this.calculateSummary(scan, issues, sharedComponents);
    const sharedComponentReports = this.buildSharedComponentReports(sharedComponents, issues);
    const pageSpecificIssues = this.buildPageSpecificReports(pages, issues);

    return {
      scan,
      summary,
      sharedComponents: sharedComponentReports,
      pageSpecificIssues,
    };
  }

  private calculateSummary(scan: Scan, issues: Issue[], sharedComponents: SharedComponent[]): ReportSummary {
    const counts = IssueModel.countByScanId(scan.id);

    // Count unique issues (deduplicated)
    const sharedIssueIds = new Set<string>();
    const seenSharedIssues = new Map<string, string>(); // key -> first issue id

    for (const issue of issues) {
      if (issue.is_shared_component && issue.shared_component_group) {
        const key = `${issue.shared_component_group}:${issue.axe_rule_id}:${issue.target_selector || ''}`;
        if (!seenSharedIssues.has(key)) {
          seenSharedIssues.set(key, issue.id);
        }
        sharedIssueIds.add(issue.id);
      }
    }

    const uniqueSharedIssues = seenSharedIssues.size;
    const pageSpecificIssues = issues.filter(i => !i.is_shared_component).length;
    const totalIssuesDeduplicated = uniqueSharedIssues + pageSpecificIssues;

    // Calculate score (0-100)
    // Formula: 100 - (weighted issues / pages) * penalty
    const totalPages = scan.total_pages || 1;
    const weightedIssues =
      counts.critical * 25 +
      counts.serious * 10 +
      counts.moderate * 3 +
      counts.minor * 1;
    const issuesPerPage = weightedIssues / totalPages;
    const score = Math.max(0, Math.min(100, Math.round(100 - issuesPerPage * 2)));

    // Top rules and count unique rules per severity
    const ruleCounts = new Map<string, { count: number; impact: string }>();
    const rulesBySeverity = {
      critical: new Set<string>(),
      serious: new Set<string>(),
      moderate: new Set<string>(),
      minor: new Set<string>(),
    };

    for (const issue of issues) {
      const existing = ruleCounts.get(issue.axe_rule_id);
      if (existing) {
        existing.count++;
      } else {
        ruleCounts.set(issue.axe_rule_id, { count: 1, impact: issue.impact });
      }
      // Track unique rules per severity
      rulesBySeverity[issue.impact].add(issue.axe_rule_id);
    }

    const topRules = Array.from(ruleCounts.entries())
      .map(([ruleId, data]) => ({ ruleId, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      score,
      totalPages: scan.total_pages || 0,
      totalIssuesRaw: counts.total,
      totalIssuesDeduplicated,
      bySeverity: {
        critical: counts.critical,
        serious: counts.serious,
        moderate: counts.moderate,
        minor: counts.minor,
      },
      ruleCountBySeverity: {
        critical: rulesBySeverity.critical.size,
        serious: rulesBySeverity.serious.size,
        moderate: rulesBySeverity.moderate.size,
        minor: rulesBySeverity.minor.size,
      },
      topRules,
    };
  }

  private buildSharedComponentReports(sharedComponents: SharedComponent[], issues: Issue[]): SharedComponentReport[] {
    const reports: SharedComponentReport[] = [];

    for (const component of sharedComponents) {
      const componentIssues = issues.filter(
        i => i.is_shared_component && i.shared_component_group === component.id
      );

      // Deduplicate issues by rule + selector, collect page URLs
      const uniqueIssues = new Map<string, Issue & { affectedPages: number; pageUrls: Set<string> }>();
      for (const issue of componentIssues) {
        const key = `${issue.axe_rule_id}:${issue.target_selector || ''}`;
        if (!uniqueIssues.has(key)) {
          uniqueIssues.set(key, { ...issue, affectedPages: 1, pageUrls: new Set() });
        } else {
          uniqueIssues.get(key)!.affectedPages++;
        }
        // Get page URL for this issue
        const page = PageModel.findById(issue.page_id);
        if (page) {
          uniqueIssues.get(key)!.pageUrls.add(page.url);
        }
      }

      reports.push({
        id: component.id,
        label: component.label,
        region: component.region,
        pageCount: component.page_count,
        pageUrls: component.page_urls || [],
        issues: Array.from(uniqueIssues.values()).map(issue => ({
          ruleId: issue.axe_rule_id,
          impact: issue.impact,
          description: issue.description,
          target: issue.target_selector || '',
          htmlSnippet: issue.html_snippet || '',
          helpUrl: issue.help_url || '',
          wcagCriteria: this.extractWcagCriteria(issue.wcag_tags),
          affectedPages: issue.affectedPages,
          affectedPageUrls: Array.from(issue.pageUrls),
        })),
      });
    }

    return reports;
  }

  private buildPageSpecificReports(pages: Array<{ id: string; url: string; title: string | null; source_url?: string | null }>, issues: Issue[]): PageIssueReport[] {
    const reports: PageIssueReport[] = [];

    // Group page-specific issues by page
    const pageIssuesMap = new Map<string, Issue[]>();
    for (const issue of issues) {
      if (!issue.is_shared_component) {
        if (!pageIssuesMap.has(issue.page_id)) {
          pageIssuesMap.set(issue.page_id, []);
        }
        pageIssuesMap.get(issue.page_id)!.push(issue);
      }
    }

    for (const page of pages) {
      const pageIssues = pageIssuesMap.get(page.id) || [];
      if (pageIssues.length === 0) continue;

      reports.push({
        url: page.url,
        title: page.title,
        sourceUrl: page.source_url || null,
        issueCount: pageIssues.length,
        issues: pageIssues.map(issue => ({
          ruleId: issue.axe_rule_id,
          impact: issue.impact,
          description: issue.description,
          target: issue.target_selector || '',
          htmlSnippet: issue.html_snippet || '',
          helpUrl: issue.help_url || '',
          wcagCriteria: this.extractWcagCriteria(issue.wcag_tags),
          failureSummary: issue.failure_summary,
        })),
      });
    }

    // Sort by issue count descending
    reports.sort((a, b) => b.issueCount - a.issueCount);

    return reports;
  }

  private extractWcagCriteria(tags: string[]): string[] {
    const criteria: string[] = [];
    for (const tag of tags) {
      // Extract criteria like "wcag143" -> "1.4.3"
      const match = tag.match(/wcag(\d)(\d)(\d)/);
      if (match) {
        criteria.push(`${match[1]}.${match[2]}.${match[3]}`);
      }
    }
    return [...new Set(criteria)];
  }

  calculateAndUpdateScore(scanId: string): void {
    const issues = IssueModel.findByScanId(scanId);
    const scan = ScanModel.findById(scanId);
    if (!scan) return;

    const counts = IssueModel.countByScanId(scanId);
    const totalPages = scan.total_pages || 1;
    const weightedIssues =
      counts.critical * 25 +
      counts.serious * 10 +
      counts.moderate * 3 +
      counts.minor * 1;
    const issuesPerPage = weightedIssues / totalPages;
    const score = Math.max(0, Math.min(100, Math.round(100 - issuesPerPage * 2)));

    ScanModel.updateCounts(scanId, {
      total_issues: counts.total,
      critical_count: counts.critical,
      serious_count: counts.serious,
      moderate_count: counts.moderate,
      minor_count: counts.minor,
      score,
    });
  }
}

export const reportService = new ReportService();
