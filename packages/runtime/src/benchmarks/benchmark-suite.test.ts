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
    expect(source).toContain('bankLayouts');
    expect(source).not.toMatch(/\.(?:cut|fuse|intersect)\(/);
    expect(source).not.toContain('i < 4');
    expect(source).not.toContain('toothSlots');
  });

  it('keeps default smooth BRep profiles as curve topology rather than sampled lines', () => {
    const fixture = loadFixture('replicad', 'v8-engine-brep');
    const source = Object.values(fixture.files).join('\n');

    expect(source).toContain('threePointsArcTo');
    expect(source).toContain('capsuleSketch');
    expect(source).toContain('capsuleExtrude');
    expect(source).toContain('revolvedZFromCurvePath');
    expect(source).not.toContain('capSamples');
    expect(source).not.toContain('circlePoints');
    expect(source).not.toContain('hull2d');
    expect(source).not.toContain('capsuleXY');
    expect(source).not.toMatch(/bezier|spline/i);
  });

  it('keeps the production V8 fixture free of preview-only shortcuts', () => {
    const fixture = loadFixture('replicad', 'v8-engine-brep');
    const source = Object.values(fixture.files).join('\n');

    expect(source).toContain('rectangularTubeZ');
    expect(source).toContain('toothedRingProfile');
    expect(source).not.toContain('makeCompound');
    expect(source).not.toContain('boxShellOpenBottom');
    expect(source).not.toMatch(/export function makeIntake\(/);
    expect(source).not.toContain('fuseAll(rest)');
    expect(source).not.toContain('deckAngle: 135');
    expect(source).not.toContain('deckAngle: 45');
  });

  it('keeps the production V8 fixture backed by SysML2 and GeoSpec evidence', () => {
    const fixture = loadFixture('replicad', 'v8-engine-brep');

    expect(Object.keys(fixture.files)).toEqual(
      expect.arrayContaining([
        'spec/v8-engine.sysml2',
        'spec/requirements.ts',
        'geospec/assembly.geospec.ts',
        'geospec/brep-features.geospec.ts',
        'geospec/subsystems.geospec.ts',
        'geospec/parameters.geospec.ts',
        'test-exports/assembly.ts',
        'test-exports/crankshaft.ts',
        'test-exports/piston-body.ts',
        'test-exports/valvetrain.ts',
      ]),
    );
  });

  it('keeps the production V8 fixture mechanically complete across major subsystem families', () => {
    const fixture = loadFixture('replicad', 'v8-engine-brep');
    const source = Object.values(fixture.files).join('\n');

    for (const expected of [
      'makeBottomEndParts',
      'makeValvetrainParts',
      'makeIntakeParts',
      'makeExhaustParts',
      'makeLubricationCoolingParts',
      'makeFastenerAndGasketParts',
      'Piston Ring',
      'Main Bearing',
      'Rod Bearing',
      'Camshaft',
      'Timing Chain',
      'Valve Spring',
      'Rocker Arm',
      'Fuel Injector',
      'Exhaust Collector',
      'Oil Pump',
      'Water Pump',
      'Head Gasket',
    ]) {
      expect(source).toContain(expected);
    }
  });
});
