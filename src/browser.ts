import { mountReader } from './reader';
import type { ReaderConfig } from './protocol';

export function startReader(config: ReaderConfig) {
  let dispose = mountReader(config);
  const restore = (event: PageTransitionEvent) => {
    if (!event.persisted) return;
    dispose();
    dispose = mountReader(config);
  };
  window.addEventListener('pageshow', restore);
  return () => {
    window.removeEventListener('pageshow', restore);
    dispose();
  };
}

const config = document.getElementById('reader-config');
if (config?.textContent) startReader(JSON.parse(config.textContent) as ReaderConfig);
