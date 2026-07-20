import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Loader2, Clock, Lock, Unlock, AlertTriangle } from 'lucide-react';
import { useScanStore } from '../../stores/scanStore';
import { useSocket } from '../../hooks/useSocket';
import { ProgressBar } from '../common/ProgressBar';
import type { CrawlPageFoundEvent, ScanProgressEvent, ScanPageCompleteEvent } from '../../types';

interface CrawlProgressProps {
  scanId: string;
}

export function CrawlProgress({ scanId }: CrawlProgressProps) {
  const { joinScan, leaveScan, onEvent } = useSocket();
  const [authStatus, setAuthStatus] = useState<{ success: boolean; message: string } | null>(null);

  const {
    discoveredPages,
    scannedCount,
    totalCount,
    percentage,
    status,
    errorMessage,
    addDiscoveredPage,
    updatePageStatus,
    updateProgress,
    updateStatus,
    setError,
  } = useScanStore();

  useEffect(() => {
    joinScan(scanId);

    const cleanups = [
      onEvent<{ status: string; error?: string }>('scan:status', (data) => {
        updateStatus(data.status);
        if (data.error) setError(data.error);
      }),
      onEvent<{ error: string }>('scan:error', (data) => {
        updateStatus('failed');
        setError(data.error);
      }),
      onEvent<CrawlPageFoundEvent>('crawl:page:found', (data) => {
        addDiscoveredPage({
          id: data.url,
          url: data.url,
          title: data.title,
          status: 'pending',
          issueCount: 0,
        });
      }),
      onEvent<{ url: string }>('scan:page:start', (data) => {
        updatePageStatus(data.url, 'scanning');
      }),
      onEvent<ScanPageCompleteEvent>('scan:page:complete', (data) => {
        updatePageStatus(data.url, 'complete', data.issueCount);
      }),
      onEvent<{ url: string }>('scan:page:error', (data) => {
        updatePageStatus(data.url, 'error');
      }),
      onEvent<ScanProgressEvent>('scan:progress', (data) => {
        updateProgress(data.scannedPages, data.totalPages);
      }),
      onEvent<{ success: boolean; message: string }>('scan:auth', (data) => {
        setAuthStatus(data);
      }),
    ];

    return () => {
      leaveScan(scanId);
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [scanId]);

  const getStatusIcon = (pageStatus: string) => {
    switch (pageStatus) {
      case 'complete':
        return <CheckCircle2 className="w-4 h-4 text-success" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-critical" />;
      case 'scanning':
        return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
      default:
        return <Clock className="w-4 h-4 text-foreground-muted" />;
    }
  };

  const getPhaseLabel = () => {
    switch (status) {
      case 'crawling':
        return 'Discovering pages...';
      case 'scanning':
        return 'Scanning for accessibility issues...';
      case 'analyzing':
        return 'Running smart deduplication...';
      case 'complete':
        return 'Scan complete!';
      case 'failed':
        return 'Scan failed';
      default:
        return 'Starting...';
    }
  };

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Left: Page list */}
      <div className="card h-[500px] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading font-medium">Discovered Pages</h3>
          <span className="text-sm text-foreground-muted">{totalCount} pages</span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1">
          {discoveredPages.map((page) => (
            <div
              key={page.url}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-background/50 transition-colors"
            >
              {getStatusIcon(page.status)}
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate text-foreground">
                  {page.title || page.url}
                </p>
                <p className="text-xs text-foreground-muted truncate">{page.url}</p>
              </div>
              {page.status === 'complete' && page.issueCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded bg-critical/20 text-critical">
                  {page.issueCount}
                </span>
              )}
            </div>
          ))}

          {discoveredPages.length === 0 && (
            <div className="flex items-center justify-center h-full text-foreground-muted">
              {status === 'failed' ? 'Scan failed before any pages were discovered' : 'Waiting for pages...'}
            </div>
          )}
        </div>
      </div>

      {/* Right: Stats */}
      <div className="space-y-6">
        {status === 'failed' && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl border bg-critical/5 border-critical/20 text-critical text-sm">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Scan failed</p>
              <p className="text-critical/80 break-words">{errorMessage || 'An unknown error occurred on the server.'}</p>
            </div>
          </div>
        )}
        {authStatus && (
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${
            authStatus.success
              ? 'bg-success/5 border-success/20 text-success'
              : 'bg-critical/5 border-critical/20 text-critical'
          }`}>
            {authStatus.success ? (
              <Unlock className="w-4 h-4 flex-shrink-0" />
            ) : (
              <Lock className="w-4 h-4 flex-shrink-0" />
            )}
            <span>{authStatus.message}</span>
          </div>
        )}

        <div className="card">
          <h3 className="font-heading font-medium mb-4">Scan Progress</h3>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-foreground-muted">{getPhaseLabel()}</span>
            </div>
            <ProgressBar value={percentage} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-background">
              <p className="text-2xl font-heading font-bold text-foreground">{scannedCount}</p>
              <p className="text-sm text-foreground-muted">Pages Scanned</p>
            </div>
            <div className="p-4 rounded-lg bg-background">
              <p className="text-2xl font-heading font-bold text-foreground">{totalCount}</p>
              <p className="text-sm text-foreground-muted">Total Pages</p>
            </div>
          </div>
        </div>

        {/* Phase indicator */}
        <div className="card">
          <h3 className="font-heading font-medium mb-4">Phase</h3>
          <div className="relative">
            {/* Connecting lines - positioned behind circles */}
            <div className="absolute top-5 left-0 right-0 flex items-center px-5">
              {[0, 1, 2].map((lineIndex) => {
                const currentIndex = ['crawling', 'scanning', 'analyzing', 'complete'].indexOf(status);
                return (
                  <div
                    key={lineIndex}
                    className={`flex-1 h-0.5 ${
                      currentIndex > lineIndex ? 'bg-success' : 'bg-border'
                    }`}
                  />
                );
              })}
            </div>
            {/* Phase circles */}
            <div className="relative flex items-start justify-between">
              {['crawling', 'scanning', 'analyzing', 'complete'].map((phase, index) => {
                const labels = ['Crawl', 'Scan', 'Analyze', 'Done'];
                const currentIndex = ['crawling', 'scanning', 'analyzing', 'complete'].indexOf(status);
                return (
                  <div key={phase} className="flex flex-col items-center">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold z-10 ${
                        status === phase
                          ? 'bg-primary text-white'
                          : currentIndex > index
                          ? 'bg-success text-white'
                          : 'bg-border text-foreground-muted'
                      }`}
                    >
                      {index + 1}
                    </div>
                    <span className="text-xs text-foreground-muted mt-2">{labels[index]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
