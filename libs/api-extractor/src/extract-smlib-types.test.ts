import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import smlibBundle from '#generated/smlib/smlib.bundled.json' with { type: 'json' };
import kinematicsBundle from '#generated/kinematics/kinematics.bundled.json' with { type: 'json' };
import type { BundledTypesPackageMap } from '#bundled-types.types.js';
import { buildSmlibTypes, collectSmlibDeclarations, rewriteSmlibDeclaration } from '#extract-smlib-types.js';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

const createFiles = (files: Readonly<Record<string, string>>): string => {
  const directory = mkdtempSync(join(tmpdir(), 'tau-smlib-types-'));
  directories.push(directory);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(directory, name)), { recursive: true });
    writeFileSync(join(directory, name), content);
  }
  return directory;
};

describe('rewriteSmlibDeclaration', () => {
  it('should rewrite relative .ts specifiers to .js and leave bare specifiers alone', () => {
    expect(
      rewriteSmlibDeclaration(
        "import { Part } from './shapes.ts';\nexport { Box } from \"./parts.ts\";\ntype T = import('./mesh.ts').Mesh;\nimport x from 'other.ts';",
      ),
    ).toBe(
      "import { Part } from './shapes.js';\nexport { Box } from \"./parts.js\";\ntype T = import('./mesh.js').Mesh;\nimport x from 'other.ts';",
    );
  });

  it('should replace the Node file-system type the editor cannot resolve', () => {
    expect(rewriteSmlibDeclaration("type NodeFs = typeof import('node:fs');")).toBe('type NodeFs = any;');
  });
});

describe('collectSmlibDeclarations', () => {
  it('should follow relative .ts imports transitively and skip unreached files', () => {
    const directory = createFiles({
      'index.d.ts': "export { A } from './a.ts';",
      'a.d.ts': "import type { B } from './b.ts';\nexport type A = B;",
      'b.d.ts': 'export type B = 1;',
      'viewer.d.ts': 'unreached',
    });

    expect(collectSmlibDeclarations(directory, 'index.d.ts')).toEqual({
      'a.d.ts': "import type { B } from './b.js';\nexport type A = B;",
      'b.d.ts': 'export type B = 1;',
      'index.d.ts': "export { A } from './a.js';",
    });
  });

  it('should read each file of an import cycle once', () => {
    const directory = createFiles({
      'index.d.ts': "export * from './shapes.ts';",
      'shapes.d.ts': "import type { Mesh } from './mesh.ts';\nexport type Shape = { mesh(): Mesh };",
      'mesh.d.ts': "import type { Shape } from './shapes.ts';\nexport type Mesh = { shape: Shape };",
    });

    expect(Object.keys(collectSmlibDeclarations(directory, 'index.d.ts'))).toEqual([
      'index.d.ts',
      'mesh.d.ts',
      'shapes.d.ts',
    ]);
  });

  it('should refuse an import that climbs out of the declaration directory', () => {
    const directory = createFiles({ 'index.d.ts': "import { X } from '../outside.ts';" });

    expect(() => collectSmlibDeclarations(directory, 'index.d.ts')).toThrow(
      'index.d.ts imports ../outside.ts from outside the declaration directory.',
    );
  });
});

describe('buildSmlibTypes', () => {
  it('should refuse root declarations the mount cannot place', () => {
    const root = createFiles({
      'package.json': JSON.stringify({ exports: { '.': { types: './dist/main.d.ts' } } }),
    });

    expect(() => buildSmlibTypes(root)).toThrow(
      "@classcad/smlibwasm's root declarations moved to ./dist/main.d.ts; the mount expects ./dist/index.d.ts.",
    );
  });

  it('should match the committed bundle for the installed smlibwasm', () => {
    expect(buildSmlibTypes()).toEqual(smlibBundle);
  });

  it('should bundle every file the root reaches with editor-resolvable specifiers', () => {
    const { content, files = {} } = buildSmlibTypes()['@classcad/smlibwasm']!;
    const all = { 'index.d.ts': content, ...files };

    expect(content).toContain('Box,');
    expect(Object.keys(all)).toContain('shapes.d.ts');
    for (const [name, declaration] of Object.entries(all)) {
      expect(declaration, name).not.toMatch(/from\s+["']\.{1,2}\/[^"']+\.ts["']/u);
      expect(declaration, name).not.toContain("import('node:");
      for (const [, specifier] of declaration.matchAll(/(?:from\s+|import\s*\(\s*)["']\.\/([^"']+)\.js["']/gu)) {
        expect(all, `${name} imports ${specifier!}`).toHaveProperty([`${specifier!}.d.ts`]);
      }
    }
  });
});

/** Type-check one authored module against the bundles, exactly as the editor mounts them. */
const checkAuthoredModule = (source: string): readonly string[] => {
  const bundle: BundledTypesPackageMap = { ...smlibBundle, ...kinematicsBundle };
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
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
};

describe('SMLib authored module types', () => {
  it('should compile modeling, selectors, patterns and the Tau model envelope without host declarations', () => {
    expect(
      checkAuthoredModule(`
      import { Box, Cylinder, GridLocations, Pos, Rectangle, Z, type Part } from '@classcad/smlibwasm';
      import type { Material, Model, ShapeConfig } from '@taucad/smlib/model';
      export const defaultParams = { width: 80, depth: 60, thickness: 10 };
      const material: Material = {
        pbrMetallicRoughness: { baseColorFactor: [0.6, 0.62, 0.65, 1], metallicFactor: 1, roughnessFactor: 0.3 },
        extensions: { KHR_materials_anisotropy: { anisotropyStrength: 0.7 } },
      };
      export default function main(p = defaultParams): Model {
        let plate: Part = Box(p.width, p.depth, p.thickness);
        plate = plate.fillet(plate.edges().parallelTo(Z), 8);
        plate = plate.cut(GridLocations(60, 40, 2, 2).mul(Cylinder(4, p.thickness)));
        const boss = Pos(0, 0, p.thickness).mul(Rectangle(20, 20).extrude(5));
        const shapes: ShapeConfig[] = [
          { shape: plate.fuse(boss), name: 'Plate', material },
          { shape: Cylinder(3, 20).named('Pin'), color: '#c0c0c0', density: 7.85 },
        ];
        return { shapes };
      }
    `),
    ).toEqual([]);
    const declarations = Object.values(smlibBundle['@taucad/smlib'].files).join('\n');
    expect(declarations).not.toMatch(/@taucad\/runtime|@taucad\/geometry-core|@gltf-transform\/core/u);
  }, 30_000);

  it('should reject mixed appearance paths, wrong selector arguments and runtime plugin imports', () => {
    const errors = checkAuthoredModule(`
      import { Box } from '@classcad/smlibwasm';
      import type { ShapeConfig } from '@taucad/smlib/model';
      import { smlibKernel } from '@taucad/smlib';
      const mixed: ShapeConfig = { shape: Box(1, 1, 1), color: 'red', material: {} };
      const wrong = Box(1, 1, 1).edges().parallelTo('Z');
      void [mixed, wrong, smlibKernel];
    `);
    expect(errors).toHaveLength(3);
    expect(errors.join('\n')).toContain("has no exported member 'smlibKernel'");
  }, 30_000);
});
