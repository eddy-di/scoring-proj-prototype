import { t } from './i18n.js';
import { apiUrl } from './security.js';

// Thin fetch wrapper for the Django API: JSON in and out, the session cookie,
// the CSRF header, and readable error messages. Requests go only to this
// origin's /api/, and a response body is read only when it is JSON.

export class ApiError extends Error {
  constructor(status, body) {
    super(messageOf(status, body));
    this.status = status;
    this.body = body;
    // Field errors from DRF: { field: ['message', …] }
    this.fields = {};
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      for (const [k, v] of Object.entries(body)) {
        if (!['detail', 'used_by', 'issues', 'errors', 'warnings', 'can_publish'].includes(k)) this.fields[k] = [].concat(v).join(' ');
      }
    }
  }
}

function messageOf(status, body) {
  if (status === 0) return t('Can’t reach the server. Check that “manage.py runserver” is running.');
  if (status === 403 && body?.detail?.includes('credentials')) return t('You are signed out. Sign in again.');
  if (status === 403) return body?.detail ?? t('You don’t have permission to do this. Only admins can change this data.');
  if (status >= 500) return t('The server hit an error ({status}). Check the runserver console for details.', { status });
  if (body?.used_by) return `${body.detail} ${t('Used by: {list}.', { list: body.used_by.join('; ') })}`;
  if (body?.detail) return body.detail;
  if (body && typeof body === 'object') {
    const parts = Object.entries(body).map(([k, v]) => (k === 'non_field_errors' ? [].concat(v).join(' ') : `${k.replace(/_/g, ' ')}: ${[].concat(v).join(' ')}`));
    if (parts.length) return parts.join(' ');
  }
  return t('Request failed ({status}).', { status });
}

function csrfToken() {
  const raw = document.cookie.split('; ').find((c) => c.startsWith('csrftoken='))?.split('=')[1] ?? '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return '';
  }
}

const isJson = (res) => /^application\/(?:[\w.+-]+\+)?json\b/i.test(res.headers.get('Content-Type') ?? '');

export async function request(method, url, body) {
  const target = apiUrl(url);
  let res;
  try {
    res = await fetch(target, {
      method,
      mode: 'same-origin',
      credentials: 'same-origin',
      redirect: 'error',
      cache: 'no-store',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken() },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, null);
  }
  if (res.status === 204) return null;
  const data = isJson(res) ? await res.json().catch(() => null) : null;
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const get = (url) => request('GET', url);
export const post = (url, body = {}) => request('POST', url, body);
export const patch = (url, body) => request('PATCH', url, body);
export const del = (url) => request('DELETE', url);
