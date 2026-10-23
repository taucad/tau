/**
 * The host half of the `tau mcp` viewer: which file a call shows, how a source
 * becomes a GLB in a watched session, what the page may read, and what the loopback server admits.
 */

import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Server } from 'node:http';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TauMcpViewerCallOptions } from '@taucad/mcp';
import { tauViewerAcceptedViewFields } from '@taucad/mcp/viewer-protocol';
import type { TauViewerShowResult, TauViewerSyncResult } from '@taucad/mcp/viewer-protocol';
import { tauCadTopologyExtension } from '@taucad/runtime/types';

import { markedGlb, scriptedRuntime } from '#mcp-entry-sessions.fixture.js';
import type { ScriptedRender, ScriptedRuntime } from '#mcp-entry-sessions.fixture.js';
import type { EntryDocument, EntrySessionRuntime } from '#mcp-entry-sessions.js';
import { viewerSettings } from '#mcp-viewer-chrome.js';
import { createLocalMcpViewer } from '#mcp-viewer.js';
import type { LocalMcpViewer, LocalMcpViewerOptions } from '#mcp-viewer.js';

const page = { html: '<!doctype html><title>Tau viewer</title>', sha256: 'c'.repeat(64) };
const glb = Buffer.from('glTF-binary-bytes');
const sha = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');

const inline: TauMcpViewerCallOptions = { toolCallId: 'call-1', presentation: 'inline' };
const text: TauMcpViewerCallOptions = { toolCallId: 'call-2', presentation: 'text' };

let root: string;
let viewer: LocalMcpViewer;
let runtime: ScriptedRuntime;
let liveRuntime: ReturnType<typeof vi.fn<NonNullable<LocalMcpViewerOptions['liveRuntime']>>>;
/** What the next render of a source answers; a broken source fails. */
let renderOf: (entryPath: string, count: number) => ScriptedRender;

const shownModel = (result: unknown): TauViewerShowResult => {
  if (typeof result !== 'object' || result === null || !('model' in result)) {
    throw new Error(`Expected a shown model, got ${JSON.stringify(result)}`);
  }
  return result as TauViewerShowResult;
};

const syncedOf = (result: unknown): TauViewerSyncResult => {
  if (typeof result !== 'object' || result === null || !('version' in result)) {
    throw new Error(`Expected a sync answer, got ${JSON.stringify(result)}`);
  }
  return result as TauViewerSyncResult;
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'tau-viewer-'));
  await mkdir(join(root, 'src'));
  await mkdir(join(root, 'models'));
  await mkdir(join(root, 'node_modules', 'pkg'), { recursive: true });
  await writeFile(join(root, 'src', 'bracket.ts'), 'export default () => null;');
  await writeFile(join(root, 'src', 'bracket.test.ts'), '');
  await writeFile(join(root, 'models', 'part.glb'), glb);
  await writeFile(join(root, 'node_modules', 'pkg', 'index.js'), '');
  await writeFile(join(root, 'tau.json'), JSON.stringify({ assets: { main: { entryPath: 'src/bracket.ts' } } }));
  renderOf = (entryPath, count) =>
    entryPath === 'src/broken.ts'
      ? { issues: [{ message: 'Bad model.', code: 'BUNDLER_FAILED', severity: 'error' }] }
      : { bytes: markedGlb(count) };
  runtime = scriptedRuntime({ render: (entryPath, count) => renderOf(entryPath, count) });
  liveRuntime = vi.fn<NonNullable<LocalMcpViewerOptions['liveRuntime']>>(async () => runtime);
  viewer = createLocalMcpViewer({ page, namedRoot: () => root, workspaceRoot: root, liveRuntime });
});

afterEach(async () => {
  await viewer.close();
  await rm(root, { recursive: true, force: true });
});

describe('createLocalMcpViewer', () => {
  it('should show a GLB as it is, without rendering', async () => {
    const { model, viewerUrl } = shownModel(await viewer.show({ targetFile: 'models/part.glb' }, inline));

    expect(model).toEqual({
      id: expect.any(String) as unknown,
      title: 'part',
      path: 'models/part.glb',
      mimeType: 'model/gltf-binary',
      byteLength: glb.length,
      sha256: sha(glb),
      projectKey: createHash('sha256').update(root).digest('hex').slice(0, 16),
    });
    expect(viewerUrl).toBeUndefined();
    expect(runtime.documents).toHaveLength(0);
  });

  it("should render the shown model's part thumbnails through its page tool, refusing a model it did not show", async () => {
    const partThumbnails = vi.fn<NonNullable<LocalMcpViewerOptions['partThumbnails']>>(async ({ request }) => ({
      thumbnails: request.parts.map(({ id }) => ({ id, mimeType: 'image/webp', data: 'AQID' })),
    }));
    const withThumbnails = createLocalMcpViewer({
      page,
      namedRoot: () => root,
      workspaceRoot: root,
      liveRuntime,
      partThumbnails,
    });
    const tool = withThumbnails.pageTools?.find(({ name }) => name === 'app_part_thumbnails');
    const { model } = shownModel(await withThumbnails.show({ targetFile: 'models/part.glb' }, inline));
    const parts = [{ id: 'gear', primitives: [{ nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 }] }];

    await expect(tool?.call({ modelId: model.id, parts }, inline)).resolves.toEqual({
      thumbnails: [{ id: 'gear', mimeType: 'image/webp', data: 'AQID' }],
    });
    expect(partThumbnails).toHaveBeenCalledWith(
      expect.objectContaining({ root, source: { absolutePath: join(root, 'models', 'part.glb') } }),
    );
    /* A watched source's render is drawn from the session's memory, never from the project. */
    const rendered = shownModel(await withThumbnails.show({ targetFile: 'src/bracket.ts' }, inline)).model;
    await expect(tool?.call({ modelId: rendered.id, parts }, inline)).resolves.toMatchObject({
      thumbnails: [{ id: 'gear' }],
    });
    expect(partThumbnails).toHaveBeenLastCalledWith(
      expect.objectContaining({
        root,
        source: { bytes: expect.any(Uint8Array) as unknown, mimeType: 'model/gltf-binary' },
      }),
    );
    expect(rendered.projectKey).toBe(createHash('sha256').update(root).digest('hex').slice(0, 16));
    await expect(tool?.call({ modelId: 'unknown', parts }, inline)).resolves.toMatchObject({
      errorCode: 'UNKNOWN_MODEL',
    });
    expect(() =>
      tool?.inputSchema.parse({ modelId: model.id, parts: Array.from({ length: 5 }, () => parts[0]) }),
    ).toThrow();
    expect(() => tool?.inputSchema.parse({ modelId: model.id, parts, size: 1024 })).toThrow();
    expect(viewer.pageTools?.some(({ name }) => name === 'app_part_thumbnails')).toBe(false);
    await withThumbnails.close();
  });

  it("should keep the shown entry's render timeout and save captures for the page's bar", async () => {
    const settings = viewer.pageTools?.find(({ name }) => name === 'app_viewer_settings');
    const capture = viewer.pageTools?.find(({ name }) => name === 'app_save_capture');
    const { model } = shownModel(await viewer.show({ targetFile: 'src/bracket.ts' }, inline));
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');

    await expect(settings?.call({ modelId: model.id, renderTimeout: 45_000 }, inline)).resolves.toEqual({
      renderTimeout: 45_000,
      defaultRenderTimeout: 600_000,
    });
    await expect(capture?.call({ modelId: model.id, data: png }, inline)).resolves.toMatchObject({
      path: 'exports/bracket-capture-1.png',
    });
    await expect(settings?.call({ modelId: 'unknown' }, inline)).resolves.toMatchObject({ errorCode: 'UNKNOWN_MODEL' });
  });

  it("should answer RENDER_TIMEOUT when a watched source outlasts its entry's render timeout", async () => {
    await viewerSettings({
      root,
      entryPath: 'src/bracket.ts',
      defaultRenderTimeout: 600_000,
      request: { modelId: 'any', renderTimeout: 20 },
    });
    /* A runtime whose evaluation never settles until the call gives up on it. */
    const stalled: EntrySessionRuntime = {
      lifecycleState: 'connected',
      capabilities: undefined,
      open: () =>
        ({
          on: () => () => undefined,
          evaluation: async ({ signal }: { signal?: AbortSignal } = {}) =>
            new Promise((_resolve, reject) => {
              signal?.addEventListener('abort', () => {
                reject(new Error('The render was given up on.'));
              });
            }),
          view: () => ({
            on: () => () => undefined,
            rendering: async () =>
              new Promise(() => {
                /* Never renders. */
              }),
            close: () => undefined,
          }),
          close: () => undefined,
        }) as unknown as EntryDocument,
    };
    const slow = createLocalMcpViewer({
      page,
      namedRoot: () => root,
      workspaceRoot: root,
      liveRuntime: async () => stalled,
    });

    await expect(slow.show({ targetFile: 'src/bracket.ts' }, inline)).resolves.toMatchObject({
      errorCode: 'RENDER_TIMEOUT',
    });
    await slow.close();
  });

  it('should show a GLB exported from a source with that source, so its panes have parameters', async () => {
    const folder = join(root, '.tau', 'artifacts', 'tc-7__src_bracket.ts-glb');
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, 'model.glb'), glb);
    await writeFile(join(root, 'src', 'bracket.glb'), glb);

    const exported = shownModel(
      await viewer.show({ targetFile: '.tau/artifacts/tc-7__src_bracket.ts-glb/model.glb' }, inline),
    );
    const beside = shownModel(await viewer.show({ targetFile: 'src/bracket.glb' }, inline));
    const unmatched = shownModel(await viewer.show({ targetFile: 'models/part.glb' }, inline));

    expect(exported.model).toMatchObject({
      path: '.tau/artifacts/tc-7__src_bracket.ts-glb/model.glb',
      sourceFile: 'src/bracket.ts',
    });
    expect(exported.hint).toBe(
      '.tau/artifacts/tc-7__src_bracket.ts-glb/model.glb is an export of src/bracket.ts, drawn as exported. Call show_model with targetFile src/bracket.ts to show the source with its parameters and mechanism.',
    );
    expect(beside.model).toMatchObject({ path: 'src/bracket.glb', sourceFile: 'src/bracket.ts' });
    expect(unmatched.model.sourceFile).toBeUndefined();
    expect(unmatched.hint).toBeUndefined();
    expect(runtime.documents).toHaveLength(0);
  });

  it('should name the source of an exported STEP it converts, and none for a source or an unmatched export', async () => {
    const folder = join(root, '.tau', 'artifacts', 'tc-8__src_bracket.ts-step');
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, 'assembly.step'), 'ISO-10303-21;');
    await mkdir(join(root, '.tau', 'artifacts', 'tc-9__gone.ts-step'), { recursive: true });
    await writeFile(join(root, '.tau', 'artifacts', 'tc-9__gone.ts-step', 'assembly.step'), 'ISO-10303-21;');
    const step = shownModel(
      await viewer.show({ targetFile: '.tau/artifacts/tc-8__src_bracket.ts-step/assembly.step' }, inline),
    );
    const orphan = shownModel(
      await viewer.show({ targetFile: '.tau/artifacts/tc-9__gone.ts-step/assembly.step' }, inline),
    );
    const source = shownModel(await viewer.show({ targetFile: 'src/bracket.ts' }, inline));

    expect(step.model).toMatchObject({
      title: 'assembly',
      sourceFile: '.tau/artifacts/tc-8__src_bracket.ts-step/assembly.step',
    });
    expect(step.hint).toContain('is an export of src/bracket.ts, drawn as exported.');
    expect(orphan.hint).toBeUndefined();
    expect(source.hint).toBeUndefined();
  });

  it('should render a CAD source in a watched session, in memory, and write nothing to the project', async () => {
    const { model } = shownModel(await viewer.show({ targetFile: 'src/bracket.ts' }, inline));
    const again = shownModel(await viewer.show({ targetFile: 'src/bracket.ts' }, inline));

    expect(liveRuntime).toHaveBeenCalledWith(root);
    expect(runtime.documents).toHaveLength(1);
    expect(runtime.documents[0]).toMatchObject({ entryPath: 'src/bracket.ts', watch: true });
    expect(model).toMatchObject({
      title: 'bracket',
      path: 'src/bracket.ts',
      sourceFile: 'src/bracket.ts',
      mimeType: 'model/gltf-binary',
      byteLength: 16,
      sha256: sha(markedGlb(1)),
      sourceRevision: { entry: 'src/bracket.ts', files: { 'src/bracket.ts': 'sha256:1' } },
    });
    expect(again.model).toEqual(model);
    expect(await viewer.read({ modelId: model.id, offset: 0, length: 64 }, inline)).toEqual({
      offset: 0,
      byteLength: 16,
      totalBytes: 16,
      data: Buffer.from(markedGlb(1)).toString('base64'),
    });
    expect(await readdir(root)).not.toContain('.tau');
  });

  it("should preview a drag's values on the shown source's document, and refuse a drawn file or an unknown model", async () => {
    const { model } = shownModel(await viewer.show({ targetFile: 'src/bracket.ts' }, inline));
    const part = shownModel(await viewer.show({ targetFile: 'models/part.glb' }, inline));

    expect(await viewer.previewParameters?.({ modelId: model.id, parameters: { width: 30 } }, inline)).toEqual({
      accepted: true,
    });
    expect(runtime.documents[0]?.updates).toEqual([{ parameters: { width: 30 }, transient: true }]);
    /* The page follows its drag through the source's newest render, which no write left in the project. */
    const card = syncedOf(
      await viewer.sync(
        {
          pageId: 'card-source',
          version: 0,
          follow: false,
          wait: false,
          view: {
            model: { id: model.id, title: model.title, path: model.path, sourceFile: model.sourceFile },
            selected: [],
            hidden: [],
            isolated: [],
            sectionActive: false,
            measurementCount: 0,
            composition: 'inline',
            interactedAt: 1,
          },
        },
        inline,
      ),
    );
    expect(card.show?.model.sha256).toBe(sha(markedGlb(2)));
    expect(card.status?.['src/bracket.ts']?.building).toBe(false);
    expect(await viewer.previewParameters?.({ modelId: model.id }, inline)).toEqual({ accepted: true });
    expect(runtime.documents[0]?.updates.at(-1)).toEqual({});

    expect(
      await viewer.previewParameters?.({ modelId: part.model.id, parameters: { width: 30 } }, inline),
    ).toMatchObject({ errorCode: 'NOT_LIVE' });
    expect(await viewer.previewParameters?.({ modelId: 'unknown', parameters: {} }, inline)).toMatchObject({
      errorCode: 'UNKNOWN_MODEL',
    });
    expect(await readdir(root)).not.toContain('.tau');
  });

  it('should hand a newer render and the build status to the pages showing the source, and only to them', async () => {
    const { model } = shownModel(await viewer.show({ targetFile: 'src/bracket.ts' }, inline));
    const part = shownModel(await viewer.show({ targetFile: 'models/part.glb' }, inline));
    const viewOf = (shownOne: TauViewerShowResult['model']) =>
      ({
        model: { id: shownOne.id, title: shownOne.title, path: shownOne.path, sourceFile: shownOne.sourceFile },
        selected: [],
        hidden: [],
        isolated: [],
        sectionActive: false,
        measurementCount: 0,
        composition: 'inline',
        interactedAt: 1,
      }) as const;
    /* Two cards: one on the source, one on the drawn file. Neither follows show_model. */
    const card = { pageId: 'card-source', follow: false, view: viewOf(model) } as const;
    const other = { pageId: 'card-part', follow: false, view: viewOf(part.model) } as const;
    const first = syncedOf(await viewer.sync({ ...card, version: 0, wait: false }, inline));
    await viewer.sync({ ...other, version: 0, wait: false }, inline);
    expect(first.show).toBeUndefined();
    expect(first.status).toEqual({
      'src/bracket.ts': expect.objectContaining({ building: false, issues: [] }) as unknown,
    });

    const held = viewer.sync({ ...card, version: first.version, wait: true }, inline);
    const heldOther = viewer.sync({ ...other, version: first.version, wait: true }, inline);
    await runtime.edit('src/bracket.ts');
    const synced = syncedOf(await held);

    expect(synced.show?.model).toMatchObject({ path: 'src/bracket.ts', sha256: sha(markedGlb(2)) });
    expect(synced.show?.model.id).not.toBe(model.id);
    expect(synced.status?.['src/bracket.ts']?.sourceRevision).toEqual({
      entry: 'src/bracket.ts',
      files: { 'src/bracket.ts': 'sha256:2' },
    });
    /* The previous render stays readable while the page fetches the newer one. */
    expect(await viewer.read({ modelId: model.id, offset: 0, length: 4 }, inline)).toMatchObject({ totalBytes: 16 });
    await viewer.close();
    expect(syncedOf(await heldOther).show).toBeUndefined();
  });

  it('should watch a shown source again when a page syncs after its runtime was released', async () => {
    const { model } = shownModel(await viewer.show({ targetFile: 'src/bracket.ts' }, inline));
    const card = {
      pageId: 'card-source',
      follow: false,
      view: {
        model: { id: model.id, title: model.title, path: model.path, sourceFile: model.sourceFile },
        selected: [],
        hidden: [],
        isolated: [],
        sectionActive: false,
        measurementCount: 0,
        composition: 'inline',
        interactedAt: 1,
      },
    } as const;
    const first = syncedOf(await viewer.sync({ ...card, version: 0, wait: false }, inline));
    runtime.terminate();
    runtime = scriptedRuntime({ render: (entryPath, count) => renderOf(entryPath, count) });

    await viewer.sync({ ...card, version: first.version, wait: false }, inline);
    await vi.waitFor(() => {
      expect(runtime.documents).toHaveLength(1);
    });
    await runtime.edit('src/bracket.ts');
    const synced = syncedOf(await viewer.sync({ ...card, version: first.version, wait: false }, inline));

    expect(liveRuntime).toHaveBeenLastCalledWith(root);
    expect(synced.show?.model).toMatchObject({ path: 'src/bracket.ts', sha256: sha(markedGlb(2)) });
  });

  it('should answer a page following show_model a newer render of the source it was shown last', async () => {
    await viewer.show({ targetFile: 'src/bracket.ts' }, inline);
    const caughtUp = syncedOf(await viewer.sync({ pageId: 'tab', version: 0, follow: true, wait: false }, inline));
    expect(caughtUp.show?.model.sourceFile).toBe('src/bracket.ts');

    await runtime.edit('src/bracket.ts');
    const synced = syncedOf(
      await viewer.sync({ pageId: 'tab', version: caughtUp.version, follow: true, wait: false }, inline),
    );
    expect(synced.show?.model.sha256).toBe(sha(markedGlb(2)));
  });

  it('should report whether the shown GLB preserved its source mechanism', async () => {
    const payload = new TextEncoder().encode(
      JSON.stringify({
        schemaVersion: 1,
        components: [],
        mechanism: {
          links: { frame: {}, sun: {} },
          joints: { sun: {} },
          animations: [{ id: 'four-sun-turns' }],
        },
      }),
    );
    const bin = new Uint8Array(Math.ceil(payload.byteLength / 4) * 4);
    bin.set(payload);
    const text = JSON.stringify({
      asset: { version: '2.0' },
      extensions: { [tauCadTopologyExtension]: { topologyBufferView: 0 } },
      buffers: [{ byteLength: bin.byteLength }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: payload.byteLength }],
    });
    const json = new TextEncoder().encode(text.padEnd(Math.ceil(text.length / 4) * 4, ' '));
    const topology = new Uint8Array(28 + json.byteLength + bin.byteLength);
    const view = new DataView(topology.buffer);
    view.setUint32(0, 0x46_54_6c_67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, topology.byteLength, true);
    view.setUint32(12, json.byteLength, true);
    view.setUint32(16, 0x4e_4f_53_4a, true);
    topology.set(json, 20);
    view.setUint32(20 + json.byteLength, bin.byteLength, true);
    view.setUint32(24 + json.byteLength, 0x00_4e_49_42, true);
    topology.set(bin, 28 + json.byteLength);
    renderOf = () => ({ bytes: topology });

    const rendered = shownModel(await viewer.show({ targetFile: 'src/bracket.ts' }, inline));
    const bare = shownModel(await viewer.show({ targetFile: 'models/part.glb' }, inline));

    expect(rendered.mechanism).toEqual({ preserved: true, joints: 1, animations: ['four-sun-turns'] });
    expect(bare.mechanism).toEqual({ preserved: false, joints: 0, animations: [] });
  });

  it('should pose the model shown last, showing a named one first', async () => {
    await expect(viewer.pose!({ coordinates: { sun: 1 } }, inline)).resolves.toMatchObject({ errorCode: 'NO_MODEL' });

    await viewer.show({ targetFile: 'src/bracket.ts' }, inline);
    const named = await viewer.pose!({ targetFile: 'models/part.glb' }, inline);
    const again = await viewer.pose!({}, inline);

    /* Neither GLB carries a mechanism; the second call poses the part the first one showed, without a render. */
    expect(named).toMatchObject({
      errorCode: 'NO_MECHANISM',
      message: expect.stringContaining('models/part.glb') as string,
    });
    expect(again).toMatchObject({
      errorCode: 'NO_MECHANISM',
      message: expect.stringContaining('models/part.glb') as string,
    });
    expect(renderGlb).toHaveBeenCalledOnce();
  });

  it('should show the main entry, then the model shown last, when no target is named', async () => {
    expect(shownModel(await viewer.show({}, inline)).model.sourceFile).toBe('src/bracket.ts');
    await viewer.show({ targetFile: 'models/part.glb' }, inline);
    expect(shownModel(await viewer.show({}, inline)).model.path).toBe('models/part.glb');
  });

  it('should keep the model shown last and the page read per conversation the host names', async () => {
    const inThread = (thread: string, toolCallId: string): TauMcpViewerCallOptions => ({
      toolCallId,
      presentation: 'inline',
      meta: { threadId: thread },
    });
    const { model } = shownModel(await viewer.show({ targetFile: 'models/part.glb' }, inThread('thread-a', 'call-a')));
    expect(shownModel(await viewer.show({}, inThread('thread-b', 'call-b'))).model.sourceFile).toBe('src/bracket.ts');
    expect(shownModel(await viewer.show({}, inThread('thread-a', 'call-a2'))).model.path).toBe('models/part.glb');

    /* A card's app_sync carries no thread; the show call it names does. */
    const view = {
      model: { id: model.id, title: model.title, path: model.path },
      selected: [],
      hidden: [],
      isolated: [],
      sectionActive: false,
      measurementCount: 0,
      composition: 'inline',
      interactedAt: 5,
    } as const;
    await viewer.sync(
      { pageId: 'card-page-a', version: 0, follow: false, wait: false, view, toolCallId: 'call-a' },
      inline,
    );
    expect(await viewer.viewState({}, inThread('thread-b', 'call-b2'))).toMatchObject({ errorCode: 'NO_VIEWER' });
    expect(await viewer.viewState({}, inThread('thread-a', 'call-a3'))).toEqual({ view });
  });

  it('should refuse a path outside the project', async () => {
    expect(await viewer.show({ targetFile: '../secret.glb' }, inline)).toMatchObject({
      errorCode: 'PATH_OUTSIDE_PROJECT',
    });
    expect(await viewer.open({ path: '/etc/passwd' }, inline)).toMatchObject({ errorCode: 'PATH_OUTSIDE_PROJECT' });
  });

  it('should pass a render failure through', async () => {
    await writeFile(join(root, 'src', 'broken.ts'), '');

    expect(await viewer.show({ targetFile: 'src/broken.ts' }, inline)).toEqual({
      errorCode: 'RENDER_FAILED',
      message: 'src/broken.ts could not be rendered: Bad model.',
    });
  });

  it("should list the project's files with exports, leaving out .tau and dependencies", async () => {
    await mkdir(join(root, 'exports'));
    await writeFile(join(root, 'exports', 'bracket.stl'), 'solid bracket');
    await mkdir(join(root, '.tau', 'artifacts'), { recursive: true });
    await writeFile(join(root, '.tau', 'artifacts', 'preview.glb'), glb);

    expect(await viewer.listFiles({ path: '' }, inline)).toEqual({
      entries: [
        { name: 'exports', path: 'exports', isFolder: true, renderable: false },
        { name: 'models', path: 'models', isFolder: true, renderable: false },
        { name: 'src', path: 'src', isFolder: true, renderable: false },
        { name: 'tau.json', path: 'tau.json', isFolder: false, size: expect.any(Number) as unknown, renderable: false },
      ],
      truncated: false,
      filesVersion: 1,
    });
    expect(await viewer.listFiles({ query: 'bracket' }, inline)).toMatchObject({
      entries: [
        { path: 'exports/bracket.stl', size: 13, renderable: true },
        { path: 'src/bracket.test.ts', renderable: false },
        { path: 'src/bracket.ts', renderable: true },
      ],
    });
  });

  it("should answer a page's sync with the new filesVersion when a file is created on disk", async () => {
    const { model } = shownModel(await viewer.show({ targetFile: 'models/part.glb' }, inline));
    const listed = await viewer.listFiles({ modelId: model.id, path: 'src' }, inline);
    const view = {
      model: { id: model.id, title: model.title, path: model.path },
      selected: [],
      hidden: [],
      isolated: [],
      sectionActive: false,
      measurementCount: 0,
      composition: 'tab',
      interactedAt: 5,
    } as const;
    const page = { pageId: 'page-files-0', follow: false, view } as const;
    const first = await viewer.sync({ ...page, version: 0, wait: false }, inline);
    expect(first).toMatchObject({ filesVersion: 'filesVersion' in listed ? listed.filesVersion : -1 });

    const held = viewer.sync({ ...page, version: 'version' in first ? first.version : 0, wait: true }, inline);
    await writeFile(join(root, 'src', 'arm.ts'), 'export default () => null;');
    const after = await held;

    expect('filesVersion' in after && after.filesVersion).toBeGreaterThan(1);
    expect(await viewer.listFiles({ modelId: model.id, path: 'src' }, inline)).toMatchObject({
      entries: expect.arrayContaining([expect.objectContaining({ path: 'src/arm.ts', renderable: true })]) as unknown,
    });
  });

  it("should open a file for the asking page only, leaving the agent's model and other pages as they are", async () => {
    const shown = shownModel(await viewer.show({ targetFile: 'models/part.glb' }, inline));
    const other = await viewer.sync({ pageId: 'page-other-0', version: 0, follow: true, wait: false }, inline);

    const opened = shownModel(await viewer.openFile({ pageId: 'page-asking-0', path: 'src/bracket.ts' }, inline));

    expect(opened.model).toMatchObject({ sourceFile: 'src/bracket.ts' });
    expect(opened.viewerUrl).toBeUndefined();
    /* The page's open watches the source as a show does, so the asking page follows its edits. */
    expect(runtime.documents).toHaveLength(1);
    expect(runtime.documents[0]).toMatchObject({ entryPath: 'src/bracket.ts', watch: true });
    /* The other page hears of no show, and the agent's show without a target still names the model it showed. */
    const version = 'version' in other ? other.version : 0;
    expect(
      await viewer.sync({ pageId: 'page-other-0', version, follow: true, wait: false }, inline),
    ).not.toHaveProperty('show');
    expect(shownModel(await viewer.show({}, inline)).model.id).toBe(shown.model.id);
    expect(
      await viewer.openFile({ pageId: 'page-asking-0', path: 'tau.json', modelId: shown.model.id }, inline),
    ).toMatchObject({ errorCode: 'NOT_RENDERABLE' });
  });

  it('should read a shown model in ranges and refuse one that changed', async () => {
    const { model } = shownModel(await viewer.show({ targetFile: 'models/part.glb' }, inline));

    expect(await viewer.read({ modelId: model.id, offset: 5, length: 6 }, inline)).toEqual({
      offset: 5,
      byteLength: 6,
      totalBytes: glb.length,
      data: glb.subarray(5, 11).toString('base64'),
    });
    expect(await viewer.read({ modelId: 'unknown', offset: 0, length: 1 }, inline)).toMatchObject({
      errorCode: 'UNKNOWN_MODEL',
    });
    await writeFile(join(root, 'models', 'part.glb'), 'changed');
    expect(await viewer.read({ modelId: model.id, offset: 0, length: 1 }, inline)).toMatchObject({
      errorCode: 'MODEL_CHANGED',
    });
  });

  describe('loopback server', () => {
    const loopbackOf = (viewerUrl: string | undefined) => {
      const url = new URL(viewerUrl ?? '');
      return { origin: url.origin, token: url.hash.slice(1), modelId: url.searchParams.get('model') ?? '' };
    };

    it('should link a text host to a loopback page carrying its token in the fragment', async () => {
      const { viewerUrl, model } = shownModel(await viewer.show({ targetFile: 'models/part.glb' }, text));
      const { origin, token, modelId } = loopbackOf(viewerUrl);

      expect(origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);
      expect(token.length).toBeGreaterThan(20);
      expect(modelId).toBe(model.id);
      const response = await fetch(`${origin}/`);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(page.html);
      expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    });

    it('should answer tool calls only with the token', async () => {
      const { viewerUrl } = shownModel(await viewer.show({ targetFile: 'models/part.glb' }, text));
      const { origin, token, modelId } = loopbackOf(viewerUrl);
      const call = async (headers: Record<string, string>) =>
        fetch(`${origin}/api/tools/call`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body: JSON.stringify({ name: 'app_read', arguments: { modelId, offset: 0, length: 4 } }),
        });

      const missing = await call({});
      const wrong = await call({ 'x-tau-viewer-token': 'wrong' });
      expect(missing.status).toBe(403);
      expect(wrong.status).toBe(403);
      const allowed = await call({ 'x-tau-viewer-token': token });
      expect(allowed.status).toBe(200);
      expect(await allowed.json()).toEqual({
        offset: 0,
        byteLength: 4,
        totalBytes: glb.length,
        data: glb.subarray(0, 4).toString('base64'),
      });
    });

    it('should hand the loopback page a shown model, with its selection, through app_sync and refuse malformed input', async () => {
      const { viewerUrl } = shownModel(await viewer.show({ targetFile: 'models/part.glb' }, text));
      const { origin, token } = loopbackOf(viewerUrl);
      const call = async (name: string, args: unknown) =>
        fetch(`${origin}/api/tools/call`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-tau-viewer-token': token },
          body: JSON.stringify({ name, arguments: args }),
        });

      const held = call('app_sync', { pageId: 'loopback-page', version: 1, follow: true, wait: true });
      const next = shownModel(await viewer.show({ targetFile: 'models/part.glb', select: ['component:arm'] }, text));
      const synced = await held;
      expect(synced.status).toBe(200);
      expect(await synced.json()).toEqual({
        accepts: [...tauViewerAcceptedViewFields],
        version: 2,
        show: { ...next, select: ['component:arm'] },
      });
      const malformed = await call('app_sync', { pageId: 'p' });
      expect(malformed.status).toBe(400);
    });

    it('should answer the model a link names, from the project it was shown in, without rendering again', async () => {
      const elsewhere = await mkdtemp(join(tmpdir(), 'tau-viewer-start-'));
      /* A host that names the project per call (Codex `_meta`); without it, the server's start folder. */
      const perCall = createLocalMcpViewer({
        page,
        namedRoot: (meta) => (meta?.['project'] === 'a' ? root : undefined),
        workspaceRoot: elsewhere,
        liveRuntime,
      });
      try {
        const projectA: TauMcpViewerCallOptions = { ...text, meta: { project: 'a' } };
        const first = shownModel(await perCall.show({ targetFile: 'src/bracket.ts' }, projectA));
        await perCall.show({ targetFile: 'models/part.glb' }, projectA);
        expect(runtime.documents).toHaveLength(1);
        const { origin, token, modelId } = loopbackOf(first.viewerUrl);
        const call = async (args: Record<string, unknown>) =>
          fetch(`${origin}/api/tools/call`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-tau-viewer-token': token },
            body: JSON.stringify({ name: 'show_model', arguments: args }),
          });

        const linked = await call({ modelId });
        expect(linked.status).toBe(200);
        expect(await linked.json()).toEqual({ model: first.model, mechanism: first.mechanism });
        expect(runtime.documents).toHaveLength(1);
        /* After a file change, the link answers the source's newest render. */
        await runtime.edit('src/bracket.ts');
        const newest = await call({ modelId });
        expect(shownModel(await newest.json()).model.sha256).toBe(sha(markedGlb(2)));
        const unknown = await call({ modelId: 'unknown' });
        expect(unknown.status).toBe(422);
        expect(await unknown.json()).toMatchObject({ errorCode: 'UNKNOWN_MODEL' });
      } finally {
        await perCall.close();
        await rm(elsewhere, { recursive: true, force: true });
      }
    });

    it("should run the panes' host tools in the linked model's project", async () => {
      const hostCall = vi.fn<NonNullable<LocalMcpViewerOptions['hostCall']>>(async () => ({
        success: true,
        parameters: {},
      }));
      const withHost = createLocalMcpViewer({
        page,
        namedRoot: () => root,
        workspaceRoot: root,
        liveRuntime,
        hostCall,
      });
      try {
        const { viewerUrl } = shownModel(await withHost.show({ targetFile: 'src/bracket.ts' }, text));
        const { origin, token, modelId } = loopbackOf(viewerUrl);
        const call = async (name: string, args: unknown, linked = true) =>
          fetch(`${origin}/api/tools/call`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-tau-viewer-token': token,
              ...(linked ? { 'x-tau-viewer-model': modelId } : {}),
            },
            body: JSON.stringify({ name, arguments: args }),
          });

        const parameters = await call('get_parameters', { targetFile: 'src/bracket.ts' });
        expect(parameters.status).toBe(200);
        expect(await parameters.json()).toEqual({ success: true, parameters: {} });
        expect(hostCall).toHaveBeenCalledWith(
          expect.objectContaining({
            root,
            call: { toolName: 'get_parameters', args: { targetFile: 'src/bracket.ts' } },
          }),
        );
        const unlinked = await call('get_parameters', { targetFile: 'src/bracket.ts' }, false);
        expect(unlinked.status).toBe(422);
        expect(hostCall).toHaveBeenCalledTimes(1);
      } finally {
        await withHost.close();
      }
    });

    it('should show a model without a link when the loopback server cannot start, then retry', async () => {
      const listen = vi.spyOn(Server.prototype, 'listen').mockImplementationOnce(function (this: Server) {
        process.nextTick(() => this.emit('error', new Error('listen EPERM: operation not permitted')));
        return this;
      });
      try {
        const failed = shownModel(await viewer.show({ targetFile: 'models/part.glb' }, text));
        expect(failed.model.path).toBe('models/part.glb');
        expect(failed.viewerUrl).toBeUndefined();

        const retried = shownModel(await viewer.show({ targetFile: 'models/part.glb' }, text));
        expect(retried.viewerUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/\?model=/u);
        expect(listen).toHaveBeenCalledTimes(2);
      } finally {
        listen.mockRestore();
      }
    });

    it('should close after a loopback start that failed', async () => {
      const listen = vi.spyOn(Server.prototype, 'listen').mockImplementationOnce(function (this: Server) {
        process.nextTick(() => this.emit('error', new Error('listen EPERM: operation not permitted')));
        return this;
      });
      try {
        await viewer.show({ targetFile: 'models/part.glb' }, text);
        await expect(viewer.close()).resolves.toBeUndefined();
      } finally {
        listen.mockRestore();
      }
    });

    it('should refuse a request under another host name', async () => {
      const { viewerUrl } = shownModel(await viewer.show({ targetFile: 'models/part.glb' }, text));
      const { origin } = loopbackOf(viewerUrl);
      const { port } = new URL(origin);
      const { request } = await import('node:http');

      const status = await new Promise<number | undefined>((resolve, reject) => {
        request({ host: '127.0.0.1', port, path: '/', headers: { host: `attacker.example:${port}` } }, (response) => {
          response.resume();
          resolve(response.statusCode);
        })
          .on('error', reject)
          .end();
      });
      expect(status).toBe(421);
    });
  });
});
