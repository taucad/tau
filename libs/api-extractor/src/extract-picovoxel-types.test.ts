import { readFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import picovoxelBundle from '#generated/picovoxel/picovoxel.bundled.json' with { type: 'json' };
import { buildPicovoxelTypes, collectDeclarationGraph, picovoxelAuthorSubpaths } from '#extract-picovoxel-types.js';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

const createFiles = (files: Readonly<Record<string, string>>): string => {
  const directory = mkdtempSync(join(tmpdir(), 'tau-picovoxel-types-'));
  directories.push(directory);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(directory, name)), { recursive: true });
    writeFileSync(join(directory, name), content);
  }
  return directory;
};

/** A package whose exports map lists `subpaths`, each with a `dist/<name>.d.ts` ESM declaration. */
const createPackage = (
  subpaths: readonly string[],
  declarations: Readonly<Record<string, string>>,
  types = (subpath: string): string => `./dist/${subpath === '.' ? 'index' : subpath.slice(2)}.d.ts`,
): string =>
  createFiles({
    'package.json': JSON.stringify({
      exports: Object.fromEntries(subpaths.map((subpath) => [subpath, { import: { types: types(subpath) } }])),
    }),
    ...Object.fromEntries(Object.entries(declarations).map(([name, content]) => [`dist/${name}`, content])),
  });

describe('collectDeclarationGraph', () => {
  it('should follow relative imports transitively and skip unreached and bare-specifier files', () => {
    const directory = createFiles({
      'index.d.ts': 'import { A } from "./a.js";\nexport type { B } from \'./b.js\';',
      'a.d.ts': 'import type { C } from "./c.js";\nimport type { Object3D } from "three";',
      'b.d.ts': 'export type B = import("./c.js").C;',
      'c.d.ts': 'export type C = 1;',
      'multi.d.ts': 'import { A } from "./a.js";',
    });

    expect(Object.keys(collectDeclarationGraph(directory, ['index.d.ts']))).toEqual([
      'a.d.ts',
      'b.d.ts',
      'c.d.ts',
      'index.d.ts',
    ]);
  });

  it('should resolve nested and parent imports against the importing file', () => {
    const directory = createFiles({
      'shapekernel.d.ts': 'export { BaseBox } from "./shapekernel/baseBox.js";',
      'shapekernel/baseBox.d.ts':
        'import { BaseShape } from "./baseShape.js";\nimport { Frame } from "../numerics/frame.js";\nimport { Pico } from "../session.js";',
      'shapekernel/baseShape.d.ts': 'export type BaseShape = 1;',
      'numerics/frame.d.ts': 'import { Vec3 } from "../types.js";\nexport type Frame = Vec3;',
      'session.d.ts': 'export type Pico = 1;',
      'types.d.ts': 'export type Vec3 = 1;',
      // Same basename as a nested file: a root-joined resolver would read this one instead.
      'baseShape.d.ts': 'unreached',
    });

    expect(Object.keys(collectDeclarationGraph(directory, ['shapekernel.d.ts']))).toEqual([
      'numerics/frame.d.ts',
      'session.d.ts',
      'shapekernel.d.ts',
      'shapekernel/baseBox.d.ts',
      'shapekernel/baseShape.d.ts',
      'types.d.ts',
    ]);
  });

  it('should read each file of an import cycle once and terminate', () => {
    const directory = createFiles({
      'index.d.ts': 'export * from "./voxels.js";',
      'voxels.d.ts': 'import type { Mesh } from "./mesh.js";\nexport type Voxels = { toMesh(): Mesh };',
      'mesh.d.ts': 'import type { Voxels } from "./voxels.js";\nexport type Mesh = { voxelize(): Voxels };',
    });

    expect(collectDeclarationGraph(directory, ['index.d.ts'])).toEqual({
      'index.d.ts': 'export * from "./voxels.js";',
      'mesh.d.ts': 'import type { Voxels } from "./voxels.js";\nexport type Mesh = { voxelize(): Voxels };',
      'voxels.d.ts': 'import type { Mesh } from "./mesh.js";\nexport type Voxels = { toMesh(): Mesh };',
    });
  });

  it('should refuse an import that climbs out of the declaration directory', () => {
    const directory = createFiles({ 'index.d.ts': 'import { X } from "../outside.js";' });

    expect(() => collectDeclarationGraph(directory, ['index.d.ts'])).toThrow(
      'index.d.ts imports ../outside.js from outside the declaration directory.',
    );
  });
});

describe('buildPicovoxelTypes', () => {
  const declarations = Object.fromEntries(
    picovoxelAuthorSubpaths.map((subpath) => [`${subpath === '.' ? 'index' : subpath.slice(2)}.d.ts`, '']),
  );

  it('should read every author entry from the installed exports map', () => {
    const root = createPackage(picovoxelAuthorSubpaths, declarations);

    expect(buildPicovoxelTypes(root)['picovoxel']?.packageJson).toEqual({
      name: 'picovoxel',
      types: './index.d.ts',
      exports: {
        '.': { types: './index.d.ts' },
        './latticelibrary': { types: './latticelibrary.d.ts' },
        './numerics': { types: './numerics.d.ts' },
        './shapekernel': { types: './shapekernel.d.ts' },
        './slicing': { types: './slicing.d.ts' },
      },
    });
  });

  it('should refuse a package that exports no ESM declaration for an author subpath', () => {
    const root = createPackage(['.'], declarations);

    expect(() => buildPicovoxelTypes(root)).toThrow(
      'picovoxel exports no ESM declaration under dist/ for ./latticelibrary.',
    );
  });

  it('should refuse root declarations the mount cannot place', () => {
    const root = createPackage(picovoxelAuthorSubpaths, { ...declarations, 'main.d.ts': '' }, (subpath) =>
      subpath === '.' ? './dist/main.d.ts' : `./dist/${subpath.slice(2)}.d.ts`,
    );

    expect(() => buildPicovoxelTypes(root)).toThrow(
      "picovoxel's root declarations moved to dist/main.d.ts; the mount expects dist/index.d.ts.",
    );
  });

  it('should match the committed bundle for the installed picovoxel', () => {
    expect(buildPicovoxelTypes()).toEqual(picovoxelBundle);
  });

  it('should reach the nested shapekernel, latticelibrary and numerics declarations', () => {
    const { files = {} } = buildPicovoxelTypes()['picovoxel']!;

    for (const directory of ['shapekernel', 'latticelibrary', 'numerics']) {
      expect(
        Object.keys(files).some((name) => name.startsWith(`${directory}/`)),
        directory,
      ).toBe(true);
    }
  });
});

/** Type-check one authored module against the bundle, exactly as the editor mounts it. */
const checkAuthoredModule = (source: string): readonly string[] => {
  const bundle = buildPicovoxelTypes();
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
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
};

describe('PicoVoxel authored result types', () => {
  it('should compile raw, named, readonly and repeated parts through the editor mount', () => {
    expect(
      checkAuthoredModule(`
      import type { Pico } from 'picovoxel';
      import type { PicovoxelResult } from '@taucad/picovoxel';
      export default function main(pico: Pico): PicovoxelResult {
        const shape = pico.createVoxels({ shape: 'sphere', radius: 2 });
        return [shape, { shape: shape.toMesh(), name: '蓋' }, { shape, name: '蓋' }] as const;
      }
    `),
    ).toEqual([]);
  }, 20_000);

  it('should reject malformed names, nested parts and plugin value imports through the editor mount', () => {
    const errors = checkAuthoredModule(`
      import type { Voxels } from 'picovoxel';
      import type { PicovoxelResult } from '@taucad/picovoxel';
      import { picovoxel } from '@taucad/picovoxel';
      declare const shape: Voxels;
      const named: PicovoxelResult = { shape, name: 42 };
      const nested: PicovoxelResult = [[shape]];
      const assembly: PicovoxelResult = { shape, children: [shape] };
      void [named, nested, assembly, picovoxel];
    `);
    expect(errors).toHaveLength(4);
    expect(errors.join('\n')).toContain("has no exported member 'picovoxel'");
    expect(errors.join('\n')).toContain("Type 'number' is not assignable to type 'string'");
    expect(errors.join('\n')).toContain("'children' does not exist");
  }, 20_000);
});
