import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { AuthStateResponse, Scan, ScanConfig, ScanCreateResponse, FullReport } from '../types';
import { accessHeadersForScan } from './access-headers';
import { expireStoredIdentity } from './auth-expiry';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://wcag-crawler-server.onrender.com';

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

type RetryableRequest = InternalAxiosRequestConfig & { _retriedWithoutIdentity?: boolean };
type ServerAuthConfig = { googleClientId: string; capabilityProtocol: number };

let capabilityProtocolCheck: Promise<void> | null = null;

async function requireCapabilityProtocolV1(): Promise<void> {
  if (!capabilityProtocolCheck) {
    capabilityProtocolCheck = api.get<ServerAuthConfig>('/auth/config')
      .then(response => {
        if (response.data.capabilityProtocol !== 1) {
          throw new Error('Server does not support anonymous capability protocol v1');
        }
      })
      .catch(error => {
        capabilityProtocolCheck = null;
        throw error;
      });
  }
  await capabilityProtocolCheck;
}

api.interceptors.response.use(undefined, async (error: AxiosError) => {
  if (error.response?.status !== 401 || !error.config) throw error;

  const config = error.config as RetryableRequest;
  const hadIdentity = Boolean(config.headers.get('Authorization'));
  if (!hadIdentity) throw error;

  expireStoredIdentity();
  const hasCapability = Boolean(config.headers.get('X-Scan-Token'));
  if (!hasCapability || config._retriedWithoutIdentity) throw error;

  config._retriedWithoutIdentity = true;
  config.headers.delete('Authorization');
  return api.request(config);
});

export const scanApi = {
  create: async (url: string, config?: Partial<ScanConfig>): Promise<ScanCreateResponse> => {
    await requireCapabilityProtocolV1();
    const response = await api.post<ScanCreateResponse>('/scans', {
      url,
      config,
      capabilityProtocol: 1,
    }, {
      headers: accessHeadersForScan(),
    });
    return response.data;
  },

  list: async (limit = 50, offset = 0) => {
    try {
      const response = await api.get<Scan[]>(`/scans?limit=${limit}&offset=${offset}`, {
        headers: accessHeadersForScan(),
      });
      return response.data || [];
    } catch {
      return [];
    }
  },

  get: async (id: string) => {
    const response = await api.get<Scan>(`/scans/${id}`, { headers: accessHeadersForScan(id) });
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/scans/${id}`, { headers: accessHeadersForScan(id) });
  },

  cancel: async (id: string) => {
    const response = await api.post(`/scans/${id}/cancel`, undefined, {
      headers: accessHeadersForScan(id),
    });
    return response.data;
  },
};

export const reportApi = {
  get: async (scanId: string) => {
    const response = await api.get<FullReport>(`/reports/${scanId}`, {
      headers: accessHeadersForScan(scanId),
    });
    return response.data;
  },

  downloadExport: async (scanId: string, format: 'html' | 'pdf' = 'html') => {
    const response = await api.get<Blob>(`/reports/${scanId}/export?format=${format}`, {
      headers: accessHeadersForScan(scanId), responseType: 'blob',
    });
    return response.data;
  },

  downloadFixReport: async (scanId: string) => {
    const response = await api.get<Blob>(`/reports/${scanId}/fix-report`, {
      headers: accessHeadersForScan(scanId), responseType: 'blob',
    });
    return response.data;
  },
};

export const authApi = {
  config: async (): Promise<ServerAuthConfig> => {
    const response = await api.get<ServerAuthConfig>('/auth/config');
    return response.data;
  },

  me: async (): Promise<AuthStateResponse> => {
    const response = await api.get<AuthStateResponse>('/auth/me', {
      headers: accessHeadersForScan(),
    });
    return response.data;
  },
};

export default api;
