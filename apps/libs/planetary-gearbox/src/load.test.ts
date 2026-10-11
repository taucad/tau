import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPartGeometries } from '#geometry.js';
import { partPose } from '#kinematics.js';
import { decodeGeometry, loadAssembly } from '#load.js';

const urls = {
  manifest: 'planetary.json',
  geometry: 'planetary.bin.gz',
  variant: 'planetary-face18.json',
  offsets: 'planetary-face18.bin.gz',
};
const serveAssets = () => {
  vi.stubGlobal(
    'fetch',
    async (url: string) => new Response(new Uint8Array(await readFile(new URL(`../assets/${url}`, import.meta.url)))),
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('decodeGeometry', () => {
  it('should decompress a gzip body and pass through one the host already decoded', async () => {
    const compressed = await readFile(new URL('../assets/planetary-face18.bin.gz', import.meta.url));
    const plain = gunzipSync(compressed);
    expect(new Uint8Array(await decodeGeometry(new Response(new Uint8Array(compressed))))).toEqual(
      new Uint8Array(plain),
    );
    expect(new Uint8Array(await decodeGeometry(new Response(new Uint8Array(plain))))).toEqual(new Uint8Array(plain));
  });
});

describe('loadAssembly', () => {
  it('should load and validate the frozen assembly and its variant', async () => {
    serveAssets();
    const assembly = await loadAssembly(urls, new AbortController().signal);
    expect(assembly.manifest.meshes).toHaveLength(34);
    expect(assembly.variant.axial).toEqual({ from: 68, to: 72 });
  });

  it('should name the status when an asset is unavailable', async () => {
    vi.stubGlobal('fetch', async () => new Response('missing', { status: 404 }));
    await expect(loadAssembly(urls, new AbortController().signal)).rejects.toThrow(
      'The gearbox model could not load (404).',
    );
  });
});

describe('createPartGeometries', () => {
  it('should centre each part on its own axis and carry the faceWidth offsets as a morph target', async () => {
    serveAssets();
    const parts = createPartGeometries(await loadAssembly(urls, new AbortController().signal));
    expect(parts.map((part) => part.name)).toContain('Planet Gear 2');
    for (const part of parts) {
      part.geometry.computeBoundingBox();
      const centre = part.geometry.boundingBox!.getCenter(part.geometry.boundingBox!.min.clone());
      if (/^(?:Planet Gear|Flanged Bushing)/u.test(part.name)) {
        expect(Math.hypot(centre.x, centre.y), `${part.name} turns about its own axis`).toBeLessThan(1);
      }
      expect(part.hasVariant).toBe(true);
      expect(part.geometry.morphTargetsRelative).toBe(true);
    }
    const ring = parts.find((part) => part.name === 'Internal Ring Gear')!;
    const dz = ring.geometry.morphAttributes.position![0]!;
    expect(Math.max(...Array.from({ length: dz.count }, (_, vertex) => dz.getZ(vertex)))).toBe(4);
    expect(partPose('Internal Ring Gear', 1).rotation).toBe(0);
    for (const part of parts) {
      part.geometry.dispose();
    }
  });
});
