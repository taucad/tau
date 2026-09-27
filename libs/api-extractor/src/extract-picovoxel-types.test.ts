import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import picovoxelBundle from '#generated/picovoxel/picovoxel.bundled.json' with { type: 'json' };
import { buildPicovoxelTypes, collectDeclarationGraph } from '#extract-picovoxel-types.js';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

const createDeclarations = (files: Readonly<Record<string, string>>): string => {
  const directory = mkdtempSync(join(tmpdir(), 'tau-picovoxel-types-'));
  directories.push(directory);
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(directory, name), content);
  }
  return directory;
};

describe('collectDeclarationGraph', () => {
  it('should follow relative imports transitively and skip unreached and bare-specifier files', () => {
    const directory = createDeclarations({
      'index.d.ts': 'import { A } from "./a-1.js";\nexport type { B } from \'./b-2.js\';',
      'a-1.d.ts': 'import type { C } from "./c-3.js";\nimport type { Object3D } from "three";',
      'b-2.d.ts': 'export type B = import("./c-3.js").C;',
      'c-3.d.ts': 'export type C = 1;',
      'multi.d.ts': 'import { A } from "./a-1.js";',
    });

    expect(Object.keys(collectDeclarationGraph(directory, ['index.d.ts']))).toEqual([
      'a-1.d.ts',
      'b-2.d.ts',
      'c-3.d.ts',
      'index.d.ts',
    ]);
  });
});

describe('buildPicovoxelTypes', () => {
  it('should match the committed bundle for the installed picovoxel', () => {
    expect(buildPicovoxelTypes()).toEqual(picovoxelBundle);
  });
});
