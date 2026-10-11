import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { parseAssemblyManifest, parseVariantManifest } from '#manifest.js';

const asset = async (name: string) => readFile(new URL(`../assets/${name}`, import.meta.url));
const json = async (name: string): Promise<unknown> =>
  JSON.parse(await readFile(new URL(`../assets/${name}`, import.meta.url), 'utf8'));

describe('parseAssemblyManifest', () => {
  it('should preserve source provenance, 34 bounded meshes and three planets', async () => {
    const compressed = await asset('planetary.bin.gz');
    const binary = gunzipSync(compressed);
    const manifest = parseAssemblyManifest(await json('planetary.json'), binary.byteLength);
    const source = await readFile(
      new URL('../../../../libs/tau-examples/src/kernels/replicad/planetary-gear-system/main.ts', import.meta.url),
    );
    expect(manifest.sha256).toBe(createHash('sha256').update(source).digest('hex'));
    expect(manifest.meshes).toHaveLength(34);
    expect(manifest.meshes.filter((part) => part.name.startsWith('Planet Gear'))).toHaveLength(3);
    expect(manifest.meshes.filter((part) => part.name.startsWith('Sun Gear'))).toHaveLength(1);
    expect(manifest.meshes.filter((part) => part.name.startsWith('Front Socket Screw'))).toHaveLength(3);
    expect(manifest.teeth).toEqual({ sun: 24, planet: 24, ring: 72 });
    expect(compressed.length, 'Keep the source mesh transfer bounded').toBeLessThan(1_000_000);
    let cursor = 0;
    for (const part of manifest.meshes) {
      for (const range of [part.position, part.normal, part.index]) {
        expect(range.offset).toBe(cursor);
        cursor += range.length * 4;
      }
      const indices = new Uint32Array(binary.buffer, binary.byteOffset + part.index.offset, part.index.length);
      expect(Math.max(...indices), 'Triangles refer to existing vertices').toBeLessThan(part.position.length / 3);
    }
    expect(cursor).toBe(binary.length);
  });

  it('should reject malformed geometry before allocating typed arrays or GPU resources', async () => {
    const bytes = gunzipSync(await asset('planetary.bin.gz'));
    const valid = parseAssemblyManifest(await json('planetary.json'), bytes.byteLength);
    const first = valid.meshes[0]!;
    const rest = valid.meshes.slice(1);
    const invalid = [
      null,
      { ...valid, parts: 33 },
      { ...valid, sha256: 'not-a-digest' },
      { ...valid, teeth: { ...valid.teeth, ring: 73 } },
      { ...valid, meshes: valid.meshes.map(() => first) },
      { ...valid, meshes: [{ ...first, color: 'teal' }, ...rest] },
      { ...valid, meshes: [{ ...first, metalness: Number.NaN }, ...rest] },
      { ...valid, meshes: [{ ...first, position: { ...first.position, offset: -4 } }, ...rest] },
      { ...valid, meshes: [{ ...first, normal: { ...first.normal, length: 3 } }, ...rest] },
      { ...valid, meshes: [{ ...first, index: { ...first.index, length: bytes.byteLength } }, ...rest] },
    ];
    for (const manifest of invalid) {
      expect(() => parseAssemblyManifest(manifest, bytes.byteLength)).toThrow(/assembly|geometry|mesh|part/iu);
    }
    expect(() => parseAssemblyManifest(valid, 0)).toThrow(/assembly/iu);
  });
});

describe('parseVariantManifest', () => {
  it('should validate the authored faceWidth variant against the base mesh it offsets', async () => {
    const base = parseAssemblyManifest(
      await json('planetary.json'),
      gunzipSync(await asset('planetary.bin.gz')).byteLength,
    );
    const offsets = gunzipSync(await asset('planetary-face18.bin.gz'));
    const raw = (await json('planetary-face18.json')) as { meshes: unknown[] };
    const variant = parseVariantManifest(raw, base, offsets.byteLength);
    expect(variant.axial).toEqual({ from: 68, to: 72 });
    const ring = new Float32Array(
      offsets.buffer,
      offsets.byteOffset + variant.meshes[0]!.dz.offset,
      variant.meshes[0]!.dz.length,
    );
    expect(Math.max(...ring), 'Ring top moves by the 4 mm face change').toBe(4);
    expect(Math.min(...ring), 'Ring base stays on the mounting face').toBe(0);
    expect(() => parseVariantManifest({ ...raw, sha256: '0'.repeat(64) }, base, offsets.byteLength)).toThrow(
      /variant/iu,
    );
    expect(() => parseVariantManifest({ ...raw, meshes: raw.meshes.slice(1) }, base, offsets.byteLength)).toThrow(
      /variant/iu,
    );
    expect(() =>
      parseVariantManifest(
        { ...raw, meshes: [{ name: 'Elsewhere', dz: { offset: 0, length: 1 } }, ...raw.meshes.slice(1)] },
        base,
        offsets.byteLength,
      ),
    ).toThrow(/variant/iu);
    expect(() => parseVariantManifest(raw, base, 4)).toThrow(/variant/iu);
  });
});
