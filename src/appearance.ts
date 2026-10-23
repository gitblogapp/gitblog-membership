/** An allowlisted presentation contract, never CSS/HTML supplied by the parent. */
export function applyAppearance(input: unknown, root = document.documentElement): void {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return;
  const values = input as Record<string, unknown>;
  const colors = { text: '--host-text', bodyText: '--host-body-text', muted: '--host-muted', border: '--host-border',
    surface: '--host-surface', background: '--host-background', accent: '--host-accent' };
  for (const [key, property] of Object.entries(colors)) {
    const value = values[key];
    // Computed solid colors only. No variables, URLs, selectors or declarations.
    const solid = typeof value === 'string' && value.length <= 100 &&
      (/^#[\da-f]{3,8}$/i.test(value) || /^(?:rgba?|hsla?|oklch|oklab|lab|lch)\([\d\s.,%+\-/]+\)$/i.test(value));
    if (solid && CSS.supports('color', value)) root.style.setProperty(property, value);
    else root.style.removeProperty(property);
  }
  for (const [key, property] of [['bodyFont','--host-body-font'], ['headingFont','--host-heading-font']]) {
    const value = values[key];
    if (typeof value === 'string' && value.length <= 240 && /^[\p{L}\p{N}\s,'"_-]+$/u.test(value) && CSS.supports('font-family', value))
      root.style.setProperty(property, value);
    else root.style.removeProperty(property);
  }
  for (const [key, property, min, max, unit] of [
    ['fontSize','--host-font-size',12,40,'px'], ['lineHeight','--host-line-height',1.2,2.5,'']
  ] as const) {
    const value = values[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max)
      root.style.setProperty(property, `${value}${unit}`);
    else root.style.removeProperty(property);
  }
}
