import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../lib/api';

export type WarmupStatus = 'checking' | 'ready' | 'waking' | 'down';

const SLOW_AFTER_MS = 2500;
const GIVE_UP_AFTER_MS = 90_000;
const RETRY_EVERY_MS = 4000;

/**
 * Pings the scanner API's /health on mount. The server sleeps on the free hosting tier and takes
 * 10-40 s to wake, so the home page starts the wake-up as soon as it loads and tells the user what
 * is going on instead of leaving "Get Started" spinning in silence.
 */
export function useServerWarmup(enabled = true): { status: WarmupStatus; waitedMs: number } {
  const [status, setStatus] = useState<WarmupStatus>('checking');
  const [waitedMs, setWaitedMs] = useState(0);
  const startedAt = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    startedAt.current = Date.now();

    const slowTimer = window.setTimeout(() => {
      if (!cancelled) setStatus(s => (s === 'checking' ? 'waking' : s));
    }, SLOW_AFTER_MS);
    const tick = window.setInterval(() => {
      if (!cancelled) setWaitedMs(Date.now() - startedAt.current);
    }, 1000);

    const ping = async () => {
      try {
        const controller = new AbortController();
        const t = window.setTimeout(() => controller.abort(), RETRY_EVERY_MS * 2);
        const res = await fetch(`${API_BASE_URL}/health`, { signal: controller.signal, cache: 'no-store' });
        window.clearTimeout(t);
        if (res.ok) {
          if (!cancelled) setStatus('ready');
          return;
        }
      } catch {
        // fall through to retry
      }
      if (cancelled) return;
      if (Date.now() - startedAt.current > GIVE_UP_AFTER_MS) {
        setStatus('down');
        return;
      }
      window.setTimeout(ping, RETRY_EVERY_MS);
    };
    void ping();

    return () => {
      cancelled = true;
      window.clearTimeout(slowTimer);
      window.clearInterval(tick);
    };
  }, [enabled]);

  return { status, waitedMs };
}
