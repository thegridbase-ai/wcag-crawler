import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, XCircle, Shield } from 'lucide-react';
import { CrawlProgress } from '../components/scan/CrawlProgress';
import { useSocket } from '../hooks/useSocket';
import { useScanStore } from '../stores/scanStore';
import { scanApi } from '../lib/api';
import type { ScanCompleteEvent } from '../types';

export function ScanProgressPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { onEvent } = useSocket();
  const { status, reset, updateStatus, setError } = useScanStore();

  useEffect(() => {
    if (!id) return;

    const syncFromApi = (scan: { status: string; error_message?: string | null }) => {
      if (scan.status === 'complete') {
        navigate(`/scans/${id}/report`, { replace: true });
      } else if (scan.status === 'failed') {
        updateStatus('failed');
        setError(scan.error_message || null);
      }
    };

    // Check if scan already finished (a fast failure can happen before the
    // socket room is joined, so events alone are not enough)
    scanApi.get(id).then(syncFromApi).catch(() => {});

    // Polling fallback in case a status event is missed (e.g. reconnect)
    const interval = setInterval(() => {
      const current = useScanStore.getState().status;
      if (current === 'complete' || current === 'failed') return;
      scanApi.get(id).then(syncFromApi).catch(() => {});
    }, 10000);

    // Listen for completion
    const cleanup = onEvent<ScanCompleteEvent>('scan:complete', (data) => {
      if (data.scanId === id) {
        setTimeout(() => {
          navigate(`/scans/${id}/report`);
        }, 1500);
      }
    });

    return () => {
      clearInterval(interval);
      cleanup();
      reset();
    };
  }, [id]);

  const handleCancel = async () => {
    if (!id) return;
    try {
      await scanApi.cancel(id);
      navigate('/');
    } catch (error) {
      console.error('Failed to cancel scan:', error);
    }
  };

  if (!id) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-foreground-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back</span>
        </button>

        {status !== 'complete' && status !== 'failed' && (
          <button
            onClick={handleCancel}
            className="btn btn-danger"
          >
            <XCircle className="w-4 h-4 mr-2" />
            Cancel Scan
          </button>
        )}
      </div>

      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-heading font-bold text-foreground">
          Scan in Progress
        </h1>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/30">
          <Shield className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-primary">WCAG 2.1 AA</span>
        </div>
      </div>

      <CrawlProgress scanId={id} />
    </div>
  );
}
