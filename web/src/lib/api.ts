const TOKEN_KEY = 'rastrocar.token';

/** Base da API. Vazio = mesmo host (painel servido pelo próprio servidor). */
export const API_BASE: string = ((import.meta as any).env?.VITE_API_URL ?? '').replace(/\/+$/, '');

export function apiUrl(path: string): string {
  return API_BASE ? `${API_BASE}${path}` : path;
}

export function wsUrl(token: string): string {
  if (API_BASE) {
    const u = new URL(API_BASE);
    const proto = u.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${u.host}${u.pathname.replace(/\/+$/, '')}/ws?token=${encodeURIComponent(token)}`;
  }
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`;
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(apiUrl(url), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 401 && !url.includes('/auth/login')) {
    onUnauthorized?.();
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Erro ${res.status}`);
  return data as T;
}

function qs(params?: Record<string, string | number | boolean | null | undefined>): string {
  if (!params) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const api = {
  get: <T>(url: string, params?: Record<string, string | number | boolean | null | undefined>) => request<T>('GET', url + qs(params)),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body),
  delete: <T>(url: string) => request<T>('DELETE', url),
};
