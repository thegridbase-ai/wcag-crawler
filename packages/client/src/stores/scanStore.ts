import { create } from 'zustand';
import type { Scan, PageSummary } from '../types';

interface ScanState {
  currentScan: Scan | null;
  discoveredPages: PageSummary[];
  scannedCount: number;
  totalCount: number;
  percentage: number;
  status: string;
  errorMessage: string | null;

  setCurrentScan: (scan: Scan | null) => void;
  addDiscoveredPage: (page: PageSummary) => void;
  updatePageStatus: (url: string, status: PageSummary['status'], issueCount?: number) => void;
  updateProgress: (scanned: number, total: number) => void;
  updateStatus: (status: string) => void;
  setError: (message: string | null) => void;
  reset: () => void;
}

export const useScanStore = create<ScanState>((set) => ({
  currentScan: null,
  discoveredPages: [],
  scannedCount: 0,
  totalCount: 0,
  percentage: 0,
  status: 'pending',
  errorMessage: null,

  setCurrentScan: (scan) => set({ currentScan: scan }),

  addDiscoveredPage: (page) =>
    set((state) => ({
      discoveredPages: [...state.discoveredPages, page],
      totalCount: state.discoveredPages.length + 1,
    })),

  updatePageStatus: (url, status, issueCount) =>
    set((state) => ({
      discoveredPages: state.discoveredPages.map((p) =>
        p.url === url ? { ...p, status, issueCount: issueCount ?? p.issueCount } : p
      ),
    })),

  updateProgress: (scanned, total) =>
    set({
      scannedCount: scanned,
      totalCount: total,
      percentage: Math.round((scanned / total) * 100),
    }),

  updateStatus: (status) => set({ status }),

  setError: (message) => set({ errorMessage: message }),

  reset: () =>
    set({
      currentScan: null,
      discoveredPages: [],
      scannedCount: 0,
      totalCount: 0,
      percentage: 0,
      status: 'pending',
      errorMessage: null,
    }),
}));
