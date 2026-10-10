import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import type { ApiEntryDraft } from '#model/api-corpus.js';
import { createApiCorpus } from '#model/api-corpus.js';
import type { ApiCorpus } from '#model/api-corpus.types.js';
import {
  attributeFile,
  collectUsage,
  identifierTokens,
  indexCorpora,
  lookupReference,
  stripSource,
  usedIds,
  withJsxTokens,
  writeUsageReports,
} from '#usage/collect-usage.js';

const corpus = (language: ApiCorpus['metadata']['language'], entries: readonly ApiEntryDraft[]): ApiCorpus =>
  createApiCorpus(
    { language, packageName: 'fixture', packageVersion: '1.0.0', extractor: 'fixture', extractionDate: '2026-10-08' },
    entries,
  );

const method = (name: string): ApiEntryDraft => ({ name, kind: 'method' });

const used = (entries: readonly ApiEntryDraft[], code: string): readonly string[] =>
  [...usedIds(indexCorpora([corpus('typescript', entries)]), identifierTokens(stripSource(code, 'c')))].sort();

/** Operating-system temporary storage, per `tool-output-location-policy.md` §5. */
const scratch = mkdtempSync(join(tmpdir(), 'tau-usage-'));

afterAll(() => {
  rmSync(scratch, { force: true, recursive: true });
});

const writeFixture = (path: string, content: string): void => {
  mkdirSync(dirname(join(scratch, path)), { recursive: true });
  writeFileSync(join(scratch, path), content, 'utf8');
};

describe('withJsxTokens', () => {
  it('should read an element as its tag and its attributes as member uses', () => {
    const code = '<board width="10mm"><resistor resistance="1k" name="R1" footprint="0402" /></board>';
    const tokens = withJsxTokens(code, identifierTokens(code));

    expect([...tokens.bare]).toEqual(expect.arrayContaining(['<board>', '<resistor>', 'resistance']));
    expect(tokens.dotted.has('resistance')).toBe(true);
    expect(tokens.dotted.has('board')).toBe(false);
  });
});

describe('collect-usage', () => {
  describe('stripSource', () => {
    it('should drop line and block comments but keep a `//` inside a string', () => {
      const code = "const url = 'http://x'; // makeBox\n/* makeSphere */ makeCylinder();";
      expect(stripSource(code, 'c', true)).toBe("const url = 'http://x';  \n  makeCylinder();");
    });

    it('should blank string contents unless asked to keep them', () => {
      expect(stripSource('cube("sphere"); translate(\'x\');', 'c')).toBe('cube(""); translate("");');
    });

    it('should drop Python comments and triple-quoted strings', () => {
      const code = '"""Box docs"""\nx = Box(1)  # Cylinder\ny = "Sphere"';
      expect(stripSource(code, 'python')).toBe('""\nx = Box(1)   \ny = ""');
    });
  });

  describe('identifierTokens', () => {
    it('should separate member access from bare identifiers', () => {
      const tokens = identifierTokens('makeBox(1)\n  .fillet(2); const a = b; x = 240p;');
      expect([...tokens.bare].sort()).toEqual(['a', 'b', 'const', 'fillet', 'makeBox', 'x']);
      expect([...tokens.dotted]).toEqual(['fillet']);
    });
  });

  describe('attributeFile', () => {
    it.each([
      ['main.scad', '', ['cad-openscad']],
      ['main.kcl', '', ['cad-zoo']],
      ['Program.cs', '', ['cad-picogk']],
      ['main.py', 'from build123d import *', ['cad-build123d']],
      ['main.py', 'import build123d as bd', ['cad-build123d']],
      ['helper.py', 'import numpy', []],
      ['main.geospec.ts', "import { replicad } from 'replicad';", ['geospec-authoring']],
      ['main.ts', "import { drawCircle } from 'replicad';", ['cad-replicad']],
      ['main.ts', "import type { ShapeConfig } from '@taucad/replicad/model';", ['cad-replicad']],
      ['main.js', "const jscad = require('@jscad/modeling');", ['cad-jscad']],
      ['main.ts', "import Module from 'manifold-3d';", ['cad-manifold']],
      ['main.ts', "import init from 'libcascade';", ['cad-opencascadejs']],
      ['main.mjs', "import { Pico } from 'picovoxel';", ['cad-picovoxel']],
      ['main.tsx', "import { Resistor } from '@tscircuit/core';", ['cad-tscircuit']],
      ['circuit.tsx', 'export default () => <board width="10mm" />;', ['cad-tscircuit']],
      ['main.ts', "import { x } from 'replicad';\nimport { y } from 'manifold-3d';", ['cad-manifold', 'cad-replicad']],
      ['main.ts', "// import { drawCircle } from 'replicad';\nimport fs from 'node:fs';", []],
      ['types.d.ts', "import { Shape } from 'replicad';", []],
      ['main.test.ts', "import { drawCircle } from 'replicad';", []],
      ['readme.md', '', []],
    ])('should attribute %s with %j to %j', (fileName, text, expected) => {
      expect(attributeFile(fileName, text)).toEqual(expected);
    });
  });

  describe('usedIds', () => {
    const shapes: readonly ApiEntryDraft[] = [
      { name: 'makeBox', kind: 'function' },
      { name: 'Solid', kind: 'class', members: [{ name: 'constructor', kind: 'constructor' }, method('fillet')] },
      { name: 'Sketch', kind: 'class', members: [method('fillet'), method('extrude')] },
      { name: 'primitives', kind: 'namespace', members: [{ name: 'cuboid', kind: 'function' }] },
      { name: 'transforms', kind: 'namespace', members: [{ name: 'translate', kind: 'function' }] },
      { name: 'mat4', kind: 'namespace', members: [{ name: 'translate', kind: 'function' }] },
    ];

    it('should credit a top-level entry and every declarer of an unresolved member', () => {
      expect(used(shapes, 'makeBox(1).fillet(2);')).toEqual([
        'typescript:Sketch.fillet',
        'typescript:Solid.fillet',
        'typescript:makeBox',
      ]);
    });

    it('should credit only the declarers whose container the file names', () => {
      expect(used(shapes, 'const s: Solid = makeBox(1); s.fillet(2);')).toEqual([
        'typescript:Solid',
        'typescript:Solid.constructor',
        'typescript:Solid.fillet',
        'typescript:makeBox',
      ]);
    });

    it('should resolve a member through the return type of a credited call', () => {
      const flow: readonly ApiEntryDraft[] = [
        {
          name: 'makeSolid',
          kind: 'function',
          signatures: [{ parameters: [], text: 'declare function makeSolid(): Solid;' }],
        },
        { name: 'translate', kind: 'function' },
        { name: 'Solid', kind: 'class', members: [method('fillet'), method('translate')] },
        { name: 'Sketch', kind: 'class', members: [method('fillet')] },
      ];

      expect(used(flow, 'makeSolid().fillet(2).translate([1, 0, 0]);')).toEqual([
        'typescript:Solid.fillet',
        'typescript:Solid.translate',
        'typescript:makeSolid',
      ]);
    });

    it('should not credit a class member written without a dot', () => {
      expect(used(shapes, 'const fillet = 2; extrude(fillet);')).toEqual([]);
    });

    it('should credit a destructured namespace member and resolve it by the namespace named', () => {
      expect(used(shapes, 'const { cuboid } = primitives; const { translate } = transforms;')).toEqual([
        'typescript:primitives',
        'typescript:primitives.cuboid',
        'typescript:transforms',
        'typescript:transforms.translate',
      ]);
    });

    it('should credit no declarer of a member name too common to resolve', () => {
      const many = Array.from(
        { length: 17 },
        (_, index): ApiEntryDraft => ({
          name: `Kind${String(index)}`,
          kind: 'class',
          members: [method('Shape')],
        }),
      );
      expect(used(many, 'builder.Shape();')).toEqual([]);
      expect(used(many, 'new Kind3().Shape();')).toEqual(['typescript:Kind3', 'typescript:Kind3.Shape']);
    });

    it('should count a supplemental entry sharing a main id once', () => {
      const main = corpus('typescript', [{ name: 'loadModel', kind: 'function' }]);
      const supplemental = corpus('typescript', [
        { name: 'loadModel', kind: 'function' },
        { name: 'expectGeo', kind: 'function' },
      ]);
      const index = indexCorpora([main, supplemental]);
      expect([...index.names.keys()]).toEqual(['typescript:loadModel', 'typescript:expectGeo']);
    });
  });

  describe('lookupReference', () => {
    it('should read a native grep pattern scoped to a Tau overlay skill', () => {
      const reference = lookupReference({
        toolName: 'grep',
        content: { pattern: 'makeCylinder|ShapeConfig', path: '.agents/skills/cad-replicad/api-index.md' },
      });
      expect(reference.slugs).toEqual(['cad-replicad']);
      expect([...reference.tokens].sort()).toEqual(['ShapeConfig', 'makeCylinder']);
    });

    it('should read an ACP shell search and ignore paths, flags and shell verbs', () => {
      const command = String.raw`rg -n 'toHaveVolume|\bloadModel' '/Users/someone/Library/Application Support/Tau/acp-skills/0a1b/.agents/skills/geospec-authoring/api-types.md' | head -50; cat tau.json`;
      const reference = lookupReference({ toolName: command, content: { command, cwd: '/Users/someone/project' } });
      expect(reference.slugs).toEqual(['geospec-authoring']);
      expect([...reference.tokens].sort()).toEqual(['loadModel', 'toHaveVolume']);
    });

    it('should read a Codex search title that names the skill', () => {
      const title = "Search for 'toBeWatertight|toHaveBoundingBox' in geospec-authoring";
      const reference = lookupReference({ toolName: title, content: { title } });
      expect(reference.slugs).toEqual(['geospec-authoring']);
      expect([...reference.tokens].sort()).toEqual(['toBeWatertight', 'toHaveBoundingBox']);
    });

    it('should report no skill for a tool input outside skill bundles', () => {
      const reference = lookupReference({ toolName: 'grep', content: { pattern: 'makeBox', path: 'main.ts' } });
      expect(reference).toEqual({ slugs: [], tokens: new Set() });
    });
  });

  describe('collectUsage', () => {
    const openscad = {
      slug: 'cad-openscad',
      corpus: () =>
        corpus('openscad', [
          { name: 'cube', kind: 'module' },
          { name: 'sphere', kind: 'module' },
          { name: 'cylinder', kind: 'module' },
          { name: 'hull', kind: 'module' },
        ]),
    };
    const toolInput = (runId: string, pattern: string): string =>
      JSON.stringify({
        runId,
        type: 'message.appended',
        message: {
          role: 'tool-input',
          toolName: 'grep',
          content: { pattern, path: '.agents/skills/cad-openscad/api-index.md' },
        },
      });

    writeFixture('examples/kernels/openscad/cube/main.scad', 'cube(10); // sphere(1);\n');
    writeFixture('workspace/copy/main.scad', 'cube(10); // sphere(1);\n');
    writeFixture('workspace/own/main.scad', 'hull() { cube(1); sphere(2); }\n');
    writeFixture('workspace/own/node_modules/lib/main.scad', 'cylinder(1);\n');
    writeFixture('workspace/own/.tau/scratch.scad', 'cylinder(1);\n');
    writeFixture(
      'workspace/own/.tau/chats/chat_1/events.jsonl',
      `${[toolInput('run-1', 'cylinder'), toolInput('run-1', 'cylinder|hull'), toolInput('run-2', 'hull')].join('\n')}\n`,
    );
    writeFixture('workspace/own/.tau/chats/chat_2/events/split.jsonl', `${toolInput('run-2', 'hull')}\n`);

    const reports = collectUsage({
      examplesRoot: join(scratch, 'examples'),
      workspaceRoots: [join(scratch, 'workspace')],
      owners: [openscad, { slug: 'workbench' }],
    });

    it('should count copies once, skip build and dot directories, and count each run once', () => {
      expect(reports).toEqual([
        {
          slug: 'cad-openscad',
          sources: { workspaceFiles: 1, exampleFiles: 1, transcriptRuns: 2 },
          symbols: [
            { id: 'openscad:hull', name: 'hull', score: 3, workspace: 1, examples: 0, lookups: 2 },
            { id: 'openscad:cube', name: 'cube', score: 2, workspace: 1, examples: 1, lookups: 0 },
            { id: 'openscad:cylinder', name: 'cylinder', score: 1, workspace: 0, examples: 0, lookups: 1 },
            { id: 'openscad:sphere', name: 'sphere', score: 1, workspace: 1, examples: 0, lookups: 0 },
          ],
        },
      ]);
    });

    it('should write formatted reports that carry no path', () => {
      const out = join(scratch, 'out');
      writeUsageReports(reports, out);
      const written = readFileSync(join(out, 'cad-openscad.json'), 'utf8');
      expect(written).toBe(`${JSON.stringify(reports[0], undefined, 2)}\n`);
      expect(written).not.toContain(scratch);
      expect(written).not.toContain('main.scad');
    });
  });
});
