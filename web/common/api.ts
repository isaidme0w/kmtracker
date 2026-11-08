import type { ApiError } from '../../shared/api.ts';
import type { ErrorCode } from '../../shared/errors.ts';

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: ErrorCode | 'network';
  readonly params: Record<string, string | number>;

  constructor(status: number, code: ErrorCode | 'network', params: Record<string, string | number> = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.params = params;
  }
}

export const UNAUTHENTICATED_EVENT = 'kmt:unauthenticated';
export const PASSWORD_CHANGE_EVENT = 'kmt:password-change-required';
export const SETUP_PATH = '/admin/setup';

export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export async function request<T>(method: Method, url: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiRequestError(0, 'network');
  }
  const data = (await response.json().catch(() => null)) as { error?: ApiError } | null;
  if (response.ok) return data as T;

  const error = data?.error ?? { code: 'INTERNAL_ERROR' as const };
  if (error.code === 'SETUP_REQUIRED' && window.location.pathname !== SETUP_PATH) {
    window.location.assign(SETUP_PATH);
  } else if (error.code === 'UNAUTHENTICATED') {
    window.dispatchEvent(new Event(UNAUTHENTICATED_EVENT));
  } else if (error.code === 'PASSWORD_CHANGE_REQUIRED') {
    window.dispatchEvent(new Event(PASSWORD_CHANGE_EVENT));
  }
  throw new ApiRequestError(response.status, error.code, error.params);
}

// Client for one part of the application: '/api' or '/api/admin'.
export function createApi(base: string) {
  return {
    base,
    get: <T>(path: string) => request<T>('GET', base + path),
    post: <T>(path: string, body: unknown = {}) => request<T>('POST', base + path, body),
    patch: <T>(path: string, body: unknown = {}) => request<T>('PATCH', base + path, body),
    delete: <T>(path: string) => request<T>('DELETE', base + path),
  };
}

export type Api = ReturnType<typeof createApi>;
