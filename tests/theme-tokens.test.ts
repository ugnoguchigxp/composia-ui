import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { visualDensitySchema } from '../shared/schemas/visual-intent.schema';
import {
  applyColorTheme,
  applyDensityAndScaleTokens,
  COLOR_THEME_PRESETS,
  DENSITY_PRESETS,
} from '../src/lib/theme-tokens';

function fakeRoot() {
  const attributes = new Map<string, string>();
  const classes = new Set<string>();
  const styles = new Map<string, string>();
  return {
    attributes,
    classList: {
      [Symbol.iterator]: () => classes[Symbol.iterator](),
      add: (className: string) => classes.add(className),
      remove: (className: string) => classes.delete(className),
    },
    getAttribute: (name: string) => attributes.get(name) ?? null,
    removeAttribute: (name: string) => attributes.delete(name),
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    style: {
      setProperty: (name: string, value: string) => styles.set(name, value),
    },
    styles,
  } as unknown as HTMLElement & {
    attributes: Map<string, string>;
    styles: Map<string, string>;
  };
}

describe('theme token contract', () => {
  it('keeps density presets aligned with visual intent density values', () => {
    expect(Object.keys(DENSITY_PRESETS).sort()).toEqual([...visualDensitySchema.options].sort());
  });

  it('keeps color theme presets aligned with CSS data-theme selectors', () => {
    const css = readFileSync('src/styles/themes.css', 'utf8');
    const cssThemes = [...css.matchAll(/:root\[data-theme="([^"]+)"\]/g)]
      .map((match) => match[1])
      .sort();
    const presetThemes = Object.values(COLOR_THEME_PRESETS)
      .map((preset) => preset.dataTheme)
      .filter((theme): theme is string => Boolean(theme))
      .sort();

    expect(presetThemes).toEqual(cssThemes);
  });

  it('applies data-theme and data-density through root attributes', () => {
    const root = fakeRoot();
    root.classList.add('theme-dark');

    applyColorTheme('tokyonight', root);
    applyDensityAndScaleTokens(
      { density: 'spacious', fontScale: 'default', radius: 'default', shadow: 'subtle' },
      root
    );

    expect(root.getAttribute('data-theme')).toBe('tokyonight');
    expect(root.getAttribute('data-density')).toBe('spacious');
    expect([...root.classList]).not.toContain('theme-dark');
    expect(root.styles.get('--spacing-unit')).toBe('1.25');

    applyColorTheme('light', root);
    applyDensityAndScaleTokens(
      { density: 'normal', fontScale: 'default', radius: 'default', shadow: 'subtle' },
      root
    );

    expect(root.getAttribute('data-theme')).toBeNull();
    expect(root.getAttribute('data-density')).toBeNull();
  });
});
