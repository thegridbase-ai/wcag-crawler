import axios from 'axios';
import type { Scan, ScanConfig, FullReport } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://wcag-crawler-server-production.up.railway.app';

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const scanApi = {
  create: async (url: string, config?: Partial<ScanConfig>) => {
    const response = await api.post<{ id: string; status: string; rootUrl: string }>('/scans', {
      url,
      config,
    });
    return response.data;
  },

  list: async (limit = 50, offset = 0) => {
    try {
      const response = await api.get<Scan[]>(`/scans?limit=${limit}&offset=${offset}`);
      return response.data || [];
    } catch {
      return [];
    }
  },

  get: async (id: string) => {
    const response = await api.get<Scan>(`/scans/${id}`);
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/scans/${id}`);
  },

  cancel: async (id: string) => {
    const response = await api.post(`/scans/${id}/cancel`);
    return response.data;
  },
};

export const reportApi = {
  get: async (scanId: string) => {
    const response = await api.get<FullReport>(`/reports/${scanId}`);
    return response.data;
  },

  exportUrl: (scanId: string, format: 'html' | 'pdf' = 'html') =>
    `${API_BASE_URL}/api/reports/${scanId}/export?format=${format}`,

  fixReportUrl: (scanId: string) =>
    `${API_BASE_URL}/api/reports/${scanId}/fix-report`,
};

export default api;
