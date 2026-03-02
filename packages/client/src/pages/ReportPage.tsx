import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Loader2, RefreshCw, Filter, ChevronDown, FileText, FileDown } from 'lucide-react';
import { reportApi, scanApi } from '../lib/api';
import { ScoreSummary } from '../components/report/ScoreSummary';
import { PageIssues } from '../components/report/PageIssues';
import type { FullReport, Issue } from '../types';

type SeverityFilter = 'critical' | 'serious' | 'moderate' | 'minor';

const SEVERITY_CONFIG: Record<SeverityFilter, { label: string; color: string; activeBg: string }> = {
  critical: { label: 'Critical', color: 'text-critical', activeBg: 'bg-critical text-white' },
  serious: { label: 'Serious', color: 'text-serious', activeBg: 'bg-serious text-white' },
  moderate: { label: 'Moderate', color: 'text-foreground-muted', activeBg: 'bg-moderate text-white' },
  minor: { label: 'Minor', color: 'text-foreground-muted', activeBg: 'bg-minor text-white' },
};

export function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<FullReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rescanning, setRescanning] = useState(false);
  const [severityFilters, setSeverityFilters] = useState<Set<SeverityFilter>>(
    new Set(['critical', 'serious'])
  );
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleSeverity = (severity: SeverityFilter) => {
    const newFilters = new Set(severityFilters);
    if (newFilters.has(severity)) {
      newFilters.delete(severity);
    } else {
      newFilters.add(severity);
    }
    setSeverityFilters(newFilters);
  };

  const selectAllSeverities = () => {
    setSeverityFilters(new Set(['critical', 'serious', 'moderate', 'minor']));
  };

  const selectRequiredOnly = () => {
    setSeverityFilters(new Set(['critical', 'serious']));
  };

  const handleRescan = async () => {
    if (!report) return;

    setRescanning(true);
    try {
      const result = await scanApi.create(report.scan.root_url, report.scan.config);
      navigate(`/scans/${result.id}/progress`);
    } catch (err) {
      console.error('Failed to start rescan:', err);
      setRescanning(false);
    }
  };

  useEffect(() => {
    if (!id) return;

    reportApi
      .get(id)
      .then(setReport)
      .catch((err) => {
        setError(err.response?.data?.error || 'Failed to load report');
      })
      .finally(() => setLoading(false));
  }, [id]);

  // Filter and combine all issues
  const filteredPages = useMemo(() => {
    if (!report) return [];

    const filterIssues = (issues: Issue[]) =>
      issues.filter((issue) => severityFilters.has(issue.impact as SeverityFilter));

    // Combine shared components and page-specific issues
    const allPages = [
      ...report.sharedComponents.map((comp) => ({
        url: comp.id,
        title: `Shared: ${comp.label}`,
        issues: filterIssues(comp.issues),
        issueCount: filterIssues(comp.issues).length,
        isShared: true,
      })),
      ...report.pageSpecificIssues.map((page) => ({
        ...page,
        issues: filterIssues(page.issues),
        issueCount: filterIssues(page.issues).length,
        isShared: false,
      })),
    ].filter((page) => page.issues.length > 0);

    return allPages;
  }, [report, severityFilters]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-foreground-muted animate-spin" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="text-center py-16">
        <p className="text-critical mb-4">{error || 'Report not found'}</p>
        <Link to="/" className="btn btn-secondary">
          Go Home
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="flex items-center gap-2 text-foreground-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back</span>
          </Link>
          <div>
            <h1 className="text-2xl font-heading font-bold text-foreground">
              Accessibility Report
            </h1>
            <p className="text-sm text-foreground-muted">{report.scan.root_url}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRescan}
            disabled={rescanning}
            className="btn btn-primary"
          >
            {rescanning ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Rescan
          </button>
          <div className="relative" ref={exportRef}>
            <button
              onClick={() => setExportOpen(!exportOpen)}
              className="btn btn-secondary"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
              <ChevronDown className={`w-4 h-4 ml-1 transition-transform ${exportOpen ? 'rotate-180' : ''}`} />
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-surface border border-border rounded-xl shadow-lg overflow-hidden z-50">
                <a
                  href={reportApi.exportUrl(report.scan.id, 'html')}
                  download
                  className="flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors"
                  onClick={() => setExportOpen(false)}
                >
                  <FileText className="w-4 h-4 text-foreground-muted" />
                  Export as HTML
                </a>
                <a
                  href={reportApi.exportUrl(report.scan.id, 'pdf')}
                  download
                  className="flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors border-t border-border"
                  onClick={() => setExportOpen(false)}
                >
                  <FileDown className="w-4 h-4 text-foreground-muted" />
                  Export as PDF
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="mb-8">
        <ScoreSummary summary={report.summary} />
      </div>

      {/* Filter Row */}
      <div className="flex items-center justify-between mb-6 p-4 bg-surface rounded-2xl border border-border">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-foreground-muted">
            <Filter className="w-4 h-4" />
            <span>Filter:</span>
          </div>
          <div className="flex items-center gap-2">
            {(Object.entries(SEVERITY_CONFIG) as [SeverityFilter, typeof SEVERITY_CONFIG[SeverityFilter]][]).map(
              ([severity, config]) => (
                <button
                  key={severity}
                  onClick={() => toggleSeverity(severity)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    severityFilters.has(severity)
                      ? config.activeBg
                      : 'bg-muted text-foreground-muted hover:bg-border'
                  }`}
                >
                  {config.label}
                  {report && (
                    <span className="ml-1 opacity-80">
                      ({report.summary.bySeverity[severity]})
                    </span>
                  )}
                </button>
              )
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={selectRequiredOnly}
            className="px-3 py-1.5 rounded-full text-foreground-muted hover:text-foreground hover:bg-muted transition-colors"
          >
            Required Only
          </button>
          <span className="text-border">|</span>
          <button
            onClick={selectAllSeverities}
            className="px-3 py-1.5 rounded-full text-foreground-muted hover:text-foreground hover:bg-muted transition-colors"
          >
            Show All
          </button>
        </div>
      </div>

      {/* Issues List */}
      <PageIssues pages={filteredPages} />
    </div>
  );
}
