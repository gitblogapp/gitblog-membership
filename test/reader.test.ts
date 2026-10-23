// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { mountReader } from '../src/reader';
import { isGrant, isThemeMessage, type ReaderConfig } from '../src/protocol';
import catalogs from '../src/messages.json';
const config: ReaderConfig = { version: 1, id: '11111111-1111-4111-8111-111111111111', blogId: '22222222-2222-4222-8222-222222222222',
  title: 'Title', parentOrigin: 'https://blog.gitblog.page', locale: 'en', theme: 'light', messages: catalogs.en };
let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); dispose = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function setup() {
  vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
  document.body.innerHTML = '<main id="reader"><div id="gate"><p id="status"></p><button id="login"></button></div><article id="body" hidden></article><p id="credit" hidden></p></main>';
}
it('rejects forged popup grants and theme messages', () => {
  const popup = {} as Window;
  const data = { type:'gitblog-membership-grant', challenge:'challenge', code:'code' };
  const event = { origin:location.origin, source:popup, data } as unknown as MessageEvent;
  expect(isGrant(event, location.origin, popup, 'challenge')).toBe(true);
  expect(isGrant({...event, source:window} as MessageEvent, location.origin, popup, 'challenge')).toBe(false);
  expect(isGrant({...event, origin:'https://evil.test'} as MessageEvent, location.origin, popup, 'challenge')).toBe(false);
  expect(isGrant(event, location.origin, popup, 'different')).toBe(false);
  expect(isGrant({...event, source:null} as MessageEvent, location.origin, null, 'challenge')).toBe(false);
  const theme = { origin:config.parentOrigin, source:window.parent, data:{type:'gitblog-membership-theme',id:config.id,theme:'dark'} } as MessageEvent;
  expect(isThemeMessage(theme, config, window.parent)).toBe(true);
  expect(isThemeMessage({...theme, origin:'https://evil.test'} as MessageEvent, config, window.parent)).toBe(false);
});
it('fetches private images with credentials in headers only and cleans up tokens/blob URLs', async () => {
  setup();
  const storage = { setItem: vi.fn() };
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('sessionStorage', storage);
  const asset = '33333333-3333-4333-8333-333333333333';
  const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ html:`<p>Private full body</p><img src="membership-asset:${asset}"><a href="https://example.com">Link</a>`,token:'ARTICLE_TOKEN' })))
    .mockResolvedValueOnce(new Response('image', {headers:{'content-type':'image/png'}}));
  vi.stubGlobal('fetch', fetchMock);
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
  const post = vi.mocked(window.parent.postMessage);
  dispose = mountReader(config);
  await vi.waitFor(() => expect(document.getElementById('body')?.textContent).toContain('Private full body'));
  expect(fetchMock.mock.calls[1][0]).toBe(`/api/membership/assets/${asset}?article=${config.id}`);
  expect(fetchMock.mock.calls[1][1].headers.authorization).toBe('Bearer ARTICLE_TOKEN');
  expect(document.querySelector('img')?.getAttribute('src')).toBe('blob:test');
  expect(document.querySelector('a')?.getAttribute('rel')).toBe('noopener noreferrer');
  expect(JSON.stringify(post.mock.calls)).not.toContain('ARTICLE_TOKEN');
  expect(JSON.stringify(post.mock.calls)).not.toContain('Private full body');
  expect(storage.setItem).not.toHaveBeenCalled();
  dispose();
  expect(revoke).toHaveBeenCalledWith('blob:test');
  expect(document.getElementById('body')?.textContent).toBe('');
});
it('shows the gate after denied reads and ignores arbitrary server error text', async () => {
  setup(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('INTERNAL SECRET',{status:403})));
  dispose = mountReader(config);
  await vi.waitFor(() => expect(document.getElementById('status')?.textContent).toBe(config.messages.denied));
  expect(document.getElementById('body')?.hidden).toBe(true);
  expect((document.getElementById('login') as HTMLButtonElement).disabled).toBe(false);
});
