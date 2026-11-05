import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink, rename, link } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSceneController, digest, sceneLimits, validateClosedGlb } from '#experiments/filesystem-scene/scene.js';
import type { SceneAdapter, SceneRevision, SceneSource } from '#experiments/filesystem-scene/scene.js';
import { createNodeSceneSource, watchScene } from '#experiments/filesystem-scene/node-source.js';
import { sceneViewSchema } from '#experiments/filesystem-scene/scene.schema.js';

const encode = (value: unknown): Uint8Array<ArrayBuffer> => new TextEncoder().encode(JSON.stringify(value));
const glb = (extra: Record<string, unknown> = {}): Uint8Array<ArrayBuffer> => {
  const text = JSON.stringify({ asset: { version: '2.0' }, scenes: [{ nodes: [] }], scene: 0, ...extra });
  const padded = text.padEnd(Math.ceil(text.length / 4) * 4, ' ');
  const bytes = new Uint8Array(20 + padded.length);
  const data = new DataView(bytes.buffer);
  data.setUint32(0, 0x46_54_6c_67, true);
  data.setUint32(4, 2, true);
  data.setUint32(8, bytes.length, true);
  data.setUint32(12, padded.length, true);
  data.setUint32(16, 0x4e_4f_53_4a, true);
  bytes.set(new TextEncoder().encode(padded), 20);
  return bytes;
};
const view = { version: 1, entryPath: 'assets/cube.glb', assetDirectory: 'assets' };
const viewPath = '.tau/workbench/views/front.json';
const fixture = () => {
  const files = new Map([
    [viewPath, encode(view)],
    ['assets/cube.glb', glb()],
  ]);
  const source: SceneSource = {
    async read(path) {
      const data = files.get(path);
      if (!data) {
        throw new Error('Missing file');
      }
      return new Uint8Array(data);
    },
    async list(directory) {
      return [...files.keys()].filter((path) => path.startsWith(`${directory}/`));
    },
  };
  let visible: SceneRevision | undefined;
  let preparations = 0;
  let presentations = 0;
  let disposed = 0;
  const adapter: SceneAdapter = {
    async prepare(candidate) {
      preparations++;
      for (const asset of candidate.revision.assets) {
        expect(digest(candidate.readAsset(asset.digest))).toBe(asset.digest);
      }
      return {
        commit() {
          visible = candidate.revision;
        },
        dispose() {
          disposed++;
        },
      };
    },
    present(revision) {
      presentations++;
      visible = revision;
    },
  };
  return {
    files,
    source,
    adapter,
    get visible() {
      return visible;
    },
    get preparations() {
      return preparations;
    },
    get presentations() {
      return presentations;
    },
    get disposed() {
      return disposed;
    },
  };
};

describe('filesystem scene revision', () => {
  it('reuses canonical cameras/grid/axes and existing studio-light fields, rejects commands and unsafe paths', () => {
    const parsed = sceneViewSchema.parse({
      ...view,
      camera: { kind: 'preset', preset: 'front' },
      display: { grid: false, axes: false },
      lighting: { headlampIntensity: 2 },
    });
    expect(parsed).toMatchObject({
      camera: { preset: 'front' },
      display: { grid: false, axes: false },
      lighting: { headlampIntensity: 2, ambientIntensity: 0.1 },
    });
    for (const assetDirectory of ['../secret', '/secret', 'https://example.org/a', String.raw`a\b`, 'a/../b']) {
      expect(sceneViewSchema.safeParse({ ...view, assetDirectory }).success).toBe(false);
    }
    for (const patch of [
      { print: true },
      { lighting: { headlampIntensity: -1 } },
      { lighting: { exposure: Infinity } },
    ]) {
      expect(sceneViewSchema.safeParse({ ...view, ...patch }).success).toBe(false);
    }
  });
  it('applies presentation-only revisions without rebuilding geometry and coalesces duplicates', async () => {
    const f = fixture();
    const controller = createSceneController({ ...f, viewPath, settleMilliseconds: 0 });
    try {
      expect(await controller.reconcile()).toMatchObject({ status: 'applied' });
      const geometry = controller.current?.geometryId;
      f.files.set(
        viewPath,
        encode({
          ...view,
          camera: { kind: 'preset', preset: 'top' },
          lighting: { ambientIntensity: 0.7 },
          display: { grid: false, axes: false },
        }),
      );
      expect(await controller.reconcile()).toMatchObject({ status: 'applied' });
      expect(controller.current?.geometryId).toBe(geometry);
      expect(f.preparations).toBe(1);
      expect(f.presentations).toBe(1);
      expect(await controller.reconcile()).toMatchObject({ status: 'unchanged' });
      expect(f.presentations).toBe(1);
      f.files.set('assets/second.glb', glb({ extras: { name: 'second' } }));
      await controller.reconcile();
      expect(f.preparations).toBe(2);
      expect(f.disposed).toBe(1);
    } finally {
      controller.dispose();
    }
  });
  it('preserves last good geometry for interrupted JSON, missing resources, malformed GLB and renderer failure', async () => {
    const f = fixture();
    const controller = createSceneController({ ...f, viewPath, settleMilliseconds: 0 });
    try {
      await controller.reconcile();
      const good = controller.current;
      for (const bad of [
        new TextEncoder().encode('{'),
        encode({ ...view, entryPath: 'assets/missing.glb' }),
        new Uint8Array(sceneLimits.recordBytes + 1),
      ]) {
        f.files.set(viewPath, bad);
        // oxlint-disable-next-line no-await-in-loop -- Verify last-good state after each sequential bad write.
        expect(await controller.reconcile()).toMatchObject({ status: 'invalid-preserved', revision: good });
        expect(f.visible).toBe(good);
      }
      f.files.set(viewPath, encode(view));
      f.files.set('assets/cube.glb', glb().slice(0, 21));
      expect(await controller.reconcile()).toMatchObject({ status: 'invalid-preserved' });
      f.files.set('assets/cube.glb', glb({ extras: { changed: true } }));
      f.adapter.prepare = async () => {
        throw new Error('Decoder refuses geometry');
      };
      expect(await controller.reconcile()).toMatchObject({ status: 'invalid-preserved', revision: good });
      expect(f.visible).toBe(good);
    } finally {
      controller.dispose();
    }
  });
  it('rejects external/data resources, extension resources and out-of-bounds embedded buffers', () => {
    for (const content of [
      { images: [{ uri: 'https://example.org/a.png' }] },
      { buffers: [{ uri: 'data:abc' }] },
      { extensions: { custom: { uri: '../other' } } },
      { buffers: [{ byteLength: 10 }] },
      { extensionsRequired: ['unknown'] },
      { bufferViews: [{ buffer: 0, byteLength: 10 }] },
    ]) {
      expect(() => {
        validateClosedGlb(glb(content));
      }).toThrow();
    }
    expect(() => {
      validateClosedGlb(glb());
    }).not.toThrow();
  });
  it('cancels stale preparations and releases them without ever committing stale geometry', async () => {
    const f = fixture();
    const entered = Promise.withResolvers<void>();
    const finish = Promise.withResolvers<void>();
    const commits: string[] = [];
    let staleDisposed = false;
    let count = 0;
    f.adapter.prepare = async (candidate) => {
      if (++count === 1) {
        entered.resolve();
        await finish.promise;
        return {
          commit() {
            commits.push('stale');
          },
          dispose() {
            staleDisposed = true;
          },
        };
      }
      return {
        commit() {
          commits.push(candidate.revision.id);
        },
        dispose() {
          /* No resources in this test adapter. */
        },
      };
    };
    const controller = createSceneController({ ...f, viewPath, settleMilliseconds: 0 });
    try {
      const stale = controller.reconcile();
      await entered.promise;
      f.files.set('assets/cube.glb', glb({ extras: { changed: true } }));
      await controller.reconcile();
      finish.resolve();
      expect(await stale).toMatchObject({ status: 'superseded' });
      expect(staleDisposed).toBe(true);
      expect(commits).toEqual([controller.current?.id]);
    } finally {
      finish.resolve();
      controller.dispose();
    }
  });
  it('isolates immutable byte ownership and enforces the aggregate byte budget', async () => {
    const f = fixture();
    f.adapter.prepare = async (candidate) => {
      const asset = candidate.revision.assets[0]!;
      const copy = candidate.readAsset(asset.digest);
      copy.fill(0);
      expect(digest(candidate.readAsset(asset.digest))).toBe(asset.digest);
      expect(() => candidate.readAsset('not-in-revision')).toThrow('Digest is not in this revision.');
      return {
        commit() {
          /* No visible sink needed for byte ownership. */
        },
        dispose() {
          /* No native allocation. */
        },
      };
    };
    const controller = createSceneController({ ...f, viewPath, settleMilliseconds: 0 });
    try {
      expect(await controller.reconcile()).toMatchObject({ status: 'applied' });
      const oversizedTotal = glb({ extras: { padding: ' '.repeat(1024 * 1024) } });
      f.files.set('assets/cube.glb', oversizedTotal);
      for (let i = 0; i < 63; i++) {
        f.files.set(`assets/part-${i}.glb`, oversizedTotal);
      }
      expect(await controller.reconcile()).toMatchObject({
        status: 'invalid-preserved',
        message: 'Asset byte budget exceeded.',
      });
    } finally {
      controller.dispose();
    }
  });
  it('fences disposal and explicit invalidation during pending decode', async () => {
    const f = fixture();
    const entered = Promise.withResolvers<void>();
    const finish = Promise.withResolvers<void>();
    let commits = 0;
    let releases = 0;
    f.adapter.prepare = async () => {
      entered.resolve();
      await finish.promise;
      return {
        commit() {
          commits++;
        },
        dispose() {
          releases++;
        },
      };
    };
    const controller = createSceneController({ ...f, viewPath, settleMilliseconds: 0 });
    const pending = controller.reconcile();
    try {
      await entered.promise;
      controller.invalidate();
      controller.dispose();
      finish.resolve();
      expect(await pending).toEqual({ status: 'superseded' });
      expect(commits).toBe(0);
      expect(releases).toBe(1);
      expect(await controller.reconcile()).toEqual({ status: 'superseded' });
    } finally {
      finish.resolve();
      controller.dispose();
    }
  });
  it('rejects a revision changing between reads and enforces total/count/individual bounds', async () => {
    const f = fixture();
    const { read } = f.source;
    let reads = 0;
    f.source.read = async (path, max) => {
      if (path === viewPath && ++reads === 2) {
        f.files.set(path, encode({ ...view, name: 'Changing' }));
      }
      return read(path, max);
    };
    const controller = createSceneController({ ...f, viewPath, settleMilliseconds: 0 });
    try {
      expect(await controller.reconcile()).toMatchObject({ status: 'invalid-preserved' });
      f.source.read = read;
      f.files.set('assets/cube.glb', new Uint8Array(sceneLimits.assetBytes + 1));
      expect(await controller.reconcile()).toMatchObject({ status: 'invalid-preserved' });
      f.files.set('assets/cube.glb', glb());
      for (let i = 0; i < sceneLimits.assets; i++) {
        f.files.set(`assets/${i}.glb`, glb());
      }
      expect(await controller.reconcile()).toMatchObject({ status: 'invalid-preserved' });
    } finally {
      controller.dispose();
    }
  });
});

describe('Linux scene source', () => {
  it('handles atomic editor replacements and restart reconciliation; refuses traversal, symlinks and hardlinks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-scene-'));
    try {
      await mkdir(join(root, '.tau/workbench/views'), { recursive: true });
      await mkdir(join(root, 'assets'));
      await writeFile(join(root, viewPath), encode(view));
      await writeFile(join(root, 'assets/cube.glb'), glb());
      const source = await createNodeSceneSource(root);
      const f = fixture();
      const controller = createSceneController({ source, adapter: f.adapter, viewPath, settleMilliseconds: 0 });
      try {
        await controller.reconcile();
        await writeFile(join(root, 'next.json'), encode({ ...view, name: 'Replaced' }));
        await rename(join(root, 'next.json'), join(root, viewPath));
        await controller.reconcile();
        expect(controller.current?.view.name).toBe('Replaced');
        await expect(source.read('../outside', 100)).rejects.toThrow();
        await symlink(join(root, viewPath), join(root, 'assets/link.glb'));
        expect(await controller.reconcile()).toMatchObject({ status: 'invalid-preserved' });
        await rm(join(root, 'assets/link.glb'));
        await link(join(root, 'assets/cube.glb'), join(root, 'assets/hard.glb'));
        expect(await controller.reconcile()).toMatchObject({ status: 'invalid-preserved' });
        await rm(join(root, 'assets/hard.glb'));
      } finally {
        controller.dispose();
      }
      const restarted = createSceneController({ source, adapter: f.adapter, viewPath, settleMilliseconds: 0 });
      try {
        await restarted.reconcile();
        expect(restarted.current?.view.name).toBe('Replaced');
      } finally {
        restarted.dispose();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('feeds an atomically replaced view through the live watcher without rebuilding geometry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-scene-live-'));
    await mkdir(join(root, '.tau/workbench/views'), { recursive: true });
    await mkdir(join(root, 'assets'));
    await writeFile(join(root, viewPath), encode(view));
    await writeFile(join(root, 'assets/cube.glb'), glb());
    const f = fixture();
    const controller = createSceneController({
      source: await createNodeSceneSource(root),
      adapter: f.adapter,
      viewPath,
      settleMilliseconds: 1,
    });
    const initial = Promise.withResolvers<void>();
    const changed = Promise.withResolvers<void>();
    const watcher = watchScene({
      root,
      debounceMilliseconds: 1,
      pollMilliseconds: 250,
      invalidate() {
        controller.invalidate();
      },
      async reconcile() {
        return controller.reconcile();
      },
      report(result) {
        if (result.status === 'applied') {
          if (result.revision.view.name === 'Watched') {
            changed.resolve();
          } else {
            initial.resolve();
          }
        }
      },
    });
    try {
      await initial.promise;
      await writeFile(
        join(root, 'next.json'),
        encode({ ...view, name: 'Watched', lighting: { headlampIntensity: 4 } }),
      );
      await rename(join(root, 'next.json'), join(root, viewPath));
      await changed.promise;
      expect(f.visible?.view).toMatchObject({ name: 'Watched', lighting: { headlampIntensity: 4 } });
      expect(f.preparations).toBe(1);
    } finally {
      watcher.dispose();
      controller.dispose();
      await rm(root, { recursive: true, force: true });
    }
  });
  it('polls after a lost watch event and closes its timers', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-scene-watch-'));
    const observed = Promise.withResolvers<void>();
    let calls = 0;
    const watcher = watchScene({
      root,
      invalidate() {
        /* This test intentionally emits no watch hints. */
      },
      pollMilliseconds: 250,
      debounceMilliseconds: 0,
      async reconcile() {
        if (++calls === 2) {
          observed.resolve();
        }
        return { status: 'superseded' };
      },
      report() {
        /* Poll count is the observable in this test. */
      },
    });
    try {
      await observed.promise;
      expect(calls).toBeGreaterThanOrEqual(2);
    } finally {
      watcher.dispose();
      await rm(root, { recursive: true, force: true });
    }
  });
});
