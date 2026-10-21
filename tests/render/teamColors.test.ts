import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PARTNER_COLORS, TEAM_COLORS } from '../../src/render/teamColors';

/** Valeur d'une variable de `theme.css`, en nombre (`#3cc4ff` → 0x3cc4ff). */
function themeColor(name: string): number {
  const css = readFileSync(new URL('../../src/ui/theme.css', import.meta.url), 'utf8');
  const match = css.match(new RegExp(`--${name}:\\s*#([0-9a-fA-F]{6});`));
  if (!match) throw new Error(`--${name} absente de theme.css`);
  return parseInt(match[1]!, 16);
}

describe('couleurs d’équipe', () => {
  it('la 3D et l’interface ont les mêmes', () => {
    expect(themeColor('blue')).toBe(TEAM_COLORS[0]);
    expect(themeColor('red')).toBe(TEAM_COLORS[1]);
    expect(themeColor('blue-partner')).toBe(PARTNER_COLORS[0]);
    expect(themeColor('red-partner')).toBe(PARTNER_COLORS[1]);
  });
});
