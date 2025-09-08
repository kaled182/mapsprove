import { useAuth } from '../store/auth';

export function authedFetch(input: RequestInfo, init: RequestInit = {}) {
  const token = useAuth.getState().token;
  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
