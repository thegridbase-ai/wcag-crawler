import { useState } from 'react';
import { ChevronDown, ChevronUp, CheckCircle, XCircle, AlertCircle, MinusCircle, ExternalLink } from 'lucide-react';
import type { PageSummary } from '../../types';

interface PagesListProps {
  pages: PageSummary[];
}

const skipReasonLabel = (reason?: string | null): string => {
  if (!reason) return 'Skipped';
  if (reason === 'auth-gated') return 'Auth required';
  if (reason === 'non-html') return 'Non-HTML';
  if (reason === 'error-signature') return 'Error page';
  if (reason.startsWith('http-')) return `HTTP ${reason.slice(5)}`;
  return reason;
};

export function PagesList({ pages }: PagesListProps) {
  const [expanded, setExpanded] = useState(false);

  if (!pages || pages.length === 0) return null;

  const cleanPages = pages.filter(p => p.status === 'complete' && p.issueCount === 0);
  const withIssues = pages.filter(p => p.status === 'complete' && p.issueCount > 0);
  const errorPages = pages.filter(p => p.status === 'error');
  const skippedPages = pages.filter(p => p.status === 'skipped');

  return (
    <div className="card mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-foreground">
            Pages Scanned
          </span>
          <div className="flex items-center gap-3 text-xs text-foreground-muted">
            <span className="flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5 text-success" />
              {cleanPages.length} clean
            </span>
            <span className="flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 text-serious" />
              {withIssues.length} with issues
            </span>
            {errorPages.length > 0 && (
              <span className="flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5 text-critical" />
                {errorPages.length} error
              </span>
            )}
            {skippedPages.length > 0 && (
              <span className="flex items-center gap-1">
                <MinusCircle className="w-3.5 h-3.5 text-foreground-muted" />
                {skippedPages.length} skipped (not auditable)
              </span>
            )}
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-foreground-muted" />
        ) : (
          <ChevronDown className="w-4 h-4 text-foreground-muted" />
        )}
      </button>

      {expanded && (
        <div className="mt-4 space-y-1 max-h-80 overflow-y-auto scrollbar-thin">
          {pages.map((page) => (
            <div
              key={page.id}
              className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors text-sm"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {page.status === 'error' ? (
                  <XCircle className="w-4 h-4 text-critical flex-shrink-0" />
                ) : page.status === 'skipped' ? (
                  <MinusCircle className="w-4 h-4 text-foreground-muted flex-shrink-0" />
                ) : page.issueCount === 0 ? (
                  <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-serious flex-shrink-0" />
                )}
                <span className="truncate text-foreground-muted" title={page.url}>
                  {new URL(page.url).pathname || '/'}
                </span>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                {page.status === 'error' ? (
                  <span className="text-xs text-critical">Error</span>
                ) : page.status === 'skipped' ? (
                  <span className="text-xs text-foreground-muted">{skipReasonLabel(page.skipReason)}</span>
                ) : page.issueCount > 0 ? (
                  <span className="text-xs text-serious">{page.issueCount} issues</span>
                ) : (
                  <span className="text-xs text-success">Clean</span>
                )}
                <a
                  href={page.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground-muted/40 hover:text-foreground-muted transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
