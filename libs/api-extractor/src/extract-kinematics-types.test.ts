import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import kinematicsTypes from '#generated/kinematics/kinematics.bundled.json' with { type: 'json' };
import picovoxelTypes from '#generated/picovoxel/picovoxel.bundled.json' with { type: 'json' };
import replicadTypes from '#generated/replicad/replicad.bundled.json' with { type: 'json' };
import replicadModelTypes from '#generated/replicad/model.bundled.json' with { type: 'json' };
import type { BundledTypesPackageMap } from '#bundled-types.types.js';
import { buildKinematicsTypeBundle } from '#extract-kinematics-types.js';

/** Check consumer diagnostics against mounted bundles; dependency declarations have their own extraction gates. */
const checkAuthoredModule = (source: string, kernel?: 'picovoxel' | 'replicad'): readonly string[] => {
  const bundle: BundledTypesPackageMap = {
    ...kinematicsTypes,
    ...(kernel === 'picovoxel' ? picovoxelTypes : {}),
    ...(kernel === 'replicad' ? { ...replicadModelTypes, replicad: { content: replicadTypes.replicad } } : {}),
  };
  const files = new Map<string, string>([['/project/main.ts', source]]);
  for (const [packageName, entry] of Object.entries(bundle)) {
    files.set(`/node_modules/${packageName}/index.d.ts`, entry.content);
    for (const [path, content] of Object.entries(entry.files ?? {})) {
      files.set(`/node_modules/${packageName}/${path}`, content);
    }
    files.set(
      `/node_modules/${packageName}/package.json`,
      JSON.stringify({ name: packageName, types: 'index.d.ts', ...entry.packageJson }),
    );
  }
  const options: ts.CompilerOptions = {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    types: [],
    lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
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
    .filter((diagnostic) => diagnostic.file === undefined || diagnostic.file.fileName === '/project/main.ts')
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
};

describe('kinematics authoring type extraction', () => {
  it('keeps the checked-in editor declarations identical to the kinematics and spatial sources', () => {
    const checkedIn: unknown = JSON.parse(
      readFileSync(new URL('generated/kinematics/kinematics.bundled.json', import.meta.url), 'utf8'),
    );
    expect(buildKinematicsTypeBundle()).toStrictEqual(checkedIn);
  }, 120_000);

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

  it.each(['picovoxel', 'replicad'] as const)(
    'should compile the complete %s skill mechanism against mounted declarations',
    (kernel) => {
      const reference = readFileSync(
        new URL(`../../../packages/plugins/${kernel}/agent/kinematics-reference.md`, import.meta.url),
        'utf8',
      );
      const source = /## Complete hinged model\n\n```typescript\n([\s\S]*?)\n```/u.exec(reference)?.[1];
      if (source === undefined) {
        throw new Error(`The ${kernel} reference must include a complete hinged model.`);
      }
      expect(checkAuthoredModule(source, kernel)).toStrictEqual([]);
    },
    20_000,
  );

  it('should narrow shared names without changing legacy or dynamic mechanism authoring', () => {
    expect(
      checkAuthoredModule(`
      import type { LinkSource, MechanismSource } from '@taucad/kinematics';
      const names = { base: 'Base', lid: 'Lid' } as const;
      type Name = (typeof names)[keyof typeof names];
      const mechanism = {
        schemaVersion: 1, units: { length: 'mm', angle: 'deg' }, root: 'base',
        links: { base: { shapes: [] }, lid: { shapes: [names.lid] } },
        joints: { hinge: { type: 'revolute', parent: 'base', child: 'lid', origin: [0, 0, 0], axis: [1, 0, 0] } },
      } satisfies MechanismSource<Name>;
      const legacy: MechanismSource = mechanism;
      const dynamic: LinkSource = { shapes: ['A generated runtime name'] };
      // @ts-expect-error the palette rejects misspelled shape names
      const typo: LinkSource<Name> = { shapes: ['Lidd'] };
      // @ts-expect-error names are strings
      type InvalidName = MechanismSource<42>;
      // @ts-expect-error the optional generic contains names, not main functions
      type InvalidMain = MechanismSource<() => unknown>;
      export const exports = [legacy, dynamic, typo];
    `),
    ).toStrictEqual([]);
  }, 20_000);

  it('should report a misspelled shape name through the mounted vocabulary', () => {
    expect(
      checkAuthoredModule(`
      import type { LinkSource } from '@taucad/kinematics';
      const link = { shapes: ['Lidd'] } satisfies LinkSource<'Base' | 'Lid'>;
    `),
    ).toStrictEqual([expect.stringContaining(`Type '"Lidd"' is not assignable`)]);
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
