import { describe, expect, it } from 'vitest';

import { classifyConfig, entryKind, parseLimit, sizeRaiseReport } from '#classify-size-raises.js';

const js = (limit: string, name = 'total (ESM JS) — measured earlier') => ({ name, path: ['dist/**/*.mjs'], limit });
const wasm = (limit: string) => ({ name: 'vendored WASM', path: 'dist/wasm/**/*.wasm', limit });

describe('parseLimit', () => {
  it('should parse limits in decimal units like size-limit, and binary units at 1,024', () => {
    expect(parseLimit('8 kB')).toBe(8000);
    expect(parseLimit('2.5 MB')).toBe(2_500_000);
    expect(parseLimit('500 B')).toBe(500);
    expect(parseLimit('1 KiB')).toBe(1024);
    expect(parseLimit('750')).toBe(750);
  });

  it('should reject an unknown unit', () => {
    expect(() => parseLimit('8 pages')).toThrow("Unrecognized size limit '8 pages'");
  });
});

describe('entryKind', () => {
  it('should treat JavaScript, HTML and CSS as code and everything else as an asset', () => {
    expect(entryKind(js('1 kB'))).toBe('code');
    expect(entryKind({ path: 'dist-app/app.html', limit: '2 MB' })).toBe('code');
    expect(entryKind(wasm('1 MB'))).toBe('asset');
    expect(entryKind({ path: ['dist/**/*.ttf', 'dist/**/*.map'], limit: '1.6 MB' })).toBe('asset');
  });
});

describe('classifyConfig', () => {
  const config = 'packages/plugins/opencascade/.size-limit.json';

  it('should let an agent raise a code entry by up to 10 % and 10 kB, matched by path across a renamed note', () => {
    const [raise] = classifyConfig(config, [js('8.8 kB', 'total (ESM JS) — measured later')], { base: [js('8 kB')] });

    expect(raise).toMatchObject({ name: 'total (ESM JS)', kind: 'code', from: 8000, to: 8800, decision: 'autonomous' });
  });

  it('should send a code raise above 10 % to the operator', () => {
    const [raise] = classifyConfig(config, [js('9 kB')], { base: [js('8 kB')] });

    expect(raise?.decision).toBe('operator');
    expect(raise?.reasons).toEqual(['+12.5 % exceeds 10.0 %']);
  });

  it('should send a code raise above 10 kB to the operator even under 10 %', () => {
    const [raise] = classifyConfig(config, [js('211 kB')], { base: [js('200 kB')] });

    expect(raise?.reasons).toEqual(['+11000 B exceeds 10000 B']);
  });

  it('should hold an asset raise to 5 %', () => {
    expect(classifyConfig(config, [wasm('1.05 MB')], { base: [wasm('1 MB')] })[0]?.decision).toBe('autonomous');
    expect(classifyConfig(config, [wasm('1.06 MB')], { base: [wasm('1 MB')] })[0]?.reasons).toEqual([
      '+6.0 % exceeds 5.0 % for an asset',
    ]);
  });

  it('should send cumulative growth past 20 % since program start to the operator', () => {
    const [raise] = classifyConfig(config, [js('110 kB')], { base: [js('100 kB')], programBase: [js('90 kB')] });

    expect(raise?.reasons).toEqual(['+22.2 % since program start exceeds 20.0 %']);
  });

  it('should send every raise of a reserved entry to the operator', () => {
    const runtime = (limit: string) => ({
      name: 'total (ESM JS)',
      path: ['dist/**/*.mjs', '!dist/**/wasm/**', '!dist/**/fonts/**'],
      limit,
    });
    const [raise] = classifyConfig('packages/runtime/.size-limit.json', [runtime('235 kB')], {
      base: [runtime('234 kB')],
    });

    expect(raise?.reasons).toEqual(['reserved entry']);
  });

  it('should ignore new entries, new files, unchanged and lowered limits', () => {
    expect(classifyConfig(config, [js('8 kB'), wasm('1 MB')], { base: [js('9 kB')] })).toEqual([]);
    expect(classifyConfig(config, [js('8 kB')], { base: undefined })).toEqual([]);
  });
});

describe('sizeRaiseReport', () => {
  it('should render one row per raise with its decision', () => {
    const report = sizeRaiseReport(classifyConfig('a/.size-limit.json', [js('9 kB')], { base: [js('8 kB')] }));

    expect(report).toContain(
      '| a/.size-limit.json | total (ESM JS) | code | 8000 → 9000 B (+12.5 %) | operator: +12.5 % exceeds 10.0 % |',
    );
    expect(sizeRaiseReport([])).toBe('No size budget raises.');
  });
});
