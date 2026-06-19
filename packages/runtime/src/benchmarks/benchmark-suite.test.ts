// eslint-disable-next-line @nx/enforce-module-boundaries -- Benchmark fixtures are allowed dev inputs.
import { loadFixture } from '@taucad/tau-examples/fixtures';
import { describe, expect, it } from 'vitest';
import { benchmarkSuite, filterBenchmarks } from '#benchmarks/benchmark-suite.js';

describe('benchmarkSuite V8 stress fixtures', () => {
  it('registers the original and BRep-native V8 examples as stress benchmarks', () => {
    const stressNames = filterBenchmarks(['stress']).map((benchmark) => benchmark.name);

    expect(stressNames).toContain('v8-engine-block');
    expect(stressNames).toContain('v8-engine-brep');
    expect(filterBenchmarks(['v8-engine-brep'])).toHaveLength(1);
    expect(benchmarkSuite.some((benchmark) => benchmark.name === 'v8-engine-brep')).toBe(true);
  });

  it('keeps the BRep-native V8 fixture free of pairwise boolean chains', () => {
    const fixture = loadFixture('replicad', 'v8-engine-brep');
    const source = Object.values(fixture.files).join('\n');

    expect(source).toContain('CompoundSketch');
    expect(source).toContain('p.bores');
    expect(source).not.toMatch(/\.(?:cut|fuse|intersect)\(/);
    expect(source).not.toContain('i < 4');
    expect(source).not.toContain('toothSlots');
  });
});
