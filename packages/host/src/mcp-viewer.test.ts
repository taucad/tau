/**
 * The host half of the `tau mcp` viewer: which file a call shows, how a source
 * becomes a GLB, what the page may read, and what the loopback server admits.
 */

import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Server } from 'node:http';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TauMcpViewerCallOptions } from '@taucad/mcp';
import type { TauViewerShowResult } from '@taucad/mcp/viewer-protocol';
import { tauCadTopologyExtension } from '@taucad/runtime/types';

import { createLocalMcpViewer } from '#mcp-viewer.js';
import type { LocalMcpViewer, LocalMcpViewerOptions } from '#mcp-viewer.js';

const page = { html: '<!doctype html><title>Tau viewer</title>', sha256: 'c'.repeat(64) };
const glb = Buffer.from('glTF-binary-bytes');
const sha = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');

const inline: TauMcpViewerCallOptions = { toolCallId: 'call-1', presentation: 'inline' };
const text: TauMcpViewerCallOptions = { toolCallId: 'call-2', presentation: 'text' };

let root: string;
let viewer: LocalMcpViewer;
let renderGlb: ReturnType<typeof vi.fn<LocalMcpViewerOptions['renderGlb']>>;

const shownModel = (result: unknown): TauViewerShowResult => {
  if (typeof result !== 'object' || result === null || !('model' in result)) {
    throw new Error(`Expected a shown model, got ${JSON.stringify(result)}`);
  }
  return result as TauViewerShowResult;
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
  renderGlb = vi.fn<LocalMcpViewerOptions['renderGlb']>(async ({ targetFile }) => {
    await mkdir(join(root, '.tau', 'artifacts'), { recursive: true });
    await writeFile(join(root, '.tau', 'artifacts', 'bracket.glb'), glb);
    return targetFile === 'src/bracket.ts'
      ? '.tau/artifacts/bracket.glb'
      : { errorCode: 'KERNEL_ERROR', message: 'Bad model.' };
  });
  viewer = createLocalMcpViewer({ page, rootOf: () => root, renderGlb });
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
    });
    expect(viewerUrl).toBeUndefined();
    expect(renderGlb).not.toHaveBeenCalled();
  });

  it('should show a GLB exported from a source with that source, so its panes have parameters', async () => {
    await mkdir(join(root, '.tau', 'artifacts'), { recursive: true });
    await writeFile(join(root, '.tau', 'artifacts', 'tc-7__bracket.glb'), glb);
    await writeFile(join(root, 'src', 'bracket.glb'), glb);

    const exported = shownModel(await viewer.show({ targetFile: '.tau/artifacts/tc-7__bracket.glb' }, inline));
    const beside = shownModel(await viewer.show({ targetFile: 'src/bracket.glb' }, inline));
    const unmatched = shownModel(await viewer.show({ targetFile: 'models/part.glb' }, inline));

    expect(exported.model).toMatchObject({ path: '.tau/artifacts/tc-7__bracket.glb', sourceFile: 'src/bracket.ts' });
    expect(beside.model).toMatchObject({ path: 'src/bracket.glb', sourceFile: 'src/bracket.ts' });
    expect(unmatched.model.sourceFile).toBeUndefined();
    expect(renderGlb).not.toHaveBeenCalled();
  });

  it('should show a GLB this server rendered with the source it rendered', async () => {
    await viewer.show({ targetFile: 'src/bracket.ts' }, inline);
    await writeFile(join(root, 'models', 'bracket.ts'), 'export default () => null;');

    const { model } = shownModel(await viewer.show({ targetFile: '.tau/artifacts/bracket.glb' }, inline));

    expect(model.sourceFile).toBe('src/bracket.ts');
  });

  it('should render a CAD source to GLB through export_model', async () => {
    const { model } = shownModel(await viewer.show({ targetFile: 'src/bracket.ts' }, inline));

    expect(renderGlb).toHaveBeenCalledWith(expect.objectContaining({ root, targetFile: 'src/bracket.ts' }));
    expect(model).toMatchObject({ title: 'bracket', path: '.tau/artifacts/bracket.glb', sourceFile: 'src/bracket.ts' });
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
    renderGlb.mockImplementationOnce(async () => {
      await mkdir(join(root, '.tau', 'artifacts'), { recursive: true });
      await writeFile(join(root, '.tau', 'artifacts', 'bracket.glb'), topology);
      return '.tau/artifacts/bracket.glb';
    });

    const rendered = shownModel(await viewer.show({ targetFile: 'src/bracket.ts' }, inline));
    const bare = shownModel(await viewer.show({ targetFile: 'models/part.glb' }, inline));

    expect(rendered.mechanism).toEqual({ preserved: true, joints: 1, animations: ['four-sun-turns'] });
    expect(bare.mechanism).toEqual({ preserved: false, joints: 0, animations: [] });
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

  it('should refuse a path outside the project and a format the page cannot draw', async () => {
    expect(await viewer.show({ targetFile: '../secret.glb' }, inline)).toMatchObject({
      errorCode: 'PATH_OUTSIDE_PROJECT',
    });
    expect(await viewer.open({ path: '/etc/passwd' }, inline)).toMatchObject({ errorCode: 'PATH_OUTSIDE_PROJECT' });
    await writeFile(join(root, 'models', 'part.step'), 'ISO-10303-21;');
    renderGlb.mockResolvedValueOnce('models/part.step');
    expect(await viewer.open({ path: join(root, 'models', 'part.step') }, inline)).toMatchObject({
      errorCode: 'UNSUPPORTED_FORMAT',
    });
  });

  it('should pass a render failure through', async () => {
    await writeFile(join(root, 'src', 'broken.ts'), '');

    expect(await viewer.show({ targetFile: 'src/broken.ts' }, inline)).toEqual({
      errorCode: 'KERNEL_ERROR',
      message: 'Bad model.',
    });
  });

  it('should list renderable files with the main entry first, skipping tests and dependencies', async () => {
    expect(await viewer.browse(inline)).toEqual({
      files: [
        { path: 'src/bracket.ts', title: 'bracket' },
        { path: 'models/part.glb', title: 'part' },
      ],
    });
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
        accepts: ['references'],
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
        rootOf: (meta) => (meta?.['project'] === 'a' ? root : elsewhere),
        renderGlb,
      });
      try {
        const projectA: TauMcpViewerCallOptions = { ...text, meta: { project: 'a' } };
        const first = shownModel(await perCall.show({ targetFile: 'src/bracket.ts' }, projectA));
        await perCall.show({ targetFile: 'models/part.glb' }, projectA);
        expect(renderGlb).toHaveBeenCalledTimes(1);
        const { origin, token, modelId } = loopbackOf(first.viewerUrl);
        const call = async (args: Record<string, unknown>) =>
          fetch(`${origin}/api/tools/call`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-tau-viewer-token': token },
            body: JSON.stringify({ name: 'show_model', arguments: args }),
          });

        const linked = await call({ modelId });
        expect(linked.status).toBe(200);
        expect(await linked.json()).toEqual({ model: first.model });
        expect(renderGlb).toHaveBeenCalledTimes(1);
        const unknown = await call({ modelId: 'unknown' });
        expect(unknown.status).toBe(422);
        expect(await unknown.json()).toMatchObject({ errorCode: 'UNKNOWN_MODEL' });
      } finally {
        await perCall.close();
        await rm(elsewhere, { recursive: true, force: true });
      }
    });

    it("should run the panes' host tools and re-render a source in the linked model's project", async () => {
      const hostCall = vi.fn<NonNullable<LocalMcpViewerOptions['hostCall']>>(async () => ({
        success: true,
        parameters: {},
      }));
      const withHost = createLocalMcpViewer({ page, rootOf: () => root, renderGlb, hostCall });
      try {
        const { viewerUrl, model } = shownModel(await withHost.show({ targetFile: 'src/bracket.ts' }, text));
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

        const rendered = await call('show_model', { targetFile: 'src/bracket.ts' });
        expect(rendered.status).toBe(200);
        expect(shownModel(await rendered.json()).model).toMatchObject({ sourceFile: model.sourceFile });
        expect(renderGlb).toHaveBeenCalledTimes(2);
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
