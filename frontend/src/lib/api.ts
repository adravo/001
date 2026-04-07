import axios from 'axios';
import Cookies from 'js-cookie';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token
api.interceptors.request.use((config) => {
  const token = Cookies.get('token') || (typeof window !== 'undefined' ? localStorage.getItem('token') : null);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      Cookies.remove('token');
      localStorage.removeItem('token');
      window.location.href = '/auth/login';
    }
    return Promise.reject(err);
  },
);

// ---- Auth ----
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/v1/auth/login', { email, password }).then((r) => r.data),
  register: (data: { email: string; password: string; name?: string; phone?: string }) =>
    api.post('/v1/auth/register', data).then((r) => r.data),
  profile: () => api.get('/v1/auth/profile').then((r) => r.data),
};

// ---- Search ----
export const searchApi = {
  create: (data: CreateSearchInput) =>
    api.post('/v1/search', data).then((r) => r.data),
  list: (page = 1, limit = 10) =>
    api.get('/v1/search', { params: { page, limit } }).then((r) => r.data),
  get: (id: string) =>
    api.get(`/v1/search/${id}`).then((r) => r.data),
  getReport: (id: string) =>
    api.get(`/v1/search/${id}/report`).then((r) => r.data),
};

// ---- Automation ----
export const automationApi = {
  submitCaptcha: (searchId: string, sessionToken: string, solution: string) =>
    api.post(`/v1/automation/${searchId}/captcha-response`, { sessionToken, solution }).then((r) => r.data),
  getLogs: (searchId: string) =>
    api.get(`/v1/automation/${searchId}/logs`).then((r) => r.data),
};

// ---- Reports ----
export const reportsApi = {
  get: (searchId: string) =>
    api.get(`/v1/reports/${searchId}`).then((r) => r.data),
};

// ---- Upload ----
export const uploadApi = {
  uploadEc: (searchId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/v1/upload/ec/${searchId}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },
};

export interface CreateSearchInput {
  surveyNumber?: string;
  documentNumber?: string;
  district: string;
  sro?: string;
  village?: string;
  taluk?: string;
  source?: 'tnreginet' | 'patta' | 'both';
}
