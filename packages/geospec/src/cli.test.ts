import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { runGeoSpecCli } from '#cli.js';

const temporaryDirectories: string[] = [];

const createTemporaryProject = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'geospec-cli-'));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('runGeoSpecCli', () => {
  it('should return a failing exit code when no GeoSpec files exist', async () => {
    const projectPath = await createTemporaryProject();
    const stderr: string[] = [];

    const exitCode = await runGeoSpecCli({
      argv: ['run', '.'],
      cwd: projectPath,
      stderr(message) {
        stderr.push(message);
      },
      stdout() {
        return undefined;
      },
    });

    expect(exitCode).toBe(1);
    expect(stderr).toEqual(['No matching *.geospec.ts or *.geospec.js files found.']);
  });

  it('should run discovered GeoSpec files from Node', async () => {
    const projectPath = await createTemporaryProject();
    const stdout: string[] = [];
    await writeFile(
      join(projectPath, 'box.geospec.ts'),
      [
        "import { describe, it } from 'geospec';",
        "describe('box', () => {",
        "  it('should run in the Node CLI', () => {});",
        '});',
      ].join('\n'),
      'utf8',
    );

    const exitCode = await runGeoSpecCli({
      argv: ['run', '.'],
      cwd: projectPath,
      stderr() {
        return undefined;
      },
      stdout(message) {
        stdout.push(message);
      },
    });

    expect(exitCode).toBe(0);
    expect(stdout).toEqual(['1 passed, 0 failed']);
  });

  it('should run OpenSCAD source-file GeoSpec tests from Node', { timeout: 120_000 }, async () => {
    const projectPath = await createTemporaryProject();
    const stdout: string[] = [];
    await writeFile(
      join(projectPath, 'main.scad'),
      [
        '$fa = 2;',
        '$fs = 0.4;',
        'difference() {',
        '  cube([50, 50, 50], center = true);',
        '  cylinder(h = 60, r = 10, center = true);',
        '}',
      ].join('\n'),
      'utf8',
    );
    await writeFile(
      join(projectPath, 'main.geospec.ts'),
      [
        "import { describe, expectGeo, it } from 'geospec';",
        "import { loadModel } from 'geospec/model';",
        "describe('OpenSCAD cube cutout', () => {",
        "  it('should test the source file directly', async () => {",
        "    const model = await loadModel({ file: 'main.scad' });",
        '    expectGeo(model).toHaveBoundingBox({ size: { x: 50, y: 50, z: 50 }, tolerance: 1 });',
        '    expectGeo(model).toHaveBoundingBox({ center: { x: 0, y: 0, z: 0 }, tolerance: 0.5 });',
        '    expectGeo(model).toHaveConnectedComponents({ count: 1 });',
        '    expectGeo(model).toBeWatertight();',
        '  });',
        '});',
      ].join('\n'),
      'utf8',
    );

    const exitCode = await runGeoSpecCli({
      argv: ['run', '.', '--test-timeout', '120000'],
      cwd: projectPath,
      stderr() {
        return undefined;
      },
      stdout(message) {
        stdout.push(message);
      },
    });

    expect(exitCode).toBe(0);
    expect(stdout).toEqual(['1 passed, 0 failed']);
  });

  it('should run Replicad source-file GeoSpec tests from Node with CLI filters', { timeout: 120_000 }, async () => {
    const projectPath = await createTemporaryProject();
    const stdout: string[] = [];
    await writeFile(
      join(projectPath, 'main.ts'),
      [
        "import { makeBaseBox } from 'replicad';",
        '',
        'export default function main() {',
        '  return makeBaseBox(10, 20, 30);',
        '}',
      ].join('\n'),
      'utf8',
    );
    await writeFile(
      join(projectPath, 'main.geospec.ts'),
      [
        "import { describe, expectGeo, it } from 'geospec';",
        "import { loadModel } from 'geospec/model';",
        "describe('Replicad cuboid', () => {",
        "  it('should check the width in millimeters', async () => {",
        "    const model = await loadModel({ file: 'main.ts' });",
        '    expectGeo(model).toHaveBoundingBox({ size: { x: 10 }, tolerance: 0.1 });',
        '  });',
        "  it('should check the height in millimeters', async () => {",
        "    const model = await loadModel({ file: 'main.ts' });",
        '    expectGeo(model).toHaveBoundingBox({ size: { z: 30 }, tolerance: 0.1 });',
        '  });',
        '});',
      ].join('\n'),
      'utf8',
    );

    const exitCode = await runGeoSpecCli({
      argv: ['run', '.', '--file', 'main.geospec.ts', '--test-name-pattern', 'height', '--test-timeout', '120000'],
      cwd: projectPath,
      stderr() {
        return undefined;
      },
      stdout(message) {
        stdout.push(message);
      },
    });

    expect(exitCode).toBe(0);
    expect(stdout).toEqual(['1 passed, 0 failed']);
  });

  it('should print structured GeoSpec failures from Node', async () => {
    const projectPath = await createTemporaryProject();
    const stderr: string[] = [];
    const stdout: string[] = [];
    await writeFile(
      join(projectPath, 'box.geospec.ts'),
      [
        "import { describe, expectGeo, it } from 'geospec';",
        "describe('box', () => {",
        "  it('should fail unsupported subjects', () => {",
        "    expectGeo({ kind: 'box' }).toBeWatertight();",
        '  });',
        '});',
      ].join('\n'),
      'utf8',
    );

    const exitCode = await runGeoSpecCli({
      argv: ['run', '.'],
      cwd: projectPath,
      stderr(message) {
        stderr.push(message);
      },
      stdout(message) {
        stdout.push(message);
      },
    });

    expect(exitCode).toBe(1);
    expect(stderr).toEqual([
      'FAIL box.geospec.ts box > should fail unsupported subjects',
      '  toBeWatertight requires a GeoSpec GeometrySubject loaded from geometry evidence.',
    ]);
    expect(stdout).toEqual(['0 passed, 1 failed']);
  });

  it('should filter discovered files with a GeoSpec glob pattern', async () => {
    const projectPath = await createTemporaryProject();
    const nestedDirectory = join(projectPath, 'nested');
    await mkdir(nestedDirectory);
    await writeFile(
      join(projectPath, 'root.geospec.ts'),
      [
        "import { describe, it } from 'geospec';",
        "describe('root', () => {",
        "  it('should not run when the pattern excludes it', () => {});",
        '});',
      ].join('\n'),
      'utf8',
    );
    await writeFile(
      join(nestedDirectory, 'box.geospec.ts'),
      [
        "import { describe, it } from 'geospec';",
        "describe('nested', () => {",
        "  it('should run when the pattern includes it', () => {});",
        '});',
      ].join('\n'),
      'utf8',
    );
    const stdout: string[] = [];

    const exitCode = await runGeoSpecCli({
      argv: ['run', '.', '--pattern', 'nested/**/*.geospec.ts'],
      cwd: projectPath,
      stderr() {
        return undefined;
      },
      stdout(message) {
        stdout.push(message);
      },
    });

    expect(exitCode).toBe(0);
    expect(stdout).toEqual(['1 passed, 0 failed']);
  });

  it('should filter collected tests by test name pattern', async () => {
    const projectPath = await createTemporaryProject();
    const stdout: string[] = [];
    await writeFile(
      join(projectPath, 'box.geospec.ts'),
      [
        "import { describe, it } from 'geospec';",
        "describe('box', () => {",
        "  it('should check width', () => {});",
        "  it('should check height', () => {});",
        '});',
      ].join('\n'),
      'utf8',
    );

    const exitCode = await runGeoSpecCli({
      argv: ['run', '.', '--test-name-pattern', 'width'],
      cwd: projectPath,
      stderr() {
        return undefined;
      },
      stdout(message) {
        stdout.push(message);
      },
    });

    expect(exitCode).toBe(0);
    expect(stdout).toEqual(['1 passed, 0 failed']);
  });

  it('should fail when filters select no GeoSpec tests', async () => {
    const projectPath = await createTemporaryProject();
    const stderr: string[] = [];
    const stdout: string[] = [];
    await writeFile(
      join(projectPath, 'box.geospec.ts'),
      [
        "import { describe, it } from 'geospec';",
        "describe('box', () => {",
        "  it('should check width', () => {});",
        '});',
      ].join('\n'),
      'utf8',
    );

    const exitCode = await runGeoSpecCli({
      argv: ['run', '.', '--test-name-pattern', 'missing'],
      cwd: projectPath,
      stderr(message) {
        stderr.push(message);
      },
      stdout(message) {
        stdout.push(message);
      },
    });

    expect(exitCode).toBe(1);
    expect(stderr).toEqual(['No matching GeoSpec tests were selected by the supplied filters.']);
    expect(stdout).toEqual(['0 passed, 1 failed']);
  });

  it('should include structured zero-test diagnostics in JSON output', async () => {
    const projectPath = await createTemporaryProject();
    const stdout: string[] = [];
    await writeFile(
      join(projectPath, 'box.geospec.ts'),
      [
        "import { describe, it } from 'geospec';",
        "describe('box', () => {",
        "  it('should check width', () => {});",
        '});',
      ].join('\n'),
      'utf8',
    );

    const exitCode = await runGeoSpecCli({
      argv: ['run', '.', '--test-name-pattern', 'missing', '--json'],
      cwd: projectPath,
      stderr() {
        return undefined;
      },
      stdout(message) {
        stdout.push(message);
      },
    });

    expect(exitCode).toBe(1);
    expect(JSON.parse(stdout.join('\n'))).toEqual(
      expect.objectContaining({
        success: false,
        passed: 0,
        failed: 1,
        issues: [
          {
            code: 'NO_MATCHING_GEOSPEC_TESTS',
            message: 'No matching GeoSpec tests were selected by the supplied filters.',
            severity: 'error',
            type: 'runtime',
          },
        ],
      }),
    );
  });

  it('should run broad measurement and BRep assertions from an explicit file', async () => {
    const projectPath = await createTemporaryProject();
    const stdout: string[] = [];
    await writeFile(
      join(projectPath, 'fixture.geospec.ts'),
      [
        "import { describe, expectGeo, it } from 'geospec';",
        'const subject = {',
        "  kind: 'geometry-subject',",
        "  capabilities: [{ kind: 'mesh', feature: 'mass-properties' }, { kind: 'brep', feature: 'planar-faces' }],",
        "  provenance: { source: { kind: 'mesh-buffer', format: 'mesh-buffer', name: 'fixture' }, unit: 'mm', loader: 'cli-test' },",
        '  diagnostics: [],',
        "  mesh: { format: 'mesh-buffer', stats: {",
        '    boundingBox: { center: [0, 0, 10], size: [40, 30, 20], primitives: [] },',
        '    meshQuality: { triangleCount: 12, nonFiniteVertices: [], degenerateTriangles: [], duplicateFaces: [], triangles: [], surfaceArea: 5200, signedVolume: 24000, centerOfMass: [0, 0, 10] },',
        '    connectedComponents: () => 1,',
        '    analyseConnectedComponents: () => ({ count: 1, clusters: [], gaps: [] }),',
        '    watertight: true,',
        '    analyseWatertight: () => ({ watertight: true, irregularEdges: 0, openBoundaryEdges: 0, totalEdges: 18, irregularEdgeFraction: 0, perPrimitive: [] }),',
        '    vertexCount: 8, meshCount: 1, triangleCount: 12,',
        '  } },',
        '  brep: {',
        '    massProperties: { surfaceArea: 5200, volume: 24000, centerOfMass: [0, 0, 10], mass: 18.84 },',
        '    planarFaces: [{ normal: [0, 0, 1], offset: 20, area: 6000 }],',
        "    cylindricalFaces: [{ radius: 15, axis: 'z' }],",
        "    circularHoles: [{ diameter: 8, through: true, axis: 'z', center: [25, 15, 0] }],",
        "    chamferFeatures: [{ distance: 2, selection: 'outer top perimeter' }],",
        '    minimumWallThickness: { value: 2.5, location: [0, 0, 0] },',
        '  },',
        '};',
        "describe('broad fixture', () => {",
        "  it('should validate measurements and initial BRep features', () => {",
        '    expectGeo(subject).toHaveBoundingBox({ size: { x: 40, y: 30, z: 20 }, tolerance: 0.001 });',
        '    expectGeo(subject).toHaveSurfaceArea({ value: 5200, tolerance: 0.001 });',
        '    expectGeo(subject).toHaveVolume({ value: 24000, tolerance: 0.001 });',
        '    expectGeo(subject).toHaveMass({ value: 18.84, tolerance: 0.001 });',
        '    expectGeo(subject).toHaveCenterOfMass({ point: { x: 0, y: 0, z: 10 }, tolerance: 0.001 });',
        '    expectGeo(subject).toHavePlanarFace({ normal: { x: 0, y: 0, z: 1 }, offset: 20, area: { greaterThan: 5000 }, tolerance: 0.05 });',
        "    expectGeo(subject).toHaveCylindricalFace({ radius: 15, axis: 'z', tolerance: 0.05 });",
        "    expectGeo(subject).toHaveCircularHole({ diameter: 8, through: true, axis: 'z', center: { x: 25, y: 15 }, tolerance: 0.05 });",
        "    expectGeo(subject).toHaveChamferFeature({ distance: 2, selection: 'outer top perimeter', tolerance: 0.05 });",
        '    expectGeo(subject).toHaveMinimumWallThickness({ value: { greaterThanOrEqual: 2 }, tolerance: 0.05 });',
        '  });',
        '});',
      ].join('\n'),
      'utf8',
    );

    const exitCode = await runGeoSpecCli({
      argv: ['run', '.', '--file', 'fixture.geospec.ts'],
      cwd: projectPath,
      stderr() {
        return undefined;
      },
      stdout(message) {
        stdout.push(message);
      },
    });

    expect(exitCode).toBe(0);
    expect(stdout).toEqual(['1 passed, 0 failed']);
  });

  it('should emit machine-readable JSON for CLI consumers', async () => {
    const projectPath = await createTemporaryProject();
    const stdout: string[] = [];
    await writeFile(
      join(projectPath, 'box.geospec.ts'),
      [
        "import { describe, it } from 'geospec';",
        "describe('box', () => {",
        "  it('should run in JSON mode', () => {});",
        '});',
      ].join('\n'),
      'utf8',
    );

    const exitCode = await runGeoSpecCli({
      argv: ['run', '.', '--json'],
      cwd: projectPath,
      stderr() {
        return undefined;
      },
      stdout(message) {
        stdout.push(message);
      },
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout.join('\n'))).toEqual(
      expect.objectContaining({
        success: true,
        passed: 1,
        failed: 0,
        files: [
          expect.objectContaining({
            file: 'box.geospec.ts',
            success: true,
          }),
        ],
      }),
    );
  });
});
