// Client-side safety rules, in one place. Every other module goes through these
// helpers instead of touching risky browser APIs directly:
//
// - XSS: views build the DOM with h() (dom.js), which only creates text nodes
//   and refuses script-capable tags, inline handlers and unsafe URLs. Nothing
//   uses innerHTML; the Content-Security-Policy in index.html blocks inline
//   scripts and, in Chrome, every HTML-string sink (Trusted Types).
// - Open redirects: the app only navigates to its own hash routes (routePath).
//   There is no "?next=" parameter; after signing in the app always goes to "/".
// - Log forging: logError() puts each entry on one line with control
//   characters escaped, so text from the server or the URL can't fake entries.
// - iframes: h() refuses <iframe>, the CSP forbids frames, and the app won't
//   run inside someone else's frame (clickjacking).
// - JSON hijacking: api.js reads responses only when they are application/json,
//   and only talks to this origin's /api/.
// The server-side half (HSTS, X-Frame-Options, nosniff, secure cookies) is in
// backend/config/settings.py.

// Tags that can run code, load other documents or change how URLs resolve.
export const BLOCKED_TAGS = new Set(['script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'base', 'meta', 'link', 'style', 'portal']);

// Attributes that never come from h(): they parse HTML or run code.
export const BLOCKED_ATTRS = new Set(['srcdoc', 'innerhtml', 'outerhtml', 'formaction', 'action']);

// Attributes holding a URL.
export const URL_ATTRS = new Set(['href', 'src', 'xlink:href', 'poster', 'cite', 'data', 'ping']);

const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

// A URL that is safe to put in href/src: hash routes, same-origin paths and
// http(s)/mailto links. Anything else (javascript:, data:, vbscript:,
// protocol-relative "//host") becomes "#".
export function safeUrl(value) {
  const s = String(value ?? '').trim();
  if (s.startsWith('#')) return s;
  if (/^\/(?![/\\])/.test(s)) return s;
  try {
    // The URL parser also removes the tabs and newlines used to hide "javascript:".
    const u = new URL(s, location.origin);
    if (SAFE_SCHEMES.has(u.protocol)) return u.href;
  } catch {
    // Not a URL.
  }
  return '#';
}

// The app's own routes: "/", "/admin/versions/3/node/12", "/help/weight"…
// Returns null for anything else, which the router shows as "Page not found".
const ROUTE = /^\/[\w\-/]{0,200}$/;
export const routePath = (path) => (typeof path === 'string' && ROUTE.test(path) ? path : null);

// Same-origin API URLs only: relative "/api/…" paths that stay on this host.
export function apiUrl(url) {
  const u = new URL(url, location.origin);
  if (u.origin !== location.origin || !u.pathname.startsWith('/api/')) throw new TypeError(`Blocked request to ${cleanLog(url)}`);
  return u.pathname + u.search;
}

// One line of log text: CR, LF and other control characters are escaped,
// so input can't start a fake log entry.
export function cleanLog(value, max = 2000) {
  const s = value instanceof Error ? `${value.name}: ${value.message}` : String(value);
  return s
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
    .slice(0, max);
}

export function logError(context, err) {
  const stack = err instanceof Error && err.stack ? ` | ${cleanLog(err.stack)}` : '';
  console.error(`[qualimetry] ${cleanLog(context)}: ${cleanLog(err)}${stack}`);
}

// True when another page shows this app in a frame.
export function framed() {
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
}

// Own keys only, so route parts like "constructor" or "__proto__" never match
// something inherited from Object.prototype.
export const own = (obj, key) => (obj != null && Object.hasOwn(obj, key) ? obj[key] : undefined);
