import { describe, expect, it } from 'vitest';
import { isOpenableTerminalLink, outputLines, outputSlices } from '#components/terminal/terminal-output-text.js';

describe('outputLines', () => {
  it('drops CSI, OSC 52, OSC 8, title and DCS sequences and keeps HTML as literal text', () => {
    const hostile = [
      '\u001B[31mred\u001B[0m',
      '\u001B]52;c;aGVsbG8=\u0007copied?',
      '\u001B]8;;javascript:alert(1)\u001B\\link\u001B]8;;\u001B\\',
      '\u001B]0;Allow access\u0007title',
      '\u001BPq#0;2;0;0;0\u001B\\sixel',
      '<img src=x onerror=alert(1)>',
    ].join('\n');
    expect(outputLines(hostile, 20)).toEqual([
      'red',
      'copied?',
      'link',
      'title',
      'sixel',
      '<img src=x onerror=alert(1)>',
    ]);
  });

  it('keeps only the last lines and drops blank ones', () => {
    expect(outputLines('a\n\n  \nb  \r\nc\n', 2)).toEqual(['b', 'c']);
  });
});

describe('isOpenableTerminalLink', () => {
  it('opens http(s) only on a Ctrl or Cmd click', () => {
    expect(isOpenableTerminalLink('https://tau.new/docs', { ctrlKey: true, metaKey: false })).toBe(true);
    expect(isOpenableTerminalLink('http://localhost:3000/', { ctrlKey: false, metaKey: true })).toBe(true);
    expect(isOpenableTerminalLink('https://tau.new/docs', { ctrlKey: false, metaKey: false })).toBe(false);
  });

  it('never follows file, script or custom-scheme links', () => {
    // oxlint-disable-next-line no-script-url -- A script URL in output is the hostile input under test.
    for (const uri of ['file:///etc/passwd', 'javascript:alert(1)', 'tau://host/x', 'app://tau/settings', 'nonsense']) {
      expect(isOpenableTerminalLink(uri, { ctrlKey: true, metaKey: true })).toBe(false);
    }
  });
});

describe('outputSlices', () => {
  it('bounds each slice without splitting a surrogate pair', () => {
    const data = `ab${'😀'.repeat(3)}`;
    const slices = outputSlices(data, 3);
    expect(slices.join('')).toBe(data);
    for (const slice of slices) {
      expect(slice.length).toBeLessThanOrEqual(3);
      expect(slice.isWellFormed()).toBe(true);
    }
    expect(outputSlices('', 4)).toEqual([]);
  });
});
