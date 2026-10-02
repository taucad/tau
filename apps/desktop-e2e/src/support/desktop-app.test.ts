import { describe, expect, it } from 'vitest';
import { desktopDescendants } from '#support/desktop-app.js';

describe('desktop process ownership', () => {
  const snapshot =
    '100 1 Tau\n101 100 renderer\n102 101 PicoGK Worker\n103 102 PicoGK Nested Viewer\n200 1 PicoGK Foreign Viewer\n300 301 cycle\n301 300 PicoGK Cycle Viewer';

  it('should ignore foreign Viewers and retain every owned descendant command', () => {
    expect(desktopDescendants(100, '100 1 Tau\n101 100 PicoGK Direct Viewer')).toEqual([
      { pid: 101, command: 'PicoGK Direct Viewer' },
    ]);
    expect(desktopDescendants(100, snapshot)).toEqual([
      { pid: 101, command: 'renderer' },
      { pid: 102, command: 'PicoGK Worker' },
      { pid: 103, command: 'PicoGK Nested Viewer' },
    ]);
    expect(
      desktopDescendants(100, snapshot)
        .map(({ command }) => command)
        .join('\n'),
    ).toMatch(/PicoGK.*Viewer/u);
    expect(
      desktopDescendants(100, '100 1 Tau\n101 100 renderer\n200 1 PicoGK Foreign Viewer')
        .map(({ command }) => command)
        .join('\n'),
    ).not.toMatch(/PicoGK.*Viewer/u);
  });

  it.each([undefined, 0, -1, Number.NaN, 1.5, 999])('should refuse invalid or absent owner %s', (owner) => {
    expect(() => desktopDescendants(owner, snapshot)).toThrow('Electron owner is absent or invalid');
    expect(() => desktopDescendants(owner, snapshot)).toThrow(Error);
  });
});
