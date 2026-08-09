import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { readGeoSpecTimings } from '#cache/timings.js';
import { runGeoSpecCli } from '#cli.js';

const temporaryDirectories: string[] = [];

// Pin the serial engine (R3): vitest has no module hooks for worker_threads
// .ts entries, so multi-file runs must not auto-route to the pool here. The
// real pool wire is covered by the tsx-spawned CLI in apps/runtime-e2e.
process.env['GEOSPEC_WORKERS'] = '1';
// Isolate the out-of-tree cache root (R5 evidence cache + R1 timings) so CLI
// tests never touch the developer's real cache. Individual tests may override.
process.env['GEOSPEC_CACHE_DIR'] ??= await mkdtemp(join(tmpdir(), 'geospec-cli-cache-'));

/** Drop R1 streaming progress lines so failure-content assertions stay exact. */
const withoutProgress = (lines: readonly string[]): string[] => lines.filter((line) => !line.startsWith('[geospec]'));

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
  it('should document directory-root filters in CLI help', async () => {
    const stdout: string[] = [];

    const exitCode = await runGeoSpecCli({
      argv: ['--help'],
      stdout(message) {
        stdout.push(message);
      },
      stderr() {
        return undefined;
      },
    });

    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).toContain(
      '--file <path>                 GeoSpec file or directory root to run; repeatable',
    );
    expect(stdout.join('\n')).toContain('--include <glob>');
    expect(stdout.join('\n')).toContain('--exclude <glob>');
    expect(stdout.join('\n')).toContain('--testNamePattern <regexp>');
    expect(stdout.join('\n')).not.toContain('--pattern <glob>');
    expect(stdout.join('\n')).not.toContain('--grep');
  });

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
    expect(stdout.join('\n')).toMatch(/^1 passed, 0 failed in \d+(\.\d+)?s$/u);
  });

  it('should run root and nested GeoSpec files recursively from Node', async () => {
    const projectPath = await createTemporaryProject();
    const nestedDirectory = join(projectPath, 'lib');
    const stdout: string[] = [];
    await mkdir(nestedDirectory);
    await writeFile(
      join(projectPath, 'vase.geospec.ts'),
      [
        "import { describe, it } from 'geospec';",
        "describe('vase geometry', () => {",
        "  it('should run the root spec', () => {});",
        '});',
      ].join('\n'),
      'utf8',
    );
    await writeFile(
      join(nestedDirectory, 'vase_variant.geospec.ts'),
      [
        "import { describe, it } from 'geospec';",
        "describe('variant geometry', () => {",
        "  it('should run the nested spec', () => {});",
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
    expect(stdout.join('\n')).toMatch(/^2 passed, 0 failed in \d+(\.\d+)?s$/u);
  });

  it('should run GeoSpec files below a directory root passed through --file', async () => {
    const projectPath = await createTemporaryProject();
    const nestedDirectory = join(projectPath, 'lib');
    const stdout: string[] = [];
    await mkdir(nestedDirectory);
    await writeFile(
      join(projectPath, 'root.geospec.ts'),
      [
        "import { describe, it } from 'geospec';",
        "describe('root', () => {",
        "  it('should not run when lib is selected', () => {});",
        '});',
      ].join('\n'),
      'utf8',
    );
    await writeFile(
      join(nestedDirectory, 'vase_variant.geospec.ts'),
      [
        "import { describe, it } from 'geospec';",
        "describe('variant geometry', () => {",
        "  it('should run from a directory root', () => {});",
        '});',
      ].join('\n'),
      'utf8',
    );

    const exitCode = await runGeoSpecCli({
      argv: ['run', '.', '--file', 'lib'],
      cwd: projectPath,
      stderr() {
        return undefined;
      },
      stdout(message) {
        stdout.push(message);
      },
    });

    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).toMatch(/^1 passed, 0 failed in \d+(\.\d+)?s$/u);
  });

  it('should run an exact nested GeoSpec file passed through --file', async () => {
    const projectPath = await createTemporaryProject();
    const nestedDirectory = join(projectPath, 'lib');
    const stdout: string[] = [];
    await mkdir(nestedDirectory);
    await writeFile(
      join(nestedDirectory, 'vase_variant.geospec.ts'),
      [
        "import { describe, it } from 'geospec';",
        "describe('variant geometry', () => {",
        "  it('should run from an exact nested file', () => {});",
        '});',
      ].join('\n'),
      'utf8',
    );

    const exitCode = await runGeoSpecCli({
      argv: ['run', '.', '--file', 'lib/vase_variant.geospec.ts'],
      cwd: projectPath,
      stderr() {
        return undefined;
      },
      stdout(message) {
        stdout.push(message);
      },
    });

    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).toMatch(/^1 passed, 0 failed in \d+(\.\d+)?s$/u);
  });

  it('should fail when a directory-root filter selects no GeoSpec files', async () => {
    const projectPath = await createTemporaryProject();
    const stderr: string[] = [];
    await mkdir(join(projectPath, 'lib'));
    await writeFile(join(projectPath, 'lib', 'vase_variant.scad'), 'cube([10, 10, 10]);', 'utf8');

    const exitCode = await runGeoSpecCli({
      argv: ['run', '.', '--file', 'lib'],
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

  it('should report source-adapter diagnostics for OpenSCAD source files in generic CLI core', async () => {
    const projectPath = await createTemporaryProject();
    const stdout: string[] = [];
    const stderr: string[] = [];
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
    expect(withoutProgress(stderr)).toEqual([
      'FAIL main.geospec.ts OpenSCAD cube cutout > should test the source file directly',
      '  GeoSpec model loading has no runtime source adapter for .scad files.',
    ]);
    expect(stdout.join('\n')).toMatch(/^0 passed, 1 failed in \d+(\.\d+)?s$/u);
  });

  it('should run parameterized Replicad connected-component tests from Node', { timeout: 120_000 }, async () => {
    const projectPath = await createTemporaryProject();
    const stdout: string[] = [];
    await writeFile(
      join(projectPath, 'main.ts'),
      [
        "import { makeBaseBox, type ShapeConfig } from 'replicad';",
        '',
        'export const defaultParams = { componentCount: 1 };',
        '',
        'export default function main(p = defaultParams): ShapeConfig[] {',
        '  const parameters = { ...defaultParams, ...p };',
        '  return Array.from({ length: parameters.componentCount }, (_, index) => ({',
        '    shape: makeBaseBox(10, 10, 10).translate([index * 20, 0, 0]),',
        "    name: 'Block ' + (index + 1),",
        '  }));',
        '}',
      ].join('\n'),
      'utf8',
    );
    await writeFile(
      join(projectPath, 'main.geospec.ts'),
      [
        "import { describe, expectGeo, it } from 'geospec';",
        "import { loadModel } from 'geospec/model';",
        "describe('Replicad parameterized components', () => {",
        "  it('should have one connected component by default', async () => {",
        "    const model = await loadModel({ file: 'main.ts' });",
        '    expectGeo(model).toHaveConnectedComponents({ count: 1 });',
        '  });',
        "  it('should have three connected components with explicit parameters', async () => {",
        "    const model = await loadModel({ file: 'main.ts', parameters: { componentCount: 3 } });",
        '    expectGeo(model).toHaveConnectedComponents({ count: 3 });',
        '  });',
        '});',
      ].join('\n'),
      'utf8',
    );

    const exitCode = await runGeoSpecCli({
      argv: ['run', '.', '--file', 'main.geospec.ts', '--test-timeout', '120000'],
      cwd: projectPath,
      stderr() {
        return undefined;
      },
      stdout(message) {
        stdout.push(message);
      },
    });

    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).toMatch(/^2 passed, 0 failed in \d+(\.\d+)?s$/u);
  });

  it(
    'should run JSCAD source-file GeoSpec tests from Node through runtime inference',
    { timeout: 120_000 },
    async () => {
      const projectPath = await createTemporaryProject();
      const stdout: string[] = [];
      await writeFile(
        join(projectPath, 'main.ts'),
        [
          "import { primitives, booleans } from '@jscad/modeling';",
          "import type { geometries } from '@jscad/modeling';",
          '',
          'export const defaultParams = {',
          '  cubeSize: 50,',
          '  cylinderRadius: 10,',
          '  cylinderHeight: 60,',
          '};',
          '',
          'export default function main(p = defaultParams): geometries.geom3.Geom3 {',
          '  const cube = primitives.cuboid({ size: [p.cubeSize, p.cubeSize, p.cubeSize], center: [0, 0, p.cubeSize / 2] });',
          '  const cylinder = primitives.cylinder({ radius: p.cylinderRadius, height: p.cylinderHeight, center: [0, 0, p.cubeSize / 2], segments: 64 });',
          '  return booleans.subtract(cube, cylinder);',
          '}',
        ].join('\n'),
        'utf8',
      );
      await writeFile(
        join(projectPath, 'main.geospec.ts'),
        [
          "import { describe, expectGeo, it } from 'geospec';",
          "import { loadModel } from 'geospec/model';",
          "describe('JSCAD cube cutout', () => {",
          "  it('should have the expected bounds', async () => {",
          "    const model = await loadModel({ file: 'main.ts' });",
          '    expectGeo(model).toHaveBoundingBox({ size: { x: 50, y: 50, z: 50 }, center: { x: 0, y: 0, z: 25 }, tolerance: 1 });',
          '  });',
          "  it('should be watertight', async () => {",
          "    const model = await loadModel({ file: 'main.ts' });",
          '    expectGeo(model).toBeWatertight();',
          '  });',
          "  it('should be one connected component', async () => {",
          "    const model = await loadModel({ file: 'main.ts' });",
          '    expectGeo(model).toHaveConnectedComponents({ count: 1 });',
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
      expect(stdout.join('\n')).toMatch(/^3 passed, 0 failed in \d+(\.\d+)?s$/u);
    },
  );

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
    expect(withoutProgress(stderr)).toEqual([
      'FAIL box.geospec.ts box > should fail unsupported subjects',
      '  toBeWatertight requires a GeoSpec GeometrySubject loaded from geometry evidence.',
    ]);
    expect(stdout.join('\n')).toMatch(/^0 passed, 1 failed in \d+(\.\d+)?s$/u);
  });

  it('should include structured failed-test diagnostics in JSON output', async () => {
    const projectPath = await createTemporaryProject();
    const stdout: string[] = [];
    await writeFile(
      join(projectPath, 'box.geospec.ts'),
      [
        "import { describe, expectGeo, it } from 'geospec';",
        "describe('box', () => {",
        "  it('should fail unsupported subjects with diagnostics', () => {",
        "    expectGeo({ kind: 'box' }).toBeWatertight();",
        '  });',
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

    expect(exitCode).toBe(1);
    expect(JSON.parse(stdout.join('\n'))).toEqual(
      expect.objectContaining({
        success: false,
        files: [
          expect.objectContaining({
            file: 'box.geospec.ts',
            success: false,
            tests: [
              expect.objectContaining({
                status: 'failed',
                diagnostics: [
                  expect.objectContaining({
                    code: 'UNSUPPORTED_GEOMETRY_SUBJECT',
                    severity: 'error',
                    message: 'toBeWatertight requires a GeoSpec GeometrySubject loaded from geometry evidence.',
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    );
  });

  it('should include discovered files with repeatable Vitest-style include globs', async () => {
    const projectPath = await createTemporaryProject();
    const nestedDirectory = join(projectPath, 'nested');
    await mkdir(nestedDirectory);
    await writeFile(
      join(projectPath, 'root.geospec.ts'),
      [
        "import { describe, it } from 'geospec';",
        "describe('root', () => {",
        "  it('should not run when include excludes it', () => {});",
        '});',
      ].join('\n'),
      'utf8',
    );
    await writeFile(
      join(nestedDirectory, 'box.geospec.ts'),
      [
        "import { describe, it } from 'geospec';",
        "describe('nested', () => {",
        "  it('should run when include selects it', () => {});",
        '});',
      ].join('\n'),
      'utf8',
    );
    const stdout: string[] = [];

    const exitCode = await runGeoSpecCli({
      argv: ['run', '.', '--include', 'nested/**/*.geospec.ts', '--include', 'missing/**/*.geospec.ts'],
      cwd: projectPath,
      stderr() {
        return undefined;
      },
      stdout(message) {
        stdout.push(message);
      },
    });

    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).toMatch(/^1 passed, 0 failed in \d+(\.\d+)?s$/u);
  });

  it('should exclude discovered files with repeatable Vitest-style exclude globs', async () => {
    const projectPath = await createTemporaryProject();
    const nestedDirectory = join(projectPath, 'nested');
    await mkdir(nestedDirectory);
    await writeFile(
      join(projectPath, 'root.geospec.ts'),
      [
        "import { describe, it } from 'geospec';",
        "describe('root', () => {",
        "  it('should run when not excluded', () => {});",
        '});',
      ].join('\n'),
      'utf8',
    );
    await writeFile(
      join(nestedDirectory, 'slow.geospec.ts'),
      [
        "import { describe, it } from 'geospec';",
        "describe('nested slow', () => {",
        "  it('should not run when excluded', () => {});",
        '});',
      ].join('\n'),
      'utf8',
    );
    const stdout: string[] = [];

    const exitCode = await runGeoSpecCli({
      argv: ['run', '.', '--exclude', 'nested/**/*.geospec.ts', '--exclude', '**/*.fixture.geospec.ts'],
      cwd: projectPath,
      stderr() {
        return undefined;
      },
      stdout(message) {
        stdout.push(message);
      },
    });

    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).toMatch(/^1 passed, 0 failed in \d+(\.\d+)?s$/u);
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
      argv: ['run', '.', '--testNamePattern', 'width$'],
      cwd: projectPath,
      stderr() {
        return undefined;
      },
      stdout(message) {
        stdout.push(message);
      },
    });

    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).toMatch(/^1 passed, 0 failed in \d+(\.\d+)?s$/u);
  });

  it('should run all tests except a named check with negative-lookahead testNamePattern', async () => {
    const projectPath = await createTemporaryProject();
    const stdout: string[] = [];
    await writeFile(
      join(projectPath, 'gear.geospec.ts'),
      [
        "import { describe, it } from 'geospec';",
        "describe('planetary gearbox assembly', () => {",
        "  it('should check carrier spacing', () => {});",
        "  it('has correctly phased gear teeth (no meshing interference)', () => {",
        "    throw new Error('known failing check should not run');",
        '  });',
        '});',
      ].join('\n'),
      'utf8',
    );

    const exitCode = await runGeoSpecCli({
      argv: ['run', '.', '-t', '^(?!.*no meshing interference).*'],
      cwd: projectPath,
      stderr() {
        return undefined;
      },
      stdout(message) {
        stdout.push(message);
      },
    });

    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).toMatch(/^1 passed, 0 failed in \d+(\.\d+)?s$/u);
  });

  it('should fail clearly when testNamePattern is not a valid regex', async () => {
    const projectPath = await createTemporaryProject();
    const stderr: string[] = [];
    await writeFile(
      join(projectPath, 'box.geospec.ts'),
      [
        "import { describe, it } from 'geospec';",
        "describe('box', () => {",
        "  it('should not execute', () => {});",
        '});',
      ].join('\n'),
      'utf8',
    );

    const exitCode = await runGeoSpecCli({
      argv: ['run', '.', '--test-name-pattern', '['],
      cwd: projectPath,
      stderr(message) {
        stderr.push(message);
      },
      stdout() {
        return undefined;
      },
    });

    expect(exitCode).toBe(1);
    expect(withoutProgress(stderr)).toEqual([
      'FAIL box.geospec.ts',
      '  testNamePattern is not a valid JavaScript regular expression.',
    ]);
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
    expect(withoutProgress(stderr)).toEqual(['No matching GeoSpec tests were selected by the supplied filters.']);
    expect(stdout.join('\n')).toMatch(/^0 passed, 1 failed in \d+(\.\d+)?s$/u);
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
        '    analyseWatertight: () => ({ watertight: true, irregularEdges: 0, openBoundaryEdges: 0, nonManifoldEdges: 0, irregularEdgeKindCounts: { openBoundary: 0, nonManifold: 0 }, irregularEdgeClusters: [], totalEdges: 18, irregularEdgeFraction: 0, perPrimitive: [] }),',
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
    expect(stdout.join('\n')).toMatch(/^1 passed, 0 failed in \d+(\.\d+)?s$/u);
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

  describe('streaming results and durations (R1)', () => {
    const writePassingSpec = async (projectPath: string, name: string): Promise<void> => {
      await writeFile(
        join(projectPath, name),
        [
          "import { describe, it } from 'geospec';",
          "describe('box', () => {",
          "  it('should pass', () => {});",
          '});',
        ].join('\n'),
        'utf8',
      );
    };

    const writeFailingSpec = async (projectPath: string, name: string): Promise<void> => {
      await writeFile(
        join(projectPath, name),
        [
          "import { describe, it } from 'geospec';",
          "describe('box', () => {",
          "  it('should fail', () => { throw new Error('red'); });",
          '});',
        ].join('\n'),
        'utf8',
      );
    };

    it('should stream file progress to stderr by default', async () => {
      const projectPath = await createTemporaryProject();
      process.env['GEOSPEC_CACHE_DIR'] = join(projectPath, '.cache');
      try {
        await writePassingSpec(projectPath, 'box.geospec.ts');
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
        expect(exitCode).toBe(0);
        const output = stderr.join('\n');
        expect(output).toContain('[geospec] run 1 file(s)');
        expect(output).toContain('[geospec] ▶ box.geospec.ts');
        expect(output).toMatch(/\[geospec\] ✓ box\.geospec\.ts pass \d+(\.\d+)?s/u);
      } finally {
        delete process.env['GEOSPEC_CACHE_DIR'];
      }
    });

    it('should emit one JSON object per event with --reporter jsonl, including per-test durations', async () => {
      const projectPath = await createTemporaryProject();
      process.env['GEOSPEC_CACHE_DIR'] = join(projectPath, '.cache');
      try {
        await writePassingSpec(projectPath, 'box.geospec.ts');
        const stdout: string[] = [];
        const exitCode = await runGeoSpecCli({
          argv: ['run', '.', '--reporter', 'jsonl'],
          cwd: projectPath,
          stderr() {
            return undefined;
          },
          stdout(message) {
            stdout.push(message);
          },
        });
        expect(exitCode).toBe(0);
        const events = stdout.map((line) => JSON.parse(line) as Record<string, unknown>);
        expect(events.map((event) => event['event'])).toEqual([
          'run-start',
          'file-start',
          'file-complete',
          'run-complete',
        ]);
        const fileComplete = events[2] as {
          file: string;
          success: boolean;
          durationMs: number;
          tests: Array<{ name: string; status: string; durationMs?: number }>;
        };
        expect(fileComplete.file).toBe('box.geospec.ts');
        expect(fileComplete.success).toBe(true);
        expect(fileComplete.durationMs).toBeGreaterThan(0);
        expect(fileComplete.tests[0]?.durationMs).toBeGreaterThanOrEqual(0);
        const runComplete = events[3] as { success: boolean; durationMs: number };
        expect(runComplete.success).toBe(true);
        expect(runComplete.durationMs).toBeGreaterThan(0);
      } finally {
        delete process.env['GEOSPEC_CACHE_DIR'];
      }
    });

    it('should include durations in --json output', async () => {
      const projectPath = await createTemporaryProject();
      process.env['GEOSPEC_CACHE_DIR'] = join(projectPath, '.cache');
      try {
        await writePassingSpec(projectPath, 'box.geospec.ts');
        const stdout: string[] = [];
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
        const result = JSON.parse(stdout.join('\n')) as {
          durationMs: number;
          files: Array<{ durationMs: number; tests: Array<{ durationMs?: number }> }>;
        };
        expect(result.durationMs).toBeGreaterThan(0);
        expect(result.files[0]?.durationMs).toBeGreaterThan(0);
        expect(result.files[0]?.tests[0]?.durationMs).toBeGreaterThanOrEqual(0);
      } finally {
        delete process.env['GEOSPEC_CACHE_DIR'];
      }
    });

    it('should stop after the first failing file with --bail and report the bail issue', async () => {
      const projectPath = await createTemporaryProject();
      process.env['GEOSPEC_CACHE_DIR'] = join(projectPath, '.cache');
      try {
        // Files run in sorted order: a-fails runs first, z-passes must not run.
        await writeFailingSpec(projectPath, 'a-fails.geospec.ts');
        await writePassingSpec(projectPath, 'z-passes.geospec.ts');
        const stdout: string[] = [];
        const exitCode = await runGeoSpecCli({
          argv: ['run', '.', '--json', '--bail'],
          cwd: projectPath,
          stderr() {
            return undefined;
          },
          stdout(message) {
            stdout.push(message);
          },
        });
        expect(exitCode).toBe(1);
        const result = JSON.parse(stdout.join('\n')) as {
          files: Array<{ file: string }>;
          issues?: Array<{ code: string }>;
        };
        expect(result.files.map((file) => file.file)).toEqual(['a-fails.geospec.ts']);
        expect(result.issues?.some((issue) => issue.code === 'GEOSPEC_RUNNER_BAILED')).toBe(true);
      } finally {
        delete process.env['GEOSPEC_CACHE_DIR'];
      }
    });

    it('should reject --json combined with --reporter jsonl', async () => {
      const stderr: string[] = [];
      const exitCode = await runGeoSpecCli({
        argv: ['run', '.', '--json', '--reporter', 'jsonl'],
        stderr(message) {
          stderr.push(message);
        },
        stdout() {
          return undefined;
        },
      });
      expect(exitCode).toBe(1);
      expect(stderr.join('\n')).toContain('mutually exclusive');
    });

    it('should persist per-file timings telemetry into the cache root', async () => {
      const projectPath = await createTemporaryProject();
      const cacheDirectory = join(projectPath, '.cache');
      process.env['GEOSPEC_CACHE_DIR'] = cacheDirectory;
      try {
        await writePassingSpec(projectPath, 'box.geospec.ts');
        const exitCode = await runGeoSpecCli({
          argv: ['run', '.'],
          cwd: projectPath,
          stderr() {
            return undefined;
          },
          stdout() {
            return undefined;
          },
        });
        expect(exitCode).toBe(0);
        const timings = await readGeoSpecTimings(projectPath);
        const entry = timings['box.geospec.ts'];
        expect(entry?.durationMs).toBeGreaterThan(0);
        expect(entry?.processPeakRssBytes).toBeGreaterThan(0);
      } finally {
        delete process.env['GEOSPEC_CACHE_DIR'];
      }
    });
  });
});
