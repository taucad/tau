import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { openscadBuiltinsUri } from '#protocol.js';
import { loadOpenscadServer, sha256Hex } from '#wasm-host.js';
import type { OpenscadServerExports } from '#wasm-host.js';

/*
 * Boots the staged WebAssembly module (`openscad-language:prepare`) on Node's WebAssembly engine, the same module the
 * browser worker loads, and drives the server over its JSON-RPC surface.
 */
const stage = resolve(import.meta.dirname, '../../../../out/openscad-language/stage');
const manifestPath = resolve(stage, 'assets-manifest.json');

const fileFetch: typeof fetch = async (input) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  try {
    return new Response(new Uint8Array(await readFile(url)));
  } catch {
    return new Response(undefined, { status: 404 });
  }
};

const main = [
  'use <lib/gears.scad>',
  '',
  '/**',
  ' * A plate under the gear. See {@link spur_gear}.',
  ' * @param width Plate width',
  ' */',
  'module plate(width = 40) {',
  '  cube([width, width, 2]);',
  '}',
  '',
  'plate(width = 60);',
  'spur_gear(teeth = 12);',
].join('\n');

const gears = [
  '/**',
  ' * A spur gear.',
  ' * @param teeth Tooth count',
  ' */',
  'module spur_gear(teeth = 20) {',
  '  cylinder(h = 5, r = teeth / 2);',
  '}',
].join('\n');

const bracket = '/** An L bracket. */\nmodule bracket(size = 10) { cube(size); }\n';

type Json = Record<string, unknown>;

describe('OpenSCAD language server on WebAssembly', () => {
  let server: OpenscadServerExports;
  let bootMilliseconds = 0;
  let nextId = 0;

  const request = <T = Json>(method: string, params: unknown): T => {
    const id = ++nextId;
    const raw = server.handle(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    const response = JSON.parse(raw!) as { id: number; result?: T; error?: { message: string } };
    expect(response.id).toBe(id);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.result as T;
  };

  const notify = (method: string, params: unknown): void => {
    expect(server.handle(JSON.stringify({ jsonrpc: '2.0', method, params }))).toBeUndefined();
  };

  beforeAll(async () => {
    const started = performance.now();
    const manifest = new Uint8Array(await readFile(manifestPath));
    server = await loadOpenscadServer({
      assets: { url: pathToFileURL(manifestPath).href, sha256: await sha256Hex(manifest) },
      fetch: fileFetch,
    });
    request('initialize', { capabilities: {} });
    notify('tau/workspaceFiles', {
      replace: true,
      files: [
        { uri: 'file:///main.scad', text: main },
        { uri: 'file:///lib/gears.scad', text: gears },
        { uri: 'file:///parts/bracket.scad', text: bracket },
      ],
    });
    notify('textDocument/didOpen', {
      textDocument: { uri: 'file:///main.scad', languageId: 'openscad', version: 1, text: main },
    });
    bootMilliseconds = performance.now() - started;
  });

  it('boots within the interactive budget', () => {
    expect(bootMilliseconds).toBeLessThan(2000);
  });

  it('reports diagnostics and follows incremental edits', () => {
    expect(request('textDocument/diagnostic', { textDocument: { uri: 'file:///main.scad' } })).toEqual({
      kind: 'full',
      items: [],
    });
    notify('textDocument/didChange', {
      textDocument: { uri: 'file:///main.scad', version: 2 },
      contentChanges: [{ range: { start: { line: 7, character: 2 }, end: { line: 7, character: 6 } }, text: 'cub' }],
    });
    const report = request<{ items: Array<{ code: string; message: string }> }>('textDocument/diagnostic', {
      textDocument: { uri: 'file:///main.scad' },
    });
    expect(report.items.map((item) => item.message)).toEqual(['Unknown module `cub`']);
    notify('textDocument/didChange', {
      textDocument: { uri: 'file:///main.scad', version: 3 },
      contentChanges: [{ text: main }],
    });
  });

  it('completes built-ins and project modules, adding the import for an unimported file', () => {
    const list = request<{ items: Array<Json & { label: string }> }>('textDocument/completion', {
      textDocument: { uri: 'file:///main.scad' },
      position: { line: 11, character: 22 },
    });
    expect(list.items.find((item) => item.label === 'cube')).toMatchObject({
      detail: 'module cube(size = [1, 1, 1], center = false)',
    });
    expect(list.items.find((item) => item.label === 'spur_gear')).toMatchObject({ kind: 3 });
    expect(list.items.find((item) => item.label === 'bracket')).toBeUndefined();
    notify('textDocument/didChange', {
      textDocument: { uri: 'file:///main.scad', version: 4 },
      contentChanges: [
        { range: { start: { line: 11, character: 22 }, end: { line: 11, character: 22 } }, text: '\nbr' },
      ],
    });
    const imported = request<{ items: Array<Json & { label: string }> }>('textDocument/completion', {
      textDocument: { uri: 'file:///main.scad' },
      position: { line: 12, character: 2 },
    });
    expect(imported.items.find((item) => item.label === 'bracket')).toMatchObject({
      additionalTextEdits: [
        {
          range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } },
          newText: 'use <parts/bracket.scad>\n',
        },
      ],
    });
    notify('textDocument/didChange', {
      textDocument: { uri: 'file:///main.scad', version: 5 },
      contentChanges: [{ text: main }],
    });
  });

  it('hovers with signatures, documentation and resolved links', () => {
    const hover = request<{ contents: { value: string } }>('textDocument/hover', {
      textDocument: { uri: 'file:///main.scad' },
      position: { line: 10, character: 2 },
    });
    expect(hover.contents.value).toContain('module plate(width = 40)');
    expect(hover.contents.value).toContain('See [`spur_gear`](file:///lib/gears.scad#L5,8).');
    expect(hover.contents.value).toContain('*@param* `width` — Plate width');
  });

  it('navigates across files and into built-in declarations', () => {
    const [local] = request<Array<{ targetUri: string; targetSelectionRange: { start: { line: number } } }>>(
      'textDocument/definition',
      { textDocument: { uri: 'file:///main.scad' }, position: { line: 11, character: 3 } },
    );
    expect(local).toMatchObject({ targetUri: 'file:///lib/gears.scad', targetSelectionRange: { start: { line: 4 } } });
    const [builtin] = request<
      Array<{ targetUri: string; targetSelectionRange: { start: { line: number; character: number } } }>
    >('textDocument/definition', { textDocument: { uri: 'file:///main.scad' }, position: { line: 7, character: 3 } });
    expect(builtin?.targetUri).toBe(openscadBuiltinsUri);
    const source = request<{ text: string }>('tau/declarationSource', { uri: builtin!.targetUri });
    const line = source.text.split('\n')[builtin!.targetSelectionRange.start.line]!;
    expect(line.slice(builtin!.targetSelectionRange.start.character)).toMatch(/^cube\(size/u);
  });

  it('renames across files', () => {
    const edit = request<{ documentChanges: Array<{ textDocument: { uri: string } }> }>('textDocument/rename', {
      textDocument: { uri: 'file:///main.scad' },
      position: { line: 11, character: 3 },
      newName: 'gear',
    });
    expect(edit.documentChanges.map((change) => change.textDocument.uri)).toEqual([
      'file:///lib/gears.scad',
      'file:///main.scad',
    ]);
  });

  it('classifies semantic tokens and folds blocks', () => {
    const tokens = request<{ data: number[] }>('textDocument/semanticTokens/full', {
      textDocument: { uri: 'file:///main.scad' },
    });
    expect(tokens.data.length).toBeGreaterThan(20);
    expect(tokens.data.length % 5).toBe(0);
    const folds = request<Array<{ startLine: number; endLine: number }>>('textDocument/foldingRange', {
      textDocument: { uri: 'file:///main.scad' },
    });
    expect(folds).toContainEqual({ startLine: 6, endLine: 8 });
  });

  it('answers warm requests within an interactive budget', () => {
    const started = performance.now();
    request('textDocument/completion', {
      textDocument: { uri: 'file:///main.scad' },
      position: { line: 7, character: 4 },
    });
    request('textDocument/hover', { textDocument: { uri: 'file:///main.scad' }, position: { line: 11, character: 3 } });
    request('textDocument/diagnostic', { textDocument: { uri: 'file:///main.scad' } });
    expect(performance.now() - started).toBeLessThan(250);
  });
});
