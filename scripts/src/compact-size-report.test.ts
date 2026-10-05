import { describe, expect, it } from 'vitest';
import { compactSizeReport } from '#compact-size-report.js';

const report = (rows: string[]): string =>
  ['## size-limit report 📦 ', '| Path | Size |', '| --- | --- |', ...rows].join('\r\n');

describe('compactSizeReport', () => {
  it('should show only increases above the collapsed full comparison, largest first', () => {
    const body = report([
      '| unchanged: total | 2.62 KB (0%) |',
      '| smaller: total | 9 KB (-10% 🔽) |',
      '| small: total — measured previously | 5 KB (+0.01% 🔺) |',
      '| large: total | 12 KB (+20% 🔺) |',
    ]);
    const result = compactSizeReport(body);
    const visible = result.split('<details>')[0] ?? '';

    expect(visible).toContain('2 bundle size increases');
    expect(visible).toContain('| large: total | 12 KB | +20% |');
    expect(visible).toContain('| small: total | 5 KB | +0.01% |');
    expect(visible.indexOf('large: total')).toBeLessThan(visible.indexOf('small: total'));
    expect(visible).not.toContain('unchanged: total');
    expect(visible).not.toContain('smaller: total');
    expect(visible).not.toContain('measured previously');
    expect(result).toContain('<summary>Full comparison (4 entries)</summary>\n\n| Path | Size |');
    expect(result).toContain('unchanged: total');
    expect(result).toContain('smaller: total');
    expect(result).not.toContain('<details open');
  });

  it('should keep an all-unchanged or smaller report to one visible sentence', () => {
    const result = compactSizeReport(report(['| a | 1 KB (0%) |', '| b | 2 KB (-1% 🔽) |']));

    expect(result.split('<details>')[0]).toBe('## size-limit report 📦 \n\nNo bundle size increases.\n\n');
    expect(result).toContain('<summary>Full comparison (2 entries)</summary>');
  });

  it('should collapse increases beyond the ten largest', () => {
    const result = compactSizeReport(
      report(Array.from({ length: 12 }, (_, index) => `| package-${index} | 1 KB (+${index + 1}% 🔺) |`)),
    );
    const visible = result.split('<details>')[0] ?? '';

    expect(visible).toContain('12 bundle size increases');
    expect(visible).toContain('Showing the 10 largest percentage increases.');
    expect(visible).toContain('| package-11 | 1 KB | +12% |');
    expect(visible).not.toContain('| package-0 |');
    expect(result).toContain('<summary>2 more size increases</summary>');
    expect(result).toContain('| package-0 | 1 KB | +1% |');
  });

  it('should use only the size column when performance timings also increase', () => {
    const body = [
      '## size-limit report 📦 ',
      '| Path | Size | Loading time (3g) | Running time (snapdragon) | Total time |',
      '| --- | --- | --- | --- | --- |',
      '| a | 1 KB (0%) | 10 ms (+100% 🔺) | 2 ms (0%) | 12 ms |',
      '| b | 2 KB (+1% 🔺) | 10 ms (0%) | 2 ms (0%) | 12 ms |',
    ].join('\n');

    expect(compactSizeReport(body).split('<details>')[0]).toContain('1 bundle size increase');
    expect(compactSizeReport(body).split('<details>')[0]).not.toContain('| a |');
  });

  it('should preserve an already compacted report on reruns', () => {
    const result = compactSizeReport(report(['| a | 1 KB (+100% 🔺) |']));

    expect(compactSizeReport(result)).toBe(result);
  });

  it('should reject an unrecognized report rather than claim there are no increases', () => {
    expect(() => compactSizeReport('Build failed')).toThrow('Unrecognized size-limit report');
    expect(() => compactSizeReport('Build failed')).toThrow(Error);
  });
});
