import { createHash } from 'node:crypto';
import { writeGlb } from '@taucad/geometry-core';
import type { GlbInput } from '@taucad/geometry-core';
import { describe, expect, it } from 'vitest';
import { exactPinOf, normalizeGlbGenerator, pinnedGlbGenerator } from '#exact-pin.js';

const triangle = (doubleSided: boolean): GlbInput => ({
  nodes: [
    {
      name: 'Triangle',
      primitives: [
        {
          mode: 4,
          positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
          normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
          material: {
            pbrMetallicRoughness: { baseColorFactor: [0.5, 0.5, 0.5, 1] },
            doubleSided,
          },
        },
      ],
    },
  ],
});

const jsonText = (glb: Uint8Array<ArrayBuffer>): string => {
  const length = new DataView(glb.buffer, glb.byteOffset).getUint32(12, true);
  return new TextDecoder().decode(glb.subarray(20, 20 + length)).trimEnd();
};

/**
 * What a release of the package group does to a GLB: the writer stamps another version into
 * `asset.generator` and nothing else changes. Done here with a plain text edit and re-pad, not
 * through the helper under test.
 */
const restamp = (glb: Uint8Array<ArrayBuffer>, version: string): Uint8Array<ArrayBuffer> => {
  const view = new DataView(glb.buffer, glb.byteOffset);
  const jsonLength = view.getUint32(12, true);
  const text = jsonText(glb).replace(
    /"generator":"@taucad\/geometry-core@[^"]+"/u,
    `"generator":"@taucad/geometry-core@${version}"`,
  );
  const json = new TextEncoder().encode(text);
  const padded = Math.ceil(json.byteLength / 4) * 4;
  const rest = glb.subarray(20 + jsonLength);
  const out = new Uint8Array(20 + padded + rest.byteLength).fill(0x20, 20, 20 + padded);
  out.set(glb.subarray(0, 20));
  out.set(json, 20);
  out.set(rest, 20 + padded);
  const outView = new DataView(out.buffer);
  outView.setUint32(8, out.byteLength, true);
  outView.setUint32(12, padded, true);
  return out;
};

const sha256 = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');

describe('exactPinOf', () => {
  it('should keep the GLB pin when only the generator version changes', async () => {
    const glb = writeGlb(triangle(false));
    // A longer version shifts the JSON chunk's padding and every length after it.
    const released = restamp(glb, '12.345.6789-beta.10');

    expect(jsonText(glb)).toMatch(/"generator":"@taucad\/geometry-core@\d/u);
    expect(sha256(released)).not.toBe(sha256(glb));
    expect(released.byteLength).not.toBe(glb.byteLength);
    expect(await exactPinOf('glb', released)).toEqual(await exactPinOf('glb', glb));
  });

  it('should move the GLB pin when a material flips doubleSided', async () => {
    const oneSided = await exactPinOf('glb', writeGlb(triangle(false)));
    const twoSided = await exactPinOf('glb', writeGlb(triangle(true)));

    expect(twoSided.sha256).not.toBe(oneSided.sha256);
  });

  it('should move the GLB pin when one buffer byte changes', async () => {
    const glb = writeGlb(triangle(false));
    const edited = new Uint8Array(glb);
    edited[edited.byteLength - 1] = (edited.at(-1)! + 1) % 256;

    expect(await exactPinOf('glb', edited)).not.toEqual(await exactPinOf('glb', glb));
  });

  it('should change nothing but the generator', () => {
    const glb = writeGlb(triangle(false));
    const normalized = normalizeGlbGenerator(glb);
    const expected = JSON.parse(jsonText(glb)) as {
      asset: { generator: string };
    };
    expected.asset.generator = pinnedGlbGenerator;

    expect(jsonText(normalized)).toBe(JSON.stringify(expected));
    const jsonEnd = (bytes: Uint8Array<ArrayBuffer>) =>
      20 + new DataView(bytes.buffer, bytes.byteOffset).getUint32(12, true);
    expect(normalized.subarray(jsonEnd(normalized))).toEqual(glb.subarray(jsonEnd(glb)));
  });

  it('should hash STL bytes as they are', async () => {
    const stl = new Uint8Array([1, 2, 3, 4]);

    expect(await exactPinOf('stl', stl)).toEqual({
      sha256: sha256(stl),
      bytes: 4,
    });
  });

  it('should refuse a GLB another writer or a non-canonical serializer produced', () => {
    const foreign = new TextEncoder().encode(
      jsonText(writeGlb(triangle(false))).replace('@taucad/geometry-core@', 'other-writer@'),
    );
    const wrap = (json: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
      const padded = Math.ceil(json.byteLength / 4) * 4;
      const out = new Uint8Array(20 + padded).fill(0x20, 20);
      const view = new DataView(out.buffer);
      view.setUint32(0, 0x46_54_6c_67, true);
      view.setUint32(4, 2, true);
      view.setUint32(8, out.byteLength, true);
      view.setUint32(12, padded, true);
      view.setUint32(16, 0x4e_4f_53_4a, true);
      out.set(json, 20);
      return out;
    };
    const spaced = new TextEncoder().encode(
      JSON.stringify(JSON.parse(jsonText(writeGlb(triangle(false)))) as unknown, undefined, 1),
    );

    expect(() => normalizeGlbGenerator(wrap(foreign))).toThrow(/not a versioned @taucad\/geometry-core stamp/u);
    expect(() => normalizeGlbGenerator(wrap(spaced))).toThrow(/not in JSON.stringify form/u);
    expect(() => normalizeGlbGenerator(new Uint8Array(24))).toThrow(/Not a GLB 2.0 file/u);
  });
});
