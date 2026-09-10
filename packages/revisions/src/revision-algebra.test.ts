import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  algebraProvenanceDigest,
  algebraRawWasmSha256,
  algebraSourceRevision,
  loadRevisionAlgebra,
} from '#revision-algebra.js';
import { digestHex } from '#object-hash.js';
import { resolveAlgebraArtifact } from '#test-artifacts.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const artifactPath = resolveAlgebraArtifact();
const withArtifact = artifactPath === undefined ? describe.skip : describe;

describe('recorded algebra identities', () => {
  it('binds the re-cut digests, never the superseded attempt-1 ones', () => {
    expect(algebraRawWasmSha256).toBe('1eb690535c04376daee442eaa4b1ebc34b69a84859a4663d899e0591eac4a83d');
    expect(algebraProvenanceDigest).toBe('f44484a0954de6360394264b55c4042d1b445d2deab828e356861692f0e83abc');
    expect(algebraSourceRevision).toBe('c09b0c337f0dbff496ad3d696684aa1128482c38');
  });
});

withArtifact('compiled revision algebra', () => {
  const path = artifactPath ?? '';
  const load = async () => loadRevisionAlgebra({ artifact: new Uint8Array(await readFile(path)) });

  it('verifies the artifact digest before compiling it', async () => {
    const artifact = new Uint8Array(await readFile(path));
    expect(digestHex('sha256', artifact)).toBe(algebraRawWasmSha256);
    const tampered = Uint8Array.from([...artifact.slice(0, -1), (artifact.at(-1) ?? 0) + 1]);
    await expect(loadRevisionAlgebra({ artifact: tampered })).rejects.toThrow(/does not match the recorded/u);
  });

  it('reports the pinned source and provenance it was compiled from', async () => {
    const algebra = await load();
    const descriptor = algebra.describe();
    expect(descriptor).toMatchObject({
      contractMajor: 1,
      contractMinor: 0,
      implementation: 'jj',
      sourceRevision: algebraSourceRevision,
      provenanceDigest: algebraProvenanceDigest,
      features: 31,
      maxMergeTerms: 31,
      /* RC5 contract defect 1: this counts derived ancestor directories too, so
         it is not a leaf bound. Surfacing it is what lets a caller subtract. */
      maxBatchPaths: 100_000,
      initialMemoryPages: 64,
      maximumMemoryPages: 8192,
    });
  });

  it('resolves a clean three-way merge', async () => {
    const algebra = await load();
    const merged = algebra.merge3({
      terms: ['left\ncommon\n', 'common\n', 'common\nright\n'].map((term) => encoder.encode(term)),
    });
    expect(merged.kind).toBe('resolved');
    expect(merged.kind === 'resolved' ? decoder.decode(merged.content) : '').toBe('left\ncommon\nright\n');
  });

  it('merges three 16 MiB line-dense terms within the advertised byte bound', async () => {
    const algebra = await load();
    const termBytes = 16 * 1024 * 1024;
    const lineBytes = 32;
    const base = new Uint8Array(termBytes).fill(120);
    for (let offset = lineBytes - 1; offset < termBytes; offset += lineBytes) {
      base[offset] = 10;
    }
    const left = new Uint8Array(base);
    left[0] = 121;

    const merged = algebra.merge3({ terms: [left, base, base] });
    expect(merged.kind).toBe('resolved');
    if (merged.kind !== 'resolved') {
      return;
    }
    expect(merged.content).toHaveLength(left.length);
    expect(merged.content[0]).toBe(left[0]);
    expect(merged.content.at(-1)).toBe(left.at(-1));
  });

  it('reports a real conflict as hunks and materializes it with markers', async () => {
    const algebra = await load();
    const terms = ['left\n', 'base\n', 'right\n'].map((term) => encoder.encode(term));
    const merged = algebra.merge3({ terms });
    expect(merged.kind).toBe('conflict');
    const materialized = decoder.decode(algebra.materialize({ terms, labels: ['ours', 'base', 'theirs'] }));
    expect(materialized).toContain('<<<<<<<');
    expect(materialized).toContain('>>>>>>>');
    const parsed = algebra.parseConflict({
      content: encoder.encode(materialized),
      sides: 2,
      markerLength: 7,
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.map((term) => decoder.decode(term))).toStrictEqual(['left\n', 'base\n', 'right\n']);
  });

  it('diffs two sides by line', async () => {
    const algebra = await load();
    const hunks = algebra.diff2({
      left: encoder.encode('a\nb\n'),
      right: encoder.encode('a\nc\n'),
    });
    expect(algebra.describe().contractMajor).toBe(1);
    expect(hunks.map((hunk) => hunk.kind)).toStrictEqual(['matching', 'different']);
    expect(decoder.decode(hunks[0]!.contents[0])).toBe('a\n');
  });

  /*
   * RC5 S4 / decisions Q10 defect 1: the request used to be assembled twice on
   * the calling thread — once by the writer and once by the envelope — before
   * the engine's own copy, so a 100 MiB two-sided diff moved 200 MiB through
   * the page thread and produced a 56 ms long task. Operands are now written
   * straight into linear memory, so no buffer the size of an operand is
   * allocated on the calling thread at all.
   */
  it('copies operands once, into engine memory, and never onto the calling thread', async () => {
    const algebra = await load();
    const side = (mutateEvery: number): Uint8Array<ArrayBuffer> => {
      const lines = 16_384;
      const bytes = new Uint8Array(new ArrayBuffer(lines * 32));
      for (let line = 0; line < lines; line += 1) {
        bytes.set(encoder.encode(`line-${line}`.padEnd(31, line % mutateEvery === 0 ? 'y' : 'x')), line * 32);
        bytes[line * 32 + 31] = 10;
      }
      return bytes;
    };
    const left = side(Number.POSITIVE_INFINITY);
    const right = side(16);

    const allocations: number[] = [];
    const realArrayBuffer = globalThis.ArrayBuffer;
    class CountingArrayBuffer extends realArrayBuffer {
      public constructor(length: number) {
        allocations.push(length);
        super(length);
      }
    }
    // oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- the subclass is `ArrayBuffer`; only construction is observed.
    globalThis.ArrayBuffer = CountingArrayBuffer as unknown as ArrayBufferConstructor;
    try {
      algebra.diff2({ left, right });
    } finally {
      globalThis.ArrayBuffer = realArrayBuffer;
    }

    expect(Math.max(...allocations, 0)).toBeLessThan(left.length);
  });
});
