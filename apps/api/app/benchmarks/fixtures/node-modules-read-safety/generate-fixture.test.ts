// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  defaultTargetBytes,
  generateFakeOpencascadeDts,
} from '#benchmarks/fixtures/node-modules-read-safety/generate-fixture.js';

describe('generateFakeOpencascadeDts', () => {
  it('should be deterministic — two invocations produce byte-identical output', () => {
    const first = generateFakeOpencascadeDts({ targetBytes: 64 * 1024 });
    const second = generateFakeOpencascadeDts({ targetBytes: 64 * 1024 });
    expect(first).toBe(second);
  });

  it('should emit at least targetBytes of content', () => {
    const targetBytes = 32 * 1024;
    const content = generateFakeOpencascadeDts({ targetBytes });
    expect(content.length).toBeGreaterThanOrEqual(targetBytes);
  });

  it('should expose a Bezier_Curve_N declaration suitable for narrow grep regression coverage', () => {
    const content = generateFakeOpencascadeDts({ targetBytes: 4 * 1024 });
    expect(content).toMatch(/export declare class Bezier_Curve_1 {/);
    expect(content).toMatch(/Total synthetic symbols: \d+/);
  });

  it('should default to a 5 MB target byte size', () => {
    expect(defaultTargetBytes).toBe(5 * 1024 * 1024);
  });
});
