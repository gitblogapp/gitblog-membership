import { script, css, version } from './generated/assets';
import catalogs from './messages.json';
import { validTheme, type RenderContext, type ReaderConfig } from './protocol';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validContext(value: unknown): value is RenderContext {
  if (!value || typeof value !== 'object') return false;
  const c = value as RenderContext;
  if (c.version !== 1 || typeof c.id !== 'string' || !uuid.test(c.id) ||
      typeof c.blogId !== 'string' || !uuid.test(c.blogId) || typeof c.title !== 'string' || c.title.length > 1000 ||
      !Object.hasOwn(catalogs, c.locale) || !validTheme(c.theme) || typeof c.parentOrigin !== 'string') return false;
  try {
    const url = new URL(c.parentOrigin);
    return url.protocol === 'https:' && url.origin === c.parentOrigin && !url.username && !url.password;
  } catch { return false; }
}

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]!);
const safeJson = (value: unknown) => JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4,'0')}`);
const privateHeaders = { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow',
  'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' };

export function render(context: RenderContext): Response {
  const nonce = crypto.randomUUID().replaceAll('-', '');
  const messages = catalogs[context.locale as keyof typeof catalogs];
  const config: ReaderConfig = { ...context, messages };
  const direction = context.locale === 'ar' ? 'rtl' : 'ltr';
  const text = (key: keyof typeof messages) => escape(messages[key]);
  const lock = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v3"/></svg>';
  const arrow = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg>';
  const brand = '<a class="brand" href="https://gitblog.app" target="_blank" rel="noopener noreferrer">gitblog</a>';
  const html = `<!doctype html><html lang="${escape(context.locale)}" dir="${direction}" data-theme="${context.theme}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>${escape(context.title)} · GitBlog</title><style nonce="${nonce}">${css}</style></head><body>
<main id="reader" aria-busy="true"><section class="gate" id="gate" aria-labelledby="gate-title">
<div class="gate-header"><span class="badge">${lock}${text('badge')}</span>${brand}</div>
<h2 id="gate-title">${text('heading')}</h2><p class="description">${text('description')}</p>
<div class="actions"><button type="button" id="login" disabled>${text('loading')}</button>
<a class="join" href="/membership/join/${encodeURIComponent(context.blogId)}" target="_blank" rel="noopener noreferrer"><span>${text('join')}</span>${arrow}</a></div>
<p id="status" role="status" aria-live="polite"></p></section>
<article id="body" class="body" hidden></article><footer class="credit" id="credit" hidden><span class="badge">${lock}${text('badge')}</span>${brand}</footer></main>
<noscript><p class="noscript">JavaScript is required to read this membership article.</p></noscript>
<script id="reader-config" type="application/json" nonce="${nonce}">${safeJson(config)}</script>
<script nonce="${nonce}">${script}</script></body></html>`;
  return new Response(html, { headers: { ...privateHeaders, 'content-type': 'text/html; charset=utf-8',
    'content-language': context.locale, 'x-gitblog-membership-version': version,
    'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; img-src blob: https:; frame-ancestors ${context.parentOrigin}; base-uri 'none'; form-action 'none'`,
    'permissions-policy': 'camera=(), microphone=(), geolocation=()'
  } });
}

export default {
  async fetch(request: Request): Promise<Response> {
    // This endpoint has no public route. GitBlog supplies only validated public metadata over its binding.
    if (new URL(request.url).pathname !== '/internal/render') return new Response(null, { status: 404, headers: privateHeaders });
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { ...privateHeaders, allow: 'POST' } });
    if (request.headers.has('cookie') || request.headers.has('authorization')) return new Response(null, { status: 400, headers: privateHeaders });
    const text = await request.text();
    if (text.length > 8192) return new Response(null, { status: 413, headers: privateHeaders });
    let context: unknown;
    try { context = JSON.parse(text); } catch { return new Response(null, { status: 400, headers: privateHeaders }); }
    if (!validContext(context)) return new Response(null, { status: 400, headers: privateHeaders });
    // Explicit allowlist prevents accidental new/private fields reaching the browser.
    const { id, blogId, title, parentOrigin, locale, theme } = context;
    return render({ version: 1, id, blogId, title, parentOrigin, locale, theme });
  }
};
