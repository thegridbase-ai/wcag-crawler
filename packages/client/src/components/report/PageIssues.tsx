import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, FileText, ExternalLink, Layers, ArrowUpRight } from 'lucide-react';
import type { PageIssue, Issue } from '../../types';
import { IssueCard } from './IssueCard';

interface PageIssuesProps {
  pages: PageIssue[];
}

interface GroupedPage {
  basePath: string;
  title: string;
  pages: PageIssue[];
  issues: Issue[];
  uniqueIssueCount: number;
  sourceUrl?: string | null;
}

function getBasePath(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function deduplicateIssues(issues: Issue[]): Issue[] {
  const seen = new Map<string, Issue & { allTargets: string[] }>();
  for (const issue of issues) {
    const key = issue.ruleId;
    if (seen.has(key)) {
      const existing = seen.get(key)!;
      if (issue.target && !existing.allTargets.includes(issue.target)) {
        existing.allTargets.push(issue.target);
      }
    } else {
      seen.set(key, {
        ...issue,
        allTargets: issue.target ? [issue.target] : []
      });
    }
  }
  return Array.from(seen.values());
}

export function PageIssues({ pages }: PageIssuesProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [groupByPath, setGroupByPath] = useState(true);

  const groupedPages = useMemo(() => {
    if (!groupByPath) {
      return pages.map(page => ({
        basePath: page.url,
        title: page.title || page.url,
        pages: [page],
        issues: page.issues,
        uniqueIssueCount: page.issues.length,
        sourceUrl: page.sourceUrl,
      }));
    }

    const groups = new Map<string, GroupedPage>();

    for (const page of pages) {
      const basePath = getBasePath(page.url);

      if (groups.has(basePath)) {
        const group = groups.get(basePath)!;
        group.pages.push(page);
        group.issues.push(...page.issues);
      } else {
        groups.set(basePath, {
          basePath,
          title: page.title || basePath,
          pages: [page],
          issues: [...page.issues],
          uniqueIssueCount: 0,
          sourceUrl: page.sourceUrl,
        });
      }
    }

    for (const group of groups.values()) {
      group.issues = deduplicateIssues(group.issues);
      group.uniqueIssueCount = group.issues.length;
    }

    return Array.from(groups.values());
  }, [pages, groupByPath]);

  const toggleExpand = (key: string) => {
    const newExpanded = new Set(expanded);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpanded(newExpanded);
  };

  if (pages.length === 0) {
    return (
      <div className="card text-center py-12">
        <p className="text-foreground-muted">No issues found with current filters.</p>
        <p className="text-sm text-foreground-muted/60 mt-1">
          Try expanding the severity filters to see more issues.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Group toggle */}
      <div className="flex items-center justify-end mb-4">
        <button
          onClick={() => setGroupByPath(!groupByPath)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
            groupByPath
              ? 'bg-primary text-white'
              : 'bg-surface border border-border text-foreground-muted hover:text-foreground'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          Group similar pages
        </button>
      </div>

      <div className="space-y-3">
        {groupedPages.map((group) => (
          <div key={group.basePath} className="card">
            <button
              onClick={() => toggleExpand(group.basePath)}
              className="w-full flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                {expanded.has(group.basePath) ? (
                  <ChevronDown className="w-5 h-5 text-foreground-muted" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-foreground-muted" />
                )}
                <FileText className="w-5 h-5 text-foreground-muted" />
                <div className="text-left min-w-0 flex-1">
                  <div className="flex items-start gap-2 flex-wrap">
                    <h3 className="font-medium text-foreground break-all">
                      {group.title}
                    </h3>
                    {group.pages.length > 1 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent font-medium whitespace-nowrap flex-shrink-0">
                        {group.pages.length} pages
                      </span>
                    )}
                  </div>
                  {isValidUrl(group.pages[0].url) && (
                    <a
                      href={group.pages[0].url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-foreground-muted hover:text-accent flex items-center gap-1 group break-all"
                    >
                      <span>{group.basePath}</span>
                      <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                    </a>
                  )}
                  {group.sourceUrl && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <ArrowUpRight className="w-3 h-3 text-foreground-muted/50 flex-shrink-0" />
                      <span className="text-[11px] text-foreground-muted/60 break-all">
                        Found on: {group.sourceUrl}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <span className={`text-sm font-medium px-3 py-1 rounded-full ${
                group.uniqueIssueCount > 0
                  ? 'bg-critical/10 text-critical'
                  : 'bg-muted text-foreground-muted'
              }`}>
                {group.uniqueIssueCount} {group.uniqueIssueCount === 1 ? 'issue' : 'issues'}
              </span>
            </button>

            {expanded.has(group.basePath) && (
              <div className="mt-4 pt-4 border-t border-border space-y-3">
                {group.issues.map((issue, index) => (
                  <IssueCard key={`${issue.ruleId}-${issue.target}-${index}`} issue={issue} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
