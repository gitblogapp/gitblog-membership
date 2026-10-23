// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { applyAppearance } from '../src/appearance';
afterEach(() => document.documentElement.removeAttribute('style'));
it('rejects CSS injection, URLs, unsupported properties and out-of-range typography', () => {
  applyAppearance({text:'red; background:url(https://evil.test)',surface:'url(https://evil.test)',bodyFont:'serif; display:none',fontSize:999,lineHeight:0,position:'fixed'});
  expect(document.documentElement.style.length).toBe(0);
  applyAppearance({text:'#123456',bodyFont:'Georgia, serif',fontSize:18,lineHeight:1.8});
  expect(document.documentElement.style.getPropertyValue('--host-text')).toBe('#123456');
  expect(document.documentElement.style.getPropertyValue('--host-body-font')).toBe('Georgia, serif');
  applyAppearance({text:'var(--private-token)',fontSize:NaN});
  expect(document.documentElement.style.length).toBe(0);
});
