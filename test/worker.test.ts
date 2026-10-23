import { expect, it } from 'vitest';
import worker from '../src/worker';
import catalogs from '../src/messages.json';
const context = { version: 1, id: '11111111-1111-4111-8111-111111111111', blogId: '22222222-2222-4222-8222-222222222222',
  title: 'Members', parentOrigin: 'https://blog.gitblog.page', locale: 'ko', theme: 'auto' };
const request = (body: unknown, headers = {}) => new Request('https://membership.internal/internal/render', {
  method: 'POST', headers: { 'content-type':'application/json', ...headers }, body: JSON.stringify(body)
});
it('serves a standalone, no-store reader and limits framing to the registered blog', async () => {
  const response = await worker.fetch(request(context));
  const html = await response.text();
  expect(response.status).toBe(200);
  expect(response.headers.get('content-security-policy')).toContain('frame-ancestors https://blog.gitblog.page');
  expect(response.headers.get('content-security-policy')).not.toContain('unsafe-inline');
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('x-gitblog-membership-version')).toBe('1.0.0');
  expect(html).toContain('로그인하고 전문 읽기');
  expect(html).not.toContain('/_app/');
});
it('escapes HTML and JSON delimiters and drops unknown/private context fields', async () => {
  const response = await worker.fetch(request({ ...context, title: '</script><img src=x onerror=alert(1)>', body: 'PRIVATE BODY', token: 'PRIVATE TOKEN' }));
  const html = await response.text();
  expect(html).not.toContain('</script><img');
  expect(html).not.toContain('PRIVATE BODY');
  expect(html).not.toContain('PRIVATE TOKEN');
  expect(html).toContain('\\u003c/script\\u003e');
});
it.each(['https://ok.test/path', 'https://ok.test; script-src *', 'http://ok.test', 'null', '*'])('rejects invalid parent origin %s', async parentOrigin => {
  expect((await worker.fetch(request({ ...context, parentOrigin }))).status).toBe(400);
});
it('rejects unsupported context, credentials and public paths', async () => {
  for (const invalid of [{ version: 2 }, { id: '../secret' }, { locale: 'constructor' }, { theme: 'red' }])
    expect((await worker.fetch(request({ ...context, ...invalid }))).status).toBe(400);
  expect((await worker.fetch(request(context, { cookie: 'session=secret' }))).status).toBe(400);
  expect((await worker.fetch(request(context, { authorization: 'Bearer secret' }))).status).toBe(400);
  expect((await worker.fetch(new Request('https://membership.internal/api/membership/read/id'))).status).toBe(404);
  expect((await worker.fetch(new Request('https://membership.internal/internal/render'))).status).toBe(405);
});
it('renders all 12 locales, with Arabic reading direction', async () => {
  expect(Object.keys(catalogs)).toHaveLength(12);
  for (const locale of Object.keys(catalogs)) {
    const html = await (await worker.fetch(request({ ...context, locale }))).text();
    expect(html).toContain(`lang="${locale}"`);
    expect(html).toContain(`dir="${locale === 'ar' ? 'rtl' : 'ltr'}"`);
  }
});
