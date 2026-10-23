export type Theme = 'auto' | 'light' | 'dark';
export interface RenderContext {
  version: 1;
  id: string;
  blogId: string;
  title: string;
  parentOrigin: string;
  locale: string;
  theme: Theme;
}
export interface ReaderMessages {
  badge: string;
  heading: string;
  description: string;
  login: string;
  join: string;
  loading: string;
  denied: string;
  failed: string;
  popupBlocked: string;
}
export interface ReaderConfig extends RenderContext { messages: ReaderMessages }

export function validTheme(value: unknown): value is Theme {
  return value === 'auto' || value === 'light' || value === 'dark';
}

export function isGrant(event: MessageEvent, origin: string, popup: Window | null, challenge: string): boolean {
  return !!popup && !!challenge && event.origin === origin && event.source === popup &&
    event.data?.type === 'gitblog-membership-grant' && event.data.challenge === challenge &&
    typeof event.data.code === 'string' && event.data.code.length > 0 && event.data.code.length <= 4096;
}

export function isThemeMessage(event: MessageEvent, config: RenderContext, parent: Window): boolean {
  return event.origin === config.parentOrigin && event.source === parent &&
    event.data?.type === 'gitblog-membership-theme' && event.data.id === config.id && validTheme(event.data.theme);
}
