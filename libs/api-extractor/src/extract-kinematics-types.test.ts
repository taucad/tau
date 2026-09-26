import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { buildKinematicsTypeBundle } from '#extract-kinematics-types.js';

/** Type-check one authored module against the bundle, exactly as the editor mounts it. */
const checkAuthoredModule = (source: string): readonly string[] => {
  const bundle = buildKinematicsTypeBundle();
  const files = new Map<string, string>([['/project/main.ts', source]]);
  for (const [packageName, entry] of Object.entries(bundle)) {
    files.set(`/node_modules/${packageName}/index.d.ts`, entry.content);
    for (const [path, content] of Object.entries(entry.files ?? {})) {
      files.set(`/node_modules/${packageName}/${path}`, content);
    }
    files.set(`/node_modules/${packageName}/package.json`, JSON.stringify({ name: packageName, types: 'index.d.ts' }));
  }
  const options: ts.CompilerOptions = {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    types: [],
  };
  const host = ts.createCompilerHost(options);
  host.fileExists = (path) => files.has(path);
  host.readFile = (path) => files.get(path);
  host.getSourceFile = (path, languageVersion) => {
    const text = files.get(path) ?? (path.includes('/lib.') ? readFileSync(path, 'utf8') : undefined);
    return text === undefined ? undefined : ts.createSourceFile(path, text, languageVersion);
  };
  host.getDefaultLibLocation = () => ts.getDefaultLibFilePath(options).replace(/\/[^/]+$/u, '');
  host.getCurrentDirectory = () => '/project';
  host.directoryExists = (path) => [...files.keys()].some((file) => file.startsWith(`${path}/`));
  const program = ts.createProgram(['/project/main.ts'], options, host);
  return ts
    .getPreEmitDiagnostics(program)
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
};

describe('kinematics authoring type extraction', () => {
  it('keeps the checked-in editor declarations identical to the kinematics and spatial sources', () => {
    const checkedIn: unknown = JSON.parse(
      readFileSync(new URL('generated/kinematics/kinematics.bundled.json', import.meta.url), 'utf8'),
    );
    expect(buildKinematicsTypeBundle()).toStrictEqual(checkedIn);
  }, 20_000);

  it('type-checks an authored mechanism through the mounted package names', () => {
    const diagnostics = checkAuthoredModule(`
      import type { MechanismSource } from '@taucad/kinematics';
      export const mechanism = {
        schemaVersion: 1,
        units: { length: 'mm', angle: 'deg' },
        root: 'base',
        links: { base: { shapes: ['Base'] }, arm: { shapes: ['Arm'] } },
        joints: {
          shoulder: { type: 'revolute', parent: 'base', child: 'arm', origin: [0, 0, 10], axis: [0, 0, 1], limits: { lower: -90, upper: 90 } },
        },
        couplings: [],
        animations: [{ id: 'wave', duration: 2, loop: 'pingPong', keyframes: [{ time: 0, coordinates: { shoulder: 0 } }, { time: 2, coordinates: { shoulder: 45 } }] }],
      } satisfies MechanismSource;
    `);
    expect(diagnostics).toStrictEqual([]);
  }, 20_000);

  it('rejects an authored link that lists resolved components instead of shape names', () => {
    const diagnostics = checkAuthoredModule(`
      import type { MechanismSource } from '@taucad/kinematics';
      export const mechanism = {
        schemaVersion: 1,
        units: { length: 'mm', angle: 'deg' },
        root: 'base',
        links: { base: { components: ['Base'] } },
        joints: {},
      } satisfies MechanismSource;
    `);
    expect(diagnostics).toStrictEqual([expect.stringContaining("'components' does not exist")]);
  }, 20_000);

  it('rejects value imports the kernel cannot bundle', () => {
    const diagnostics = checkAuthoredModule(`
      import { mechanismSchemaVersion } from '@taucad/kinematics';
      import { toRenderPoint } from '@taucad/spatial';
      export const values = [mechanismSchemaVersion, toRenderPoint];
    `);
    expect(diagnostics).toStrictEqual([
      "'mechanismSchemaVersion' cannot be used as a value because it was exported using 'export type'.",
      "'toRenderPoint' cannot be used as a value because it was exported using 'export type'.",
    ]);
  }, 20_000);

  it('rejects a two-component axis through the spatial vector type', () => {
    const diagnostics = checkAuthoredModule(`
      import type { RevoluteJoint } from '@taucad/kinematics';
      export const joint = { type: 'revolute', parent: 'base', child: 'arm', origin: [0, 0, 0], axis: [0, 1] } satisfies RevoluteJoint;
    `);
    // An unresolved `@taucad/spatial` would type the axis as `any` and report nothing.
    expect(diagnostics.join('\n')).toMatch(/not assignable to type 'SpatialVector'[\s\S]*target requires 3/u);
  }, 20_000);
});
