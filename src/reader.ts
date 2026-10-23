import { isGrant, isThemeMessage, type ReaderConfig, type Theme } from './protocol';

/** All authorization remains in GitBlog. The reader holds only an ephemeral, article-scoped token. */
export function mountReader(config: ReaderConfig): () => void {
  const container = document.getElementById('reader')!;
  const gate = document.getElementById('gate')!;
  const body = document.getElementById('body')!;
  const credit = document.getElementById('credit')!;
  const status = document.getElementById('status')!;
  const button = document.getElementById('login') as HTMLButtonElement;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const abort = new AbortController();
  let theme = config.theme;
  let token = '';
  let popup: Window | null = null;
  let challenge = '';
  let blobs: string[] = [];
  let disposed = false;
  let reading = false;
  const releaseBlobs = () => { blobs.forEach(url => URL.revokeObjectURL(url)); blobs = []; };

  function applyTheme(value: Theme) {
    theme = value;
    document.documentElement.dataset.theme = value === 'auto' ? (media.matches ? 'dark' : 'light') : value;
  }
  const systemTheme = () => applyTheme(theme);
  applyTheme(theme);
  media.addEventListener('change', systemTheme);

  async function read(code?: string, grantChallenge?: string) {
    if (reading || disposed) return;
    reading = true;
    button.disabled = true;
    button.textContent = config.messages.loading;
    status.textContent = config.messages.loading;
    container.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch(`/api/membership/read/${encodeURIComponent(config.id)}`, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: abort.signal,
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(code ? { code, challenge: grantChallenge } : {})
      });
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? config.messages.denied : config.messages.failed);
      const result = await response.json() as { html?: unknown; token?: unknown };
      if (typeof result.html !== 'string') throw new Error(config.messages.failed);
      if (typeof result.token === 'string') token = result.token;
      releaseBlobs();
      // HTML is sanitized by the authoritative API. Private assets still require a permission check.
      const doc = new DOMParser().parseFromString(result.html, 'text/html');
      for (const img of doc.querySelectorAll<HTMLImageElement>('img[src^="membership-asset:"]')) {
        const assetId = img.getAttribute('src')!.slice('membership-asset:'.length);
        if (!/^[0-9a-f-]{36}$/i.test(assetId)) { img.remove(); continue; }
        try {
          const asset = await fetch(`/api/membership/assets/${encodeURIComponent(assetId)}?article=${encodeURIComponent(config.id)}`, {
            credentials: 'same-origin', cache: 'no-store', signal: abort.signal,
            headers: token ? { authorization: `Bearer ${token}` } : {}
          });
          if (!asset.ok) { img.remove(); continue; }
          const blob = await asset.blob();
          if (disposed) return;
          const object = URL.createObjectURL(blob);
          blobs.push(object);
          img.setAttribute('src', object);
        } catch { img.remove(); }
      }
      if (disposed) return;
      // Navigate links outside the reader, never replace this credential-bearing frame.
      for (const link of doc.querySelectorAll('a')) {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
      }
      body.replaceChildren(...Array.from(doc.body.childNodes));
      body.hidden = false;
      credit.hidden = false;
      gate.hidden = true;
    } catch (error) {
      if (disposed) return;
      releaseBlobs();
      body.replaceChildren();
      body.hidden = true;
      credit.hidden = true;
      gate.hidden = false;
      status.textContent = error instanceof Error && [config.messages.denied, config.messages.failed].includes(error.message)
        ? error.message : config.messages.failed;
    } finally {
      if (!disposed) {
        reading = false;
        button.disabled = false;
        button.textContent = config.messages.login;
        container.setAttribute('aria-busy', 'false');
        resize();
      }
    }
  }

  const login = () => {
    challenge = crypto.randomUUID();
    popup?.close();
    popup = window.open(`/membership/authorize?${new URLSearchParams({ article: config.id, challenge })}`,
      'gitblog-membership', 'popup,width=540,height=720');
    if (!popup) status.textContent = config.messages.popupBlocked;
  };
  const receive = (event: MessageEvent) => {
    if (isThemeMessage(event, config, window.parent)) applyTheme(event.data.theme);
    if (!isGrant(event, location.origin, popup, challenge)) return;
    const acceptedChallenge = challenge;
    challenge = '';
    popup?.close();
    popup = null;
    void read(event.data.code, acceptedChallenge);
  };
  function resize() {
    if (!disposed) window.parent.postMessage({ type: 'gitblog-membership-resize', id: config.id,
      height: Math.max(200, Math.min(100000, Math.ceil(container.getBoundingClientRect().height) + 16)) }, config.parentOrigin);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  button.addEventListener('click', login);
  window.addEventListener('message', receive);
  function dispose() {
    if (disposed) return;
    disposed = true;
    abort.abort();
    token = '';
    challenge = '';
    popup?.close();
    releaseBlobs();
    body.replaceChildren();
    observer.disconnect();
    media.removeEventListener('change', systemTheme);
    button.removeEventListener('click', login);
    window.removeEventListener('message', receive);
    window.removeEventListener('pagehide', dispose);
  }
  window.addEventListener('pagehide', dispose);
  void read();
  resize();
  return dispose;
}
