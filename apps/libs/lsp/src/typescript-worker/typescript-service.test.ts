import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import ts from 'typescript';
import { TypeScriptProjectService } from '#typescript-worker/typescript-service.js';
import type { TypeScriptDocumentationPart } from '#typescript-worker/typescript-service.js';

const libraryDirectory = dirname(ts.getDefaultLibFilePath({ target: ts.ScriptTarget.ESNext }));
const standardLibraries = Object.fromEntries(
  readdirSync(libraryDirectory)
    .filter((name) => /^lib\..*\.d\.ts$/u.test(name))
    .map((name) => [name, readFileSync(join(libraryDirectory, name), 'utf8')]),
);

// Real TypeScript builds the standard-library program on first semantic access.
vi.setConfig({ testTimeout: 30_000 });

function fixture(closed: Readonly<Record<string, string>> = {}): TypeScriptProjectService {
  return new TypeScriptProjectService({
    standardLibraries,
    syncFs: {
      readFileText: (uri) => closed[uri],
      fileExists: (uri) => uri in closed,
      directoryExists: (uri) => uri === 'file:///lib',
      getDirectories: () => [],
      getScriptVersionForPath: (uri) => (uri in closed ? '1' : undefined),
    },
  });
}

describe('TypeScriptProjectService with real TypeScript language service', () => {
  it('finds an unimported closed project symbol only after bounded workspace admission', () => {
    const service = fixture({ 'file:///hidden.ts': 'export function hiddenShape(): number { return 1; }\n' });
    service.open('file:///main.ts', 'export const shown = 1;\n', 1);
    expect(service.getNavigateToItems('hiddenShape')).toEqual([]);
    service.setProjectFiles(['file:///hidden.ts']);
    expect(service.getNavigateToItems('hiddenShape')).toContainEqual(
      expect.objectContaining({ name: 'hiddenShape', fileName: '/hidden.ts' }),
    );
    service.dispose();
  });

  it('returns readable, read-only builtin declaration text for a real standard-library definition', () => {
    const service = fixture();
    const source = 'const value = 12; value.toFixed(2);\n';
    service.open('file:///main.ts', source, 1);
    const target = service.getDefinitionLocations('file:///main.ts', source.indexOf('toFixed'))[0];
    expect(target?.uri).toContain('lib.es5.d.ts');
    expect(service.readDeclaration(target?.uri ?? '')).toContain('toFixed');
    expect(service.readDeclaration('file:///main.ts')).toBeUndefined();
    service.dispose();
  });

  it('resolves mounted package metadata without treating package.json as a source root', () => {
    const service = fixture();
    service.setExtraLib('file:///node_modules/shape-kit/package.json', JSON.stringify({ types: './index.d.ts' }));
    service.setExtraLib('file:///node_modules/shape-kit/index.d.ts', 'export declare function area(): number;\n');
    const source = "import { area } from 'shape-kit';\nconst result: number = area();\n";
    service.open('file:///main.ts', source, 1);
    expect(
      service
        .getDiagnostics('file:///main.ts')
        .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error),
    ).toEqual([]);
    expect(service.getDefinitionLocations('file:///main.ts', source.lastIndexOf('area'))[0]?.uri).toBe(
      'file:///node_modules/shape-kit/index.d.ts',
    );
    service.dispose();
  });

  it('resolves {@link} targets in quick info and completion details to editor locations', () => {
    const dep = 'export interface Mechanism {\n  teeth: number;\n}\n';
    const source = [
      "import type { Mechanism } from './lib/mechanism';",
      '/**',
      ' * Same as {@link Mechanism} but {@link https://x.dev docs}.',
      ' * @see {@link Mechanism}',
      ' */',
      'export const gear = 1;',
      'gear;',
      '',
    ].join('\n');
    const service = fixture({ 'file:///lib/mechanism.ts': dep });
    service.open('file:///main.ts', source, 1);
    const linkOf = (parts: readonly TypeScriptDocumentationPart[] | undefined): TypeScriptDocumentationPart[] =>
      (parts ?? []).filter((part) => part.kind === 'linkName');
    const expected: unknown = expect.objectContaining({ uri: 'file:///lib/mechanism.ts', line: 1, column: 1 });

    const info = service.getQuickInfo('file:///main.ts', source.lastIndexOf('gear'));
    expect(linkOf(info?.documentation).map((part) => part.location)).toEqual([expected]);
    expect(linkOf(info?.tags?.find((tag) => tag.name === 'see')?.text).map((part) => part.location)).toEqual([
      expected,
    ]);
    expect(info?.documentation?.find((part) => part.kind === 'linkText')).toMatchObject({ text: 'https://x.dev docs' });

    const details = service.getCompletionDetails({
      uri: 'file:///main.ts',
      position: source.lastIndexOf('gear'),
      name: 'gear',
    });
    expect(linkOf(details?.documentation).map((part) => part.location)).toEqual([expected]);
    service.dispose();
  });

  it('returns the import edit for an auto-import completion into an existing import', () => {
    const source = "import type { MechanismSource } from './lib/mechanism';\n\nexport type Test = Mec";
    const service = fixture({
      'file:///lib/mechanism.ts': 'export interface Mechanism {}\nexport interface MechanismSource {}\n',
    });
    service.open('file:///main.ts', source, 1);
    const entry = service
      .getCompletions('file:///main.ts', source.length)
      ?.entries.find((candidate) => candidate.name === 'Mechanism' && candidate.hasAction);
    expect(entry?.data).toBeDefined();
    const { codeActions } = service.getCompletionDetailsWithBases({
      uri: 'file:///main.ts',
      position: source.length,
      name: 'Mechanism',
      source: entry?.source,
      data: entry?.data,
    });
    expect(codeActions).toEqual([
      expect.objectContaining({
        edits: [expect.objectContaining({ uri: 'file:///main.ts', baseText: source, workerVersion: 1 })],
      }),
    ]);
    const [edit] = codeActions[0]?.edits ?? [];
    const applied = [...(edit?.changes ?? [])]
      .sort((left, right) => right.from - left.from)
      .reduce((text, change) => text.slice(0, change.from) + change.insert + text.slice(change.to), source);
    expect(applied).toBe(
      "import type { Mechanism, MechanismSource } from './lib/mechanism';\n\nexport type Test = Mec",
    );
    service.dispose();
  });

  it('resolves a closed imported file through the rooted sync FS and supports navigation, edits and completion', () => {
    const dep = 'export function cube(size: number): number { return size ** 3; }\n';
    const source = "import { cube } from './lib/cube';\nconst volume: number = cube(3);\n";
    const service = fixture({ 'file:///lib/cube.ts': dep });
    service.open('file:///main.ts', source, 1);

    const offset = source.lastIndexOf('cube');
    const definitions = service.getDefinition('file:///main.ts', offset);
    expect(definitions?.[0]?.fileName).toBe('/lib/cube.ts');
    expect(service.getDefinitionLocations('file:///main.ts', offset)[0]).toMatchObject({
      uri: 'file:///lib/cube.ts',
      line: 1,
      column: 17,
    });
    expect(
      service
        .getDiagnostics('file:///main.ts')
        .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error),
    ).toEqual([]);
    expect(
      service
        .getQuickInfo('file:///main.ts', offset)
        ?.displayParts?.map((part) => part.text)
        .join(''),
    ).toContain('cube');
    expect(
      service
        .getCompletions('file:///main.ts', source.indexOf('cube') + 2)
        ?.entries.some((entry) => entry.name === 'cube'),
    ).toBe(true);
    expect(service.getReferences('file:///main.ts', offset)?.length).toBeGreaterThanOrEqual(2);
    expect(service.getReferenceLocations('file:///main.ts', offset)).toContainEqual(
      expect.objectContaining({ uri: 'file:///lib/cube.ts', line: 1 }),
    );
    expect(service.getNavigateToItems('cube').some((item) => item.name === 'cube')).toBe(true);
    expect(service.getNavigationTree('file:///main.ts').text).toBeDefined();
    expect(service.getOutliningSpans('file:///main.ts')).toBeDefined();
    expect(service.getInlayHints('file:///main.ts', 0, source.length)).toBeDefined();
    expect(service.prepareCallHierarchy('file:///main.ts', offset)).toBeDefined();
    expect(service.getIncomingCalls('file:///main.ts', offset)).toBeDefined();
    expect(service.getOutgoingCalls('file:///main.ts', offset)).toBeDefined();
    expect(service.findRenameLocations('file:///main.ts', offset)?.length).toBeGreaterThanOrEqual(2);
    expect(
      service
        .getEditsForFileRename('file:///lib/cube.ts', 'file:///lib/box.ts')
        .some((edit) => edit.fileName === '/main.ts'),
    ).toBe(true);
    expect(service.getFileRenameEditsWithBases('file:///lib/cube.ts', 'file:///lib/box.ts')).toContainEqual(
      expect.objectContaining({ uri: 'file:///main.ts', baseText: source, workerVersion: 1 }),
    );
    expect(service.getRenameEdits('file:///main.ts', offset, 'box')).toContainEqual(
      expect.objectContaining({ uri: 'file:///main.ts', baseText: source, workerVersion: 1 }),
    );
    service.dispose();
  });

  it('applies versioned UTF-16 changes without losing diagnostics or allowing stale updates', () => {
    const service = fixture();
    service.open('file:///main.ts', 'const value: number = 1;\r\n', 1);
    const prefix = 'const value: number = ';
    service.change({
      uri: 'file:///main.ts',
      previousVersion: 1,
      version: 2,
      changes: [{ from: prefix.length, to: prefix.length + 1, insert: '"😀"' }],
    });
    expect(service.getDiagnostics('file:///main.ts').some((diagnostic) => diagnostic.code === 2322)).toBe(true);
    expect(() => {
      service.change({
        uri: 'file:///main.ts',
        previousVersion: 1,
        version: 3,
        changes: [{ from: 0, to: 0, insert: 'x' }],
      });
    }).toThrow('Stale');
    expect(() => {
      service.assertVersion('file:///main.ts', 1);
    }).toThrow('Stale');
    expect(() => {
      service.assertVersion('file:///main.ts', 2);
    }).not.toThrow();
    service.dispose();
  });

  it('serves local declarations and implementation/type definition from actual language service', () => {
    const service = fixture();
    const text =
      'interface Shape { area(): number }\nclass Box implements Shape { area() { return 1; } }\nconst shape: Shape = new Box();\nshape.area();\n';
    service.open('file:///main.ts', text, 1);
    const offset = text.lastIndexOf('area');
    expect(service.getImplementation('file:///main.ts', offset)?.some((entry) => entry.fileName === '/main.ts')).toBe(
      true,
    );
    expect(service.getTypeDefinition('file:///main.ts', text.lastIndexOf('shape'))?.length).toBeGreaterThan(0);
    expect(service.getNavigationTree('file:///main.ts').childItems?.length).toBeGreaterThan(0);
    expect(service.getNavigateToItems('Box').some((item) => item.name === 'Box')).toBe(true);
    service.dispose();
  });
});
