#!/usr/bin/env node
/** Purpose: Verify publication interruption, immutable retry and completed renewal admission without a cloud account. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  desktopArtifactKinds,
  desktopArtifactName,
  desktopReleaseIdentity,
  parseDesktopArtifactManifest,
} from '#shared/desktop-release.js';
/* oxlint-disable no-restricted-imports -- Exercise the publisher transport seam. */
import {
  admitDesktopRoutePromotion,
  assertCompletedDesktopPromotion,
  completeDesktopPromotion,
  mirrorDesktopRouteFile,
  verifyDesktopRouteFiles,
} from './publish-desktop-routes.mjs';
import type { DesktopRouteStore } from './publish-desktop-routes.mjs';
/* oxlint-enable no-restricted-imports */

const run = async (): Promise<void> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-publication-'));
  const objects = new Map<string, { bytes: Uint8Array<ArrayBuffer>; etag: string }>();
  let serial = 0;
  const store: DesktopRouteStore = {
    async read(key) {
      return objects.get(key);
    },
    async put(key, path, condition) {
      const existing = objects.get(key);
      if (condition.immutable && existing) {
        throw new Error('Precondition failed');
      }
      if (condition.etag && existing?.etag !== condition.etag) {
        throw new Error('Stale ETag');
      }
      objects.set(key, { bytes: Uint8Array.from(await readFile(path)), etag: String(++serial) });
    },
    async verify(key, path) {
      assert.equal(Buffer.compare(Buffer.from(objects.get(key)?.bytes ?? []), await readFile(path)), 0);
    },
  };
  const tag = 'desktop-staging@0.1.0-staging.102';
  const identity = desktopReleaseIdentity(tag);
  const bytes = Buffer.from('inert installer fixture');
  const kind = 'windows-nsis';
  const { platform: _platform, ...definition } = desktopArtifactKinds[kind];
  const name = desktopArtifactName({ ...identity, kind, arch: 'x64' });
  const manifest = parseDesktopArtifactManifest({
    schemaVersion: 1,
    tag,
    ...identity,
    sourceCommit: 'a'.repeat(40),
    artifacts: [
      {
        kind,
        target: 'win32-x64',
        name,
        ...definition,
        size: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        sha512: createHash('sha512').update(bytes).digest('base64'),
      },
    ],
  });
  const path = join(root, name);
  await writeFile(path, bytes);
  await verifyDesktopRouteFiles(root, manifest);
  await mirrorDesktopRouteFile(store, `releases/${tag}/${name}`, path);
  await mirrorDesktopRouteFile(store, `releases/${tag}/${name}`, path);
  await writeFile(path, 'changed');
  await assert.rejects(mirrorDesktopRouteFile(store, `releases/${tag}/${name}`, path));
  await assert.rejects(verifyDesktopRouteFiles(root, manifest));
  await writeFile(path, bytes);
  await admitDesktopRoutePromotion({ store, root, manifest, isAncestor: () => true });
  await assert.rejects(assertCompletedDesktopPromotion(store, manifest), /No completed/u);
  const catalogPath = join(root, 'catalog.json');
  await writeFile(catalogPath, JSON.stringify({ tag }));
  const descriptorPath = join(root, 'descriptor.json');
  await writeFile(descriptorPath, JSON.stringify({ tag, sequence: 1 }));
  const pointers = [
    { key: 'latest/installers.json', path: catalogPath },
    { key: 'latest/desktop-update-windows-nsis-x64.json', path: descriptorPath },
  ];
  await store.put(pointers[1]!.key, descriptorPath, {});
  await assert.rejects(completeDesktopPromotion(store, { root, manifest, pointers }));
  await store.put('latest/installers.json', catalogPath, {});
  await completeDesktopPromotion(store, { root, manifest, pointers });
  await assertCompletedDesktopPromotion(store, manifest);
  await writeFile(descriptorPath, JSON.stringify({ tag, sequence: 2 }));
  await store.put(pointers[1]!.key, descriptorPath, {});
  await assert.rejects(assertCompletedDesktopPromotion(store, manifest), /pointer differs/u);
  await assertCompletedDesktopPromotion(store, manifest, async (key, value) => {
    assert.equal(key, pointers[1]!.key);
    assert.equal(JSON.parse(new TextDecoder().decode(value)).tag, tag);
  });
  await completeDesktopPromotion(store, { root, manifest, pointers });
  await assertCompletedDesktopPromotion(store, manifest);
  await writeFile(catalogPath, JSON.stringify({ tag: 'different' }));
  await store.put('latest/installers.json', catalogPath, {});
  await assert.rejects(assertCompletedDesktopPromotion(store, manifest), /pointer differs/u);
  await assert.rejects(admitDesktopRoutePromotion({ store, root, manifest, isAncestor: () => false }), /Stale/u);
  console.log('Publication immutable retry, interruption and completion readback checks passed');
};
await run();
