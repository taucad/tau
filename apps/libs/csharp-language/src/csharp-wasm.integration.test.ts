import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCsharpServer, sha256Hex } from '#dotnet-host.js';
import type { CsharpServerExports } from '#dotnet-host.js';

/*
 * Boots the published browser-wasm bundle (`csharp-language:prepare`) on Node's WebAssembly engine, the same Mono
 * interpreter and trimmed assemblies the browser worker loads, and drives the server over its JSON-RPC surface.
 */
const stage = resolve(import.meta.dirname, '../../../../out/csharp-language/stage');
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
  'using System.Numerics;',
  'using PicoGK;',
  '',
  'Library.Go(1.0f, () =>',
  '{',
  '    var sphere = Shapes.Ball(16.0f);',
  '    Library.oViewer().Add(sphere);',
  '});',
].join('\n');

const shapes = [
  'using System.Numerics;',
  'using PicoGK;',
  '',
  'public static class Shapes',
  '{',
  '    /// <summary>A ball at the origin, as <see cref="Voxels"/>.</summary><param name="radius">Passed to <see cref="Voxels"/>.</param>',
  '    public static Voxels Ball(float radius) => Voxels.voxSphere(Vector3.Zero, radius);',
  '}',
].join('\n');

type Json = Record<string, unknown>;

describe('C# language server on .NET WebAssembly', () => {
  let server: CsharpServerExports;
  let nextId = 0;

  const request = async <T = Json>(method: string, params: unknown): Promise<T> => {
    const id = ++nextId;
    const raw = await server.handle(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    const response = JSON.parse(raw!) as { id: number; result?: T; error?: { message: string } };
    expect(response.id).toBe(id);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.result as T;
  };

  const notify = async (method: string, params: unknown): Promise<void> => {
    expect(await server.handle(JSON.stringify({ jsonrpc: '2.0', method, params }))).toBeUndefined();
  };

  beforeAll(async () => {
    const manifest = new Uint8Array(await readFile(manifestPath));
    server = await loadCsharpServer({
      assets: { url: pathToFileURL(manifestPath).href, sha256: await sha256Hex(manifest) },
      fetch: fileFetch,
    });
    await request('initialize', { capabilities: {} });
    await notify('tau/workspaceFiles', {
      replace: true,
      files: [
        { uri: 'file:///main.cs', text: main },
        { uri: 'file:///Shapes.cs', text: shapes },
      ],
    });
    await notify('textDocument/didOpen', {
      textDocument: { uri: 'file:///main.cs', languageId: 'csharp', version: 1, text: main },
    });
    await server.warmUp();
  }, 240_000);

  it('reports diagnostics from the PicoGK compiler contract', async () => {
    expect(await request('textDocument/diagnostic', { textDocument: { uri: 'file:///main.cs' } })).toEqual({
      kind: 'full',
      items: [],
    });
    await notify('textDocument/didChange', {
      textDocument: { uri: 'file:///main.cs', version: 2 },
      contentChanges: [{ range: { start: { line: 5, character: 24 }, end: { line: 5, character: 28 } }, text: 'Cube' }],
    });
    const report = await request<{ items: Array<{ code: string; message: string }> }>('textDocument/diagnostic', {
      textDocument: { uri: 'file:///main.cs' },
    });
    expect(report.items.map((item) => item.message)).toEqual([
      expect.stringContaining("'Shapes' does not contain a definition for 'Cube'"),
    ]);
    await notify('textDocument/didChange', {
      textDocument: { uri: 'file:///main.cs', version: 3 },
      contentChanges: [{ text: main }],
    });
  });

  it('completes PicoGK members and resolves their documentation', async () => {
    const list = await request<{ items: Array<Json & { label: string }> }>('textDocument/completion', {
      textDocument: { uri: 'file:///Shapes.cs' },
      position: { line: 6, character: 58 },
    });
    const sphere = list.items.find((item) => item.label === 'voxSphere');
    expect(sphere).toMatchObject({ kind: 2 });
    const resolved = await request<{ documentation?: { value: string } }>('completionItem/resolve', sphere);
    expect(resolved.documentation?.value).toContain('voxSphere');
  });

  it('links documentation references in completion details and signature help', async () => {
    const voxels = 'file:///__csharp_metadata__/PicoGK/PicoGK.Voxels.cs';
    const list = await request<{ items: Array<Json & { label: string }> }>('textDocument/completion', {
      textDocument: { uri: 'file:///main.cs' },
      position: { line: 5, character: 24 },
    });
    const ball = list.items.find((item) => item.label === 'Ball');
    const resolved = await request<{ documentation?: { value: string }; definitionTargets?: Array<{ uri: string }> }>(
      'completionItem/resolve',
      ball,
    );
    expect(resolved.documentation?.value).toContain('A ball at the origin, as [`Voxels`](#tau-definition-0).');
    expect(resolved.definitionTargets).toEqual([expect.objectContaining({ uri: voxels })]);
    const help = await request<{
      signatures: Array<{
        documentation?: { value: string };
        parameters: Array<{ documentation?: { value: string } }>;
      }>;
      definitionTargets?: Array<{ uri: string }>;
    }>('textDocument/signatureHelp', {
      textDocument: { uri: 'file:///main.cs' },
      position: { line: 5, character: 29 },
    });
    expect(help.signatures[0]?.documentation?.value).toBe('A ball at the origin, as [`Voxels`](#tau-definition-0).');
    expect(help.signatures[0]?.parameters[0]?.documentation?.value).toBe('Passed to [`Voxels`](#tau-definition-0).');
    expect(help.definitionTargets).toEqual([expect.objectContaining({ uri: voxels })]);
  });

  it('hovers with signatures and XML documentation', async () => {
    const hover = await request<{ contents: { value: string } }>('textDocument/hover', {
      textDocument: { uri: 'file:///main.cs' },
      position: { line: 5, character: 25 },
    });
    expect(hover.contents.value).toContain('Voxels Shapes.Ball(float radius)');
    expect(hover.contents.value).toContain('A ball at the origin, as [`Voxels`](#tau-definition-0).');
  });

  it('navigates across files and into generated library declarations', async () => {
    const [local] = await request<Array<{ uri: string; range: { start: { line: number } } }>>(
      'textDocument/definition',
      {
        textDocument: { uri: 'file:///main.cs' },
        position: { line: 5, character: 25 },
      },
    );
    expect(local).toMatchObject({ uri: 'file:///Shapes.cs', range: { start: { line: 6 } } });
    const [library] = await request<Array<{ uri: string; range: { start: { line: number; character: number } } }>>(
      'textDocument/definition',
      { textDocument: { uri: 'file:///main.cs' }, position: { line: 6, character: 14 } },
    );
    expect(library?.uri).toBe('file:///__csharp_metadata__/PicoGK/PicoGK.Library.cs');
    const source = await request<{ text: string }>('tau/metadataSource', { uri: library!.uri });
    const line = source.text.split('\n')[library!.range.start.line]!;
    expect(line.slice(library!.range.start.character)).toMatch(/^oViewer\(\)/u);
  });

  it('renames across files and offers code fixes', async () => {
    const edit = await request<{ documentChanges: Array<{ textDocument: { uri: string } }> }>('textDocument/rename', {
      textDocument: { uri: 'file:///main.cs' },
      position: { line: 5, character: 25 },
      newName: 'Sphere',
    });
    expect(edit.documentChanges.map((change) => change.textDocument.uri).sort()).toEqual([
      'file:///Shapes.cs',
      'file:///main.cs',
    ]);
    await notify('textDocument/didOpen', {
      textDocument: {
        uri: 'file:///fix.cs',
        languageId: 'csharp',
        version: 1,
        text: 'class Fix { object O = Vector3.Zero; }',
      },
    });
    const actions = await request<Array<Json & { title: string }>>('textDocument/codeAction', {
      textDocument: { uri: 'file:///fix.cs' },
      range: { start: { line: 0, character: 25 }, end: { line: 0, character: 25 } },
    });
    const addUsing = actions.find((action) => action.title === 'using System.Numerics;');
    expect(addUsing).toBeDefined();
    const resolved = await request<{ edit: { documentChanges: Array<{ edits: Array<{ newText: string }> }> } }>(
      'codeAction/resolve',
      addUsing,
    );
    expect(resolved.edit.documentChanges[0]?.edits[0]?.newText).toContain('using System.Numerics;');
  });

  it('classifies semantic tokens and folds blocks', async () => {
    const tokens = await request<{ data: number[] }>('textDocument/semanticTokens/full', {
      textDocument: { uri: 'file:///Shapes.cs' },
    });
    expect(tokens.data.length).toBeGreaterThan(40);
    expect(tokens.data.length % 5).toBe(0);
    const folds = await request<Array<{ startLine: number; endLine: number }>>('textDocument/foldingRange', {
      textDocument: { uri: 'file:///Shapes.cs' },
    });
    expect(folds).toContainEqual({ startLine: 4, endLine: 6 });
  });

  it('answers warm requests within an interactive budget', async () => {
    const started = performance.now();
    await request('textDocument/completion', {
      textDocument: { uri: 'file:///main.cs' },
      position: { line: 6, character: 12 },
    });
    expect(performance.now() - started).toBeLessThan(2000);
  });
});
