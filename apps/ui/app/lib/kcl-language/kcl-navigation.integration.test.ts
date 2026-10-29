/**
 * KCL navigation over real WASM parses: Find References across imports, scoped and standard library
 * definitions, Go to Type Definition, docs links, signature help and parameter hints.
 *
 * @vitest-environment node
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { FileContentService } from '@taucad/fs-client/file-content-service';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';
import { EditorDocument } from '#lib/editor-document.js';
import type { EditorDocumentSession } from '#lib/editor-document-session.js';
import type { EditorLanguageEnvironment } from '#lib/editor-language-environment.js';
import {
  kclDefinition,
  kclDocumentationMarkdown,
  kclOccurrences,
  kclParameterHints,
  kclReferences,
  kclSignatureAt,
  kclTypeDefinition,
  openKclTarget,
} from '#lib/kcl-language/kcl-navigation.js';
import type { KclNavigationContext } from '#lib/kcl-language/kcl-navigation.js';
import { loadKclStdlib } from '#lib/kcl-language/kcl-stdlib.js';
import { KclSymbolService } from '#lib/kcl-language/lsp/kcl-symbol-service.js';
import type { Node } from '@taucad/kcl-wasm-lib/bindings/Node';
import type { Program } from '@taucad/kcl-wasm-lib/bindings/Program';

let symbols: KclSymbolService;

beforeAll(async () => {
  const kcl = await import('@taucad/kcl-wasm-lib');
  const wasm = await fs.promises.readFile(fileURLToPath(import.meta.resolve('@taucad/kcl-wasm-lib/kcl.wasm')));
  // eslint-disable-next-line @typescript-eslint/naming-convention -- wasm-bindgen generated API
  await kcl.default({ module_or_path: await WebAssembly.compile(new Uint8Array(wasm)) });
  symbols = new KclSymbolService();
  symbols.setParseFunction(async (code) => {
    const [program] = kcl.parse_wasm(code) as [Node<Program>, unknown[]];
    return { program, errors: [], warnings: [] };
  });
}, 30_000);

const part = [
  'export fn plate(@size, thickness?: number(mm) = 2) {',
  '  return size * thickness',
  '}',
  'export width = 10',
].join('\n');

const main = [
  'import plate, width from "part.kcl"',
  'fn local(@w) {',
  '  return w',
  '}',
  'a = plate(width, thickness = 3)',
  'b = local(width)',
  'sketch = startSketchOn(XY)',
  '  |> startProfile(at = [0, 0])',
  '  |> line(end = [width, 0], tag = $edge)',
  'solid = extrude(sketch, length = width)',
].join('\n');

const other = 'import width as w from "part.kcl"\nimport * from "part.kcl"\nc = w + width';

/** An open `main.kcl` beside stored `part.kcl` and `other.kcl` files. */
function workspace(): Readonly<{ document: EditorDocument; environment: EditorLanguageEnvironment }> {
  const document = new EditorDocument('main.kcl', main);
  const stored = new Map([
    ['part.kcl', part],
    ['other.kcl', other],
  ]);
  const session = mock<EditorDocumentSession>();
  session.get.mockImplementation((path) => (path === document.path ? document : undefined));
  const treeService = mock<FileTreeService>();
  treeService.searchFiles.mockResolvedValue(
    ['main.kcl', ...stored.keys()].map((path) =>
      mock<Awaited<ReturnType<FileTreeService['searchFiles']>>[number]>({
        path,
        name: path,
        type: 'file',
        provenance: undefined,
      }),
    ),
  );
  const contentService = mock<FileContentService>();
  contentService.resolve.mockImplementation(async (path) => {
    const text = stored.get(path);
    if (text === undefined) {
      throw new Error(`Not stored: ${path}`);
    }
    return { kind: 'text', content: new TextEncoder().encode(text) };
  });
  const fileManagerRef = mock<EditorLanguageEnvironment['fileManagerRef']>();
  fileManagerRef.getSnapshot.mockReturnValue(
    mock<ReturnType<typeof fileManagerRef.getSnapshot>>({
      context: mock<ReturnType<typeof fileManagerRef.getSnapshot>['context']>({ rootDirectory: '/' }),
    }),
  );
  const environment = mock<EditorLanguageEnvironment>({
    session,
    treeService,
    contentService,
    fileManagerRef,
    navigate: vi.fn(),
  });
  return { document, environment };
}

function context(): KclNavigationContext {
  const { document, environment } = workspace();
  return { document, environment, symbols };
}

describe('KCL navigation (real WASM parse)', () => {
  it('finds references to an exported name in every file that imports it', async () => {
    const navigation = context();
    const references = await kclReferences(navigation, main.indexOf('width'));
    const summary = references.map(
      (reference) => `${reference.uri.split('/').pop()}:${reference.line}:${reference.column}`,
    );
    expect(summary).toEqual([
      'main.kcl:1:15',
      'main.kcl:5:11',
      'main.kcl:6:11',
      'main.kcl:9:18',
      'main.kcl:10:34',
      'part.kcl:4:8',
      'other.kcl:1:8',
      'other.kcl:3:9',
    ]);
    expect(references[1]?.lineText).toBe('a = plate(width, thickness = 3)');
  });

  it('keeps references to a local parameter inside its function', async () => {
    const navigation = context();
    const references = await kclReferences(navigation, main.indexOf('w)'));
    expect(references.map((reference) => reference.line)).toEqual([2, 3]);
    expect(await kclOccurrences(navigation, main.indexOf('w)'))).toEqual([
      { from: main.indexOf('@w') + 1, to: main.indexOf('@w') + 2, kind: 'write' },
      { from: main.indexOf('return w') + 7, to: main.indexOf('return w') + 8, kind: 'read' },
    ]);
  });

  it('resolves definitions through imports, scopes and the standard library', async () => {
    const navigation = context();
    expect(await kclDefinition(navigation, main.indexOf('plate('))).toEqual({
      kind: 'file',
      uri: 'file:///part.kcl',
      line: 1,
      column: 11,
    });
    expect(await kclDefinition(navigation, main.indexOf('edge'))).toMatchObject({ kind: 'file', line: 9 });
    const extrude = await kclDefinition(navigation, main.indexOf('extrude'));
    expect(extrude).toMatchObject({ kind: 'stdlib', module: 'std::sketch' });
    const stdlib = await loadKclStdlib();
    const source = stdlib.source('std::sketch')?.split('\n') ?? [];
    expect(source[(extrude?.line ?? 0) - 1]).toMatch(/^export fn extrude\(/u);

    await openKclTarget(navigation.environment, extrude!);
    expect(navigation.environment.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ uri: 'file:///__kcl_std__/std/sketch.kcl', declaration: { text: source.join('\n') } }),
    );
  });

  it('goes to the type of annotated parameters, tags and declared types', async () => {
    const navigation = {
      ...context(),
      document: new EditorDocument(
        'types.kcl',
        'type Width = number\nfn f(@s: Sketch, w: Width) { return w }\nx = startSketchOn(XY)\n  |> startProfile(at = [0, 0], tag = $t)',
      ),
    };
    const { text } = navigation.document;
    expect(await kclTypeDefinition(navigation, text.indexOf('w:'))).toEqual({
      kind: 'file',
      uri: navigation.document.uri,
      line: 1,
      column: 6,
    });
    expect(await kclTypeDefinition(navigation, text.indexOf('s:'))).toMatchObject({
      kind: 'stdlib',
      module: 'std::types',
    });
    expect(await kclTypeDefinition(navigation, text.indexOf('$t') + 1)).toMatchObject({ kind: 'stdlib' });
  });

  it('turns standard library docs links into definition links', async () => {
    const stdlib = await loadKclStdlib();
    const result = kclDocumentationMarkdown(
      [
        'See [`region`](/docs/kcl-std/functions/std-sketch-region), [number](/docs/kcl-std/types/std-types-number),',
        '[sketches](/docs/kcl-lang/sketches) and [`solver::line`](/docs/kcl-std/functions/std-solver-line).',
      ].join(' '),
      stdlib,
    );
    expect(result.targets).toEqual([
      expect.objectContaining({ kind: 'stdlib', module: 'std::sketch' }),
      expect.objectContaining({ kind: 'stdlib', module: 'std::types' }),
    ]);
    expect(result.markdown).toContain('[`region`](#tau-definition-0)');
    expect(result.markdown).toContain('[sketches](https://zoo.dev/docs/kcl-lang/sketches)');
    // A page the vendored declarations do not cover still opens, as external documentation.
    expect(result.markdown).toContain('[`solver::line`](https://zoo.dev/docs/kcl-std/functions/std-solver-line)');
    expect(kclDocumentationMarkdown('[number](/docs/kcl-std/types/std-types-number)', undefined).targets).toEqual([]);
  });

  it('answers signature help and positional parameter hints', async () => {
    const navigation = context();
    const signature = await kclSignatureAt(navigation, main.indexOf('thickness = 3') + 2);
    expect(signature).toBeUndefined();
    const local = await kclSignatureAt(navigation, main.indexOf('local(width') + 7);
    expect(local).toEqual({ label: 'local(@w)', parameters: [[6, 8]], activeParameter: 0 });
    const extrude = await kclSignatureAt(navigation, main.indexOf('length = width') + 1);
    expect(extrude?.label).toMatch(/^extrude\(@sketches: /u);
    const active = extrude?.parameters[extrude.activeParameter];
    expect(extrude?.label.slice(active?.[0], active?.[1])).toMatch(/^length\?/u);

    const hints = await kclParameterHints(navigation, { from: 0, to: main.length });
    expect(hints).toEqual([
      { position: main.indexOf('local(width') + 6, label: 'w:' },
      { position: main.indexOf('XY'), label: 'planeOrSolid:' },
      { position: main.indexOf('sketch, length'), label: 'sketches:' },
    ]);
  });
});
