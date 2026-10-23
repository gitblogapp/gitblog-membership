import { mountReader } from './reader';
import type { ReaderConfig } from './protocol';

const config = document.getElementById('reader-config');
if (config?.textContent) mountReader(JSON.parse(config.textContent) as ReaderConfig);
