import { describe, expect, it } from 'vitest';
import { geoSpecCheckSpecPath, planGeoSpecCheck, validitySpecSource } from '#cli/check.js';

/** The names of the tests a spec source declares. */
const testNames = (source: string): string[] =>
  [...source.matchAll(/^ {2}it\("(?<name>[^"]+)"/gmu)].map((match) => match.groups!['name']!);

describe('validitySpecSource', () => {
  it('should hold a GLB to mesh integrity and a STEP file to a valid BRep, one test per claim', () => {
    expect(testNames(validitySpecSource({ file: 'part.glb', format: 'glb' }))).toStrictEqual([
      'loads without error diagnostics',
      'has mesh integrity',
      'is watertight',
      'has a bounding box with positive size',
    ]);
    expect(testNames(validitySpecSource({ file: 'part.step', format: 'step', components: 2 }))).toStrictEqual([
      'loads without error diagnostics',
      'is a valid BRep with closed shells',
      'is watertight',
      'has a bounding box with positive size',
      'has 2 connected components',
    ]);
  });

  it('should load the file as a direct source in its format, quoting the name', () => {
    const source = validitySpecSource({ file: 'it\'s "odd".step', format: 'step' });

    expect(source).toContain(String.raw`loadModel({ source: "it's \"odd\".step", format: 'step' })`);
    expect(source).toContain('expectGeo(model).toBeValidBrep({ closedShells: true });');
    expect(source).not.toContain('toHaveConnectedComponents');
  });
});

describe('planGeoSpecCheck', () => {
  it("should root the project at the model's folder and serve the spec there", () => {
    const plan = planGeoSpecCheck({ file: 'parts/Bracket.STP', json: false }, '/work');

    expect(plan).toStrictEqual({
      projectPath: '/work/parts',
      file: 'Bracket.STP',
      sources: { [geoSpecCheckSpecPath]: validitySpecSource({ file: 'Bracket.STP', format: 'step' }) },
    });
    expect(planGeoSpecCheck({ file: '/models/cube.glb', json: true }, '/work')).toMatchObject({
      projectPath: '/models',
      file: 'cube.glb',
    });
  });

  it('should refuse a file that is neither STEP nor GLB', () => {
    expect(planGeoSpecCheck({ file: 'mesh.gltf', json: false }, '/work')).toStrictEqual({
      error: "geospec check reads .step, .stp or .glb files, not 'mesh.gltf'.",
    });
  });
});
