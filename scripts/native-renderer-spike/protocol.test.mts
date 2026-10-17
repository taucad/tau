import { describe, it, expect, vi } from 'vitest';
import { request } from 'node:http';
import { admit, digest, parseGlb, validateView, limits } from './protocol.mts';
import { makeFixture } from './fixture.mts';
import { startHost } from './host.mts';
import { createFixtureRuntime } from './runtime.mts';

const external = (uri) => {
  const source = makeFixture(1);
  const doc = parseGlb(source);
  doc.buffers[0].uri = uri;
  let json = Buffer.from(JSON.stringify(doc));
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 32)]);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + json.length, 8);
  header.writeUInt32LE(json.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const originalJsonLength = source.readUInt32LE(12);
  return { glb: Buffer.concat([header, json]), bin: source.subarray(28 + originalJsonLength) };
};

describe('native renderer trust boundary', () => {
  it('bounds concurrent slow control requests and releases slots after abort', async () => {
    const host = await startHost({ geometry: { format: 'gltf', content: makeFixture(1) } });
    const pending = [];
    try {
      for (let i = 0; i < 4; i++) {
        const req = request(host.url + '/view', {
          method: 'PATCH',
          headers: { authorization: `Bearer ${host.token}`, 'transfer-encoding': 'chunked' },
        });
        req.on('error', () => {});
        req.write('{');
        pending.push(req);
      }
      await vi.waitFor(() => expect(host.stats.activeRequests).toBe(4));
      expect((await fetch(host.url + '/scene', { headers: { authorization: `Bearer ${host.token}` } })).status).toBe(
        429,
      );
      pending[0].destroy();
      await vi.waitFor(() => expect(host.stats.activeRequests).toBe(3));
      expect((await fetch(host.url + '/scene', { headers: { authorization: `Bearer ${host.token}` } })).status).toBe(
        200,
      );
    } finally {
      for (const req of pending) req.destroy();
      await host.close();
    }
  });

  it('publishes a digest-verified explicit external-buffer closure without path authority', () => {
    const { glb, bin } = external('part.bin');
    const closure = admit({ format: 'gltf', content: glb }, new Map([['part.bin', bin]]));
    expect(closure.dependencies['part.bin']).toEqual({ digest: digest(bin), bytes: bin.length });
    expect(closure.assets.get(closure.root)).toEqual(glb);
    expect(closure.assets.size).toBe(2);
    expect(() => admit({ format: 'gltf', content: glb })).toThrow('Missing or forbidden dependency');
  });
  it.each([
    '../part.bin',
    '/tmp/part.bin',
    'https://example.com/x',
    'data:application/octet-stream;base64,AA==',
    '%2e%2e',
    'a\\b',
  ])('rejects unconfined URI %s', (uri) => {
    const { glb, bin } = external(uri);
    expect(() => admit({ format: 'gltf', content: glb }, new Map([[uri, bin]]))).toThrow(
      'Missing or forbidden dependency',
    );
  });
  it('rejects malformed GLB and invalid view values', () => {
    const glb = makeFixture(1);
    glb.writeUInt32LE(glb.length + 4, 8);
    expect(() => parseGlb(glb)).toThrow('Invalid GLB header');
    for (const view of [
      { angle: NaN, intensity: 1 },
      { angle: 0, intensity: 3 },
      { angle: 0, intensity: 1, path: '/tmp' },
    ])
      expect(() => validateView(view)).toThrow('Invalid view');
    expect(() => admit({ format: 'gltf', content: Buffer.alloc(limits.bytes + 1) })).toThrow('Asset budget');
  });
  it('uses real RuntimeClient dependency resolution and host-owned SQLite reuse; view edits never touch geometry', async () => {
    const runtime = await createFixtureRuntime();
    const host = await startHost({
      geometry: runtime.geometry,
      runtimeMetrics: runtime.metrics,
      onClose: runtime.close,
    });
    try {
      expect(runtime.metrics.computations).toBe(1);
      expect(runtime.metrics.cacheSources).toEqual(['computed', 'cache']);
      expect((await fetch(host.url + '/scene')).status).toBe(401);
      const headers = { authorization: `Bearer ${host.token}` };
      expect(
        (await fetch(host.url + '/scene', { headers: { ...headers, origin: 'https://untrusted.test' } })).status,
      ).toBe(403);
      const scene = await (await fetch(host.url + '/scene', { headers })).json();
      const asset = await fetch(host.url + '/assets/' + scene.asset.digest, { headers });
      expect(digest(Buffer.from(await asset.arrayBuffer()))).toBe(scene.asset.digest);
      const before = { ...host.stats };
      const response = await fetch(host.url + '/view', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ revision: scene.revision, view: { angle: 1, intensity: 0.6 } }),
      });
      const changed = await response.json();
      expect(changed.revision).toBe(scene.revision + 1);
      expect(changed.asset).toEqual(scene.asset);
      expect(changed.view).toEqual({ angle: 1, intensity: 0.6 });
      expect(runtime.computations()).toBe(1);
      expect(host.stats.assetBytes).toBe(before.assetBytes);
      expect(
        (
          await fetch(host.url + '/view', {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ revision: scene.revision, view: { angle: 1, intensity: 1 } }),
          })
        ).status,
      ).toBe(409);
      expect((await fetch(host.url + '/assets/' + '0'.repeat(64), { headers })).status).toBe(404);
      expect(
        (await fetch(host.url + '/view', { method: 'PATCH', headers, body: 'x'.repeat(limits.control + 1) })).status,
      ).toBe(413);
      const updatedGeometry = await runtime.renderVariant(16);
      const updatedScene = host.publishGeometry(updatedGeometry);
      expect(runtime.computations()).toBe(2);
      expect(updatedScene.asset.digest).not.toBe(scene.asset.digest);
      expect((await fetch(host.url + '/assets/' + scene.asset.digest, { headers })).status).toBe(404);
      expect(() => host.publishGeometry({ format: 'gltf', content: new Uint8Array([0]) })).toThrow();
      const stillCurrent = await (await fetch(host.url + '/scene', { headers })).json();
      expect(stillCurrent.asset.digest).toBe(updatedScene.asset.digest);
    } finally {
      await host.close();
    }
  });
});
