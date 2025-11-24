const apiBase = (typeof window !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_API_BASE)
  ? (import.meta as any).env.VITE_API_BASE
  : (typeof window !== 'undefined' && window.location && window.location.port === '5173' ? 'http://localhost:3000' : '');

export const getApiBase = () => apiBase;

// apiFetch: central helper for calling backend APIs.
// Defaults to sending credentials (cookies) so session-authenticated endpoints (like /api/admin/*)
// work in the browser during development.
export const apiFetch = (path: string, opts?: RequestInit) => {
  const url = path && (path as string).startsWith('http') ? path : `${apiBase}${path}`;
  const defaultOpts: RequestInit = { credentials: 'include' };
  // merge headers carefully if both present
  const merged: RequestInit = { ...defaultOpts, ...(opts || {}) };
  if (opts && opts.headers && merged.headers) {
    merged.headers = { ...(merged.headers as any), ...(opts.headers as any) };
  }
  return fetch(url, merged);
};

export default apiFetch;
