import { useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, Code2, Copy, Check, Lightbulb, AlertCircle, FileText } from 'lucide-react';
import type { Issue } from '../../types';
import { SeverityBadge } from '../common/SeverityBadge';
import { getFixSuggestion } from '../../lib/fixSuggestions';
import { CodeBlock } from './CodeBlock';

interface IssueCardProps {
  issue: Issue;
  showAffectedPages?: boolean;
}

function parseFixSuggestions(summary: string): string[] {
  if (!summary) return [];
  const fixes = summary
    .replace(/Fix (any|all) of the following:/gi, '')
    .split(/(?:\r?\n|;|\.(?=\s+[A-Z]))/)
    .map(s => s.trim())
    .filter(s => s.length > 10);
  return fixes.length > 0 ? fixes : [summary];
}

// Extract problematic attribute from fix message and HTML snippet
function extractProblem(htmlSnippet: string, ruleId: string, failureSummary: string): {
  attribute: string | null;
  currentValue: string | null;
  suggestion: string | null;
} {
  // Common attribute patterns based on rule
  const attrPatterns: Record<string, string[]> = {
    'autocomplete-valid': ['autocomplete'],
    'aria-valid-attr-value': ['aria-'],
    'aria-valid-attr': ['aria-'],
    'color-contrast': ['color', 'background'],
    'label': ['id', 'for'],
    'image-alt': ['alt'],
    'link-name': ['aria-label', 'href'],
    'button-name': ['aria-label'],
  };

  const patterns = attrPatterns[ruleId] || [];

  for (const pattern of patterns) {
    const regex = new RegExp(`(${pattern}[\\w-]*)=["']([^"']*)["']`, 'i');
    const match = htmlSnippet.match(regex);
    if (match) {
      return {
        attribute: match[1],
        currentValue: match[2],
        suggestion: getSuggestionForAttr(match[1], failureSummary),
      };
    }
  }

  return { attribute: null, currentValue: null, suggestion: null };
}

// Get suggestion based on attribute type
function getSuggestionForAttr(attr: string, _failureSummary: string): string | null {
  const suggestions: Record<string, string> = {
    'autocomplete': 'name, email, tel, address-line1, address-level2, postal-code',
    'aria-hidden': 'true or false',
    'aria-expanded': 'true or false',
    'aria-label': 'Descriptive text for the element',
    'alt': 'Description of the image content',
    'lang': 'en, en-US, es, fr, de, ja',
    'role': 'button, link, dialog, alert, tab, tabpanel',
  };

  for (const [key, value] of Object.entries(suggestions)) {
    if (attr.toLowerCase().includes(key)) {
      return value;
    }
  }
  return null;
}

// Find lines that differ between before and after
function findDiffLines(before: string, after: string): { beforeDiff: string[]; afterDiff: string[] } {
  const beforeLines = before.split('\n').map(l => l.trim()).filter(Boolean);
  const afterLines = after.split('\n').map(l => l.trim()).filter(Boolean);

  const beforeDiff = beforeLines.filter(line => !afterLines.includes(line));
  const afterDiff = afterLines.filter(line => !beforeLines.includes(line));

  return { beforeDiff, afterDiff };
}

export function IssueCard({ issue, showAffectedPages = false }: IssueCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showPages, setShowPages] = useState(false);

  const copySelector = async () => {
    if (issue.target) {
      await navigator.clipboard.writeText(issue.target);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const fixes = parseFixSuggestions(issue.failureSummary || '');

  return (
    <div
      className={`rounded-xl bg-surface border border-border border-l-4 overflow-hidden ${
        issue.impact === 'critical'
          ? 'border-l-critical'
          : issue.impact === 'serious'
          ? 'border-l-serious'
          : issue.impact === 'moderate'
          ? 'border-l-moderate'
          : 'border-l-minor'
      }`}
    >
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              {issue.helpUrl ? (
                <a
                  href={issue.helpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-heading font-semibold text-foreground hover:text-accent transition-colors underline decoration-border hover:decoration-accent"
                >
                  {issue.ruleId}
                </a>
              ) : (
                <span className="font-heading font-semibold text-foreground">
                  {issue.ruleId}
                </span>
              )}
              <SeverityBadge severity={issue.impact} />
              {showAffectedPages && issue.affectedPages && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent font-medium">
                  {issue.affectedPages} pages
                </span>
              )}
            </div>

            <p className="text-sm text-foreground mb-3">{issue.description}</p>

            <div className="flex flex-wrap items-center gap-3">
              {issue.wcagCriteria && issue.wcagCriteria.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-foreground-muted">WCAG:</span>
                  {issue.wcagCriteria.map((criterion) => (
                    <span
                      key={criterion}
                      className="text-xs px-1.5 py-0.5 rounded bg-muted text-foreground font-medium"
                    >
                      {criterion}
                    </span>
                  ))}
                </div>
              )}

              {(issue.allTargets?.length || issue.target) && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Code2 className="w-3 h-3 text-foreground-muted" />
                  {(issue.allTargets && issue.allTargets.length > 1) ? (
                    <>
                      {issue.allTargets.map((t, i) => (
                        <code key={i} className="font-code text-xs text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                          {t}
                        </code>
                      ))}
                    </>
                  ) : (
                    <div className="flex items-center gap-1.5 group">
                      <code className="font-code text-xs text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                        {issue.target}
                      </code>
                      <button
                        onClick={copySelector}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-muted rounded"
                        title="Copy selector"
                      >
                        {copied ? (
                          <Check className="w-3 h-3 text-success" />
                        ) : (
                          <Copy className="w-3 h-3 text-foreground-muted" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Affected pages shown inline */}
            {showAffectedPages && issue.affectedPageUrls && issue.affectedPageUrls.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border/50">
                <button
                  onClick={() => setShowPages(!showPages)}
                  className="flex items-center gap-2 text-xs text-foreground-muted hover:text-foreground transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span className="font-medium">
                    Affected Pages ({issue.affectedPageUrls.length})
                  </span>
                  {showPages ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                </button>
                {showPages && (
                  <div className="mt-2 space-y-0.5 max-h-48 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,0,0,0.2) transparent' }}>
                    {issue.affectedPageUrls.map((url, i) => {
                      let displayPath = url;
                      try {
                        const parsed = new URL(url);
                        displayPath = parsed.pathname + parsed.search;
                      } catch { /* use full URL */ }
                      return (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-foreground-muted hover:text-foreground hover:bg-muted/50 transition-colors group break-all"
                        >
                          <span className="flex-1">{displayPath}</span>
                          <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            {issue.helpUrl && (
              <a
                href={issue.helpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg hover:bg-muted transition-colors"
                title="Learn more on Deque University"
              >
                <ExternalLink className="w-4 h-4 text-foreground-muted" />
              </a>
            )}
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              title={expanded ? 'Hide details' : 'Show details'}
            >
              {expanded ? (
                <ChevronDown className="w-4 h-4 text-foreground-muted" />
              ) : (
                <ChevronRight className="w-4 h-4 text-foreground-muted" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (() => {
        const fixSuggestion = getFixSuggestion(issue.ruleId);
        const diffLines = fixSuggestion
          ? findDiffLines(fixSuggestion.before, fixSuggestion.after)
          : { beforeDiff: [], afterDiff: [] };

        return (
          <div className="border-t border-border">
            {/* Problem & Solution */}
            {fixSuggestion && (
              <div className="p-4 bg-muted/50">
                <div className="mb-4">
                  <span className="text-xs font-semibold text-critical uppercase tracking-wide">Problem</span>
                  <p className="text-sm text-foreground mt-1">{fixSuggestion.problem}</p>
                </div>
                <div>
                  <span className="text-xs font-semibold text-success uppercase tracking-wide">Solution</span>
                  <p className="text-sm text-foreground mt-1">{fixSuggestion.solution}</p>
                </div>
              </div>
            )}

            {/* Your Code */}
            {issue.htmlSnippet && (
              <div className="p-4 border-t border-border">
                <div className="flex items-center gap-2 mb-3">
                  <Code2 className="w-4 h-4 text-foreground-muted" />
                  <span className="text-xs font-medium text-foreground-muted uppercase tracking-wide">
                    Your Code
                  </span>
                </div>
                <CodeBlock code={issue.htmlSnippet} variant="neutral" />
              </div>
            )}

            {/* Before / After Examples */}
            {fixSuggestion && (
              <div className="border-t border-border">
                <div className="grid grid-cols-2 divide-x divide-border">
                  {/* Before */}
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-2 h-2 rounded-full bg-critical"></span>
                      <span className="text-xs font-semibold text-critical uppercase tracking-wide">
                        Before (Wrong)
                      </span>
                    </div>
                    <CodeBlock
                      code={fixSuggestion.before}
                      variant="before"
                      diffLines={diffLines.beforeDiff}
                    />
                  </div>

                  {/* After */}
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-2 h-2 rounded-full bg-success"></span>
                      <span className="text-xs font-semibold text-success uppercase tracking-wide">
                        After (Correct)
                      </span>
                    </div>
                    <CodeBlock
                      code={fixSuggestion.after}
                      variant="after"
                      diffLines={diffLines.afterDiff}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Fallback fix suggestions - Enhanced UI */}
            {!fixSuggestion && fixes.length > 0 && (() => {
              const problem = extractProblem(issue.htmlSnippet || '', issue.ruleId, issue.failureSummary || '');

              return (
                <div className="border-t border-border">
                  {/* Two column layout: Issue / Solution */}
                  <div className="grid grid-cols-2 divide-x divide-border">
                    {/* Issue Column */}
                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <AlertCircle className="w-4 h-4 text-critical" />
                        <span className="text-xs font-semibold text-critical uppercase tracking-wide">
                          Issue Found
                        </span>
                      </div>
                      {problem.attribute && problem.currentValue !== null ? (
                        <div className="space-y-3">
                          <div className="p-3 rounded-lg bg-critical/5 border border-critical/20">
                            <p className="text-xs text-foreground-muted mb-1">Problematic attribute:</p>
                            <code className="text-sm font-code text-critical">
                              {problem.attribute}="{problem.currentValue}"
                            </code>
                          </div>
                          <p className="text-sm text-foreground-muted">{fixes[0]}</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {fixes.map((fix, i) => (
                            <p key={i} className="text-sm text-foreground">{fix}</p>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Solution Column */}
                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Lightbulb className="w-4 h-4 text-success" />
                        <span className="text-xs font-semibold text-success uppercase tracking-wide">
                          How to Fix
                        </span>
                      </div>
                      <div className="space-y-3">
                        {problem.attribute && problem.suggestion && (
                          <div className="p-3 rounded-lg bg-success/5 border border-success/20">
                            <p className="text-xs text-foreground-muted mb-1">Valid values for <code className="font-code">{problem.attribute}</code>:</p>
                            <code className="text-sm font-code text-success">
                              {problem.suggestion}
                            </code>
                          </div>
                        )}
                        <ul className="space-y-2">
                          <li className="flex items-start gap-2 text-sm text-foreground">
                            <span className="w-5 h-5 rounded-full bg-success/10 text-success text-xs flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                            <span>Identify the element with the issue</span>
                          </li>
                          <li className="flex items-start gap-2 text-sm text-foreground">
                            <span className="w-5 h-5 rounded-full bg-success/10 text-success text-xs flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                            <span>{problem.attribute ? `Update the ${problem.attribute} attribute` : 'Apply the suggested fix'}</span>
                          </li>
                          <li className="flex items-start gap-2 text-sm text-foreground">
                            <span className="w-5 h-5 rounded-full bg-success/10 text-success text-xs flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                            <span>Test with a screen reader or accessibility tool</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

          </div>
        );
      })()}
    </div>
  );
}
