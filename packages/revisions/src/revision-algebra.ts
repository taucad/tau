/* eslint-disable import-x/no-extraneous-dependencies -- the package import map resolves `#*.js` to this package's own source files. */
/* oxlint-disable no-bitwise, unicorn/numeric-separators-style -- the substrate packs a pointer and a length into one u64 and masks them apart. */

/**
 * Thin loader and wire codec for the compiled revision algebra (S-ALGEBRA).
 *
 * The artifact is `jj-lib`'s own merge, diff and conflict-materialization code
 * compiled to WebAssembly from a pinned Jujutsu revision, so a browser host
 * resolves a three-way merge to exactly the bytes the CLI would. It is the one
 * piece that is identical on every host.
 *
 * This module owns only the transport: digest verification, the `TRAV` envelope
 * and the request/response payloads. The artifact bytes are supplied by the
 * caller and are never bundled, downloaded or read from disk here.
 */

import { digestHex } from '#object-hash.js';
import { RevisionPortError } from '#revision-port.js';

/** Wire contract version implemented by this codec and by the pinned artifact. @public */
export const algebraContract = Object.freeze({ major: 1, minor: 0 });

/** Jujutsu revision the artifact is compiled from. @public */
export const algebraSourceRevision = 'c09b0c337f0dbff496ad3d696684aa1128482c38';

/**
 * Semantic provenance digest compiled into the artifact.
 *
 * Recorded from the RC1/attempt-2 + RC2/attempt-3 re-cut (coordinator ruling
 * D2). The superseded attempt-1 identities are not accepted anywhere.
 *
 * @public
 */
export const algebraProvenanceDigest = 'f44484a0954de6360394264b55c4042d1b445d2deab828e356861692f0e83abc';

/**
 * SHA-256 of the qualified `raw-full.wasm` artifact, 148,980 bytes.
 *
 * Durable copy:
 * `research/artifacts/agent-revisions-and-compute-cache-spike-closeout/execution/RC2/attempt-3/evidence/final/artifacts/raw-full.wasm`.
 *
 * @public
 */
export const algebraRawWasmSha256 = '1eb690535c04376daee442eaa4b1ebc34b69a84859a4663d899e0591eac4a83d';

/**
 * SHA-256 of the qualified darwin-arm64 native binding, 405,152 bytes.
 *
 * Control retained; not adopted (decisions Q9). Raw WebAssembly is the algebra
 * path on every host, Node included: {@link loadRevisionAlgebra} verifies and
 * instantiates the WASM artifact and refuses any module that declares imports,
 * and nothing here loads the native binding. The digest is kept only so a
 * future re-cut can be checked against the qualified bytes — it is not a load
 * path, and the native add-on is out of the release plan.
 *
 * @public
 */
export const algebraNativeDarwinArm64Sha256 = '1a009d9372317436d4d41b3a2782257ec27e638f264edafebcb41128d9b23245';

const magic = Uint8Array.of(0x54, 0x52, 0x41, 0x56); // "TRAV"
const headerLength = 20;
const opDescribe = 1;
const opDiff = 3;
const opMerge = 4;
const opMaterialize = 5;
const opParse = 6;

/** Hunk granularity for diff and merge. @public */
export type HunkLevel = 'line' | 'word';

/** How identical changes on several sides are treated. @public */
export type SameChange = 'accept' | 'keep';

/** Conflict marker dialect. @public */
export type MarkerStyle = 'diff' | 'diff-experimental' | 'snapshot' | 'git';

const hunkLevelCode = (level: HunkLevel): number => (level === 'line' ? 0 : 1);
const sameChangeCode = (value: SameChange): number => (value === 'accept' ? 0 : 1);
const markerStyleCode = (style: MarkerStyle): number =>
  style === 'diff' ? 0 : style === 'diff-experimental' ? 1 : style === 'snapshot' ? 2 : 3;

class ByteWriter {
  readonly #parts: Array<Uint8Array<ArrayBuffer>> = [];
  #length = 0;

  public u8(value: number): void {
    this.#push(Uint8Array.of(value));
  }

  public u16(value: number): void {
    const bytes = new Uint8Array(new ArrayBuffer(2));
    new DataView(bytes.buffer).setUint16(0, value, true);
    this.#push(bytes);
  }

  public u32(value: number): void {
    const bytes = new Uint8Array(new ArrayBuffer(4));
    new DataView(bytes.buffer).setUint32(0, value, true);
    this.#push(bytes);
  }

  public blob(value: Uint8Array<ArrayBuffer>): void {
    this.u32(value.length);
    this.#push(value);
  }

  public get length(): number {
    return this.#length;
  }

  /**
   * Write the parts into an already-sized target, in order.
   *
   * The target is the engine's own linear memory, which is why no buffer the
   * size of an operand is ever allocated on the calling thread.
   *
   * @param target - Destination view, at least `offset + length` bytes long.
   * @param offset - First byte to write.
   */
  public copyInto(target: Uint8Array<ArrayBuffer>, offset: number): void {
    let cursor = offset;
    for (const part of this.#parts) {
      target.set(part, cursor);
      cursor += part.length;
    }
  }

  #push(part: Uint8Array<ArrayBuffer>): void {
    this.#parts.push(part);
    this.#length += part.length;
  }
}

class ByteReader {
  readonly #source: Uint8Array<ArrayBuffer>;
  readonly #view: DataView;
  #offset: number;

  public constructor(source: Uint8Array<ArrayBuffer>, offset = 0) {
    this.#source = source;
    this.#view = new DataView(source.buffer, source.byteOffset, source.byteLength);
    this.#offset = offset;
  }

  public u8(): number {
    const value = this.#view.getUint8(this.#offset);
    this.#offset += 1;
    return value;
  }

  public u16(): number {
    const value = this.#view.getUint16(this.#offset, true);
    this.#offset += 2;
    return value;
  }

  public u32(): number {
    const value = this.#view.getUint32(this.#offset, true);
    this.#offset += 4;
    return value;
  }

  public u64(): bigint {
    const value = this.#view.getBigUint64(this.#offset, true);
    this.#offset += 8;
    return value;
  }

  public blob(): Uint8Array<ArrayBuffer> {
    const length = this.u32();
    if (this.#offset + length > this.#source.length) {
      throw new RevisionPortError('ENGINE_FAILED', 'Revision algebra response is truncated.');
    }
    const value = new Uint8Array(new ArrayBuffer(length));
    value.set(this.#source.subarray(this.#offset, this.#offset + length));
    this.#offset += length;
    return value;
  }

  public text(): string {
    return new TextDecoder().decode(this.blob());
  }

  public get done(): boolean {
    return this.#offset === this.#source.length;
  }
}

/**
 * Write the `TRAV` request header over the first {@link headerLength} bytes of
 * a target the caller has already sized.
 *
 * @param target - Destination view; its header bytes are overwritten in place.
 * @param opcode - Operation the payload belongs to.
 * @param payloadLength - Payload bytes that follow the header.
 */
const writeHeader = (target: Uint8Array<ArrayBuffer>, opcode: number, payloadLength: number): void => {
  // The engine's allocator does not hand back zeroed memory, so the reserved
  // bytes are cleared rather than assumed clear.
  target.fill(0, 0, headerLength);
  target.set(magic, 0);
  const view = new DataView(target.buffer, target.byteOffset, headerLength);
  view.setUint16(4, algebraContract.major, true);
  view.setUint16(6, algebraContract.minor, true);
  target[8] = opcode;
  view.setBigUint64(12, BigInt(payloadLength), true);
};

const responseBody = (opcode: number, response: Uint8Array<ArrayBuffer>): ByteReader => {
  if (response.length < headerLength + 1 || !magic.every((byte, index) => response[index] === byte)) {
    throw new RevisionPortError('ENGINE_FAILED', 'Revision algebra returned a malformed envelope.');
  }
  if (response[8] !== opcode) {
    throw new RevisionPortError('ENGINE_FAILED', 'Revision algebra answered a different operation.');
  }
  const reader = new ByteReader(response, headerLength);
  if (reader.u8() !== 0) {
    const code = reader.u16();
    throw new RevisionPortError('ENGINE_FAILED', `Revision algebra rejected the request (code ${code}).`);
  }
  return reader;
};

/**
 * Descriptor the artifact reports about itself.
 *
 * Merge input is bounded by the artifact's advertised maximum total input of
 * 128 MiB. A merge that produces more than one million conflict hunks returns
 * the typed conflict-hunk-limit refusal; input line count is not a bound.
 *
 * @public
 */
export type AlgebraDescriptor = Readonly<{
  contractMajor: number;
  contractMinor: number;
  implementation: string;
  sourceRevision: string;
  provenanceDigest: string;
  features: number;
  maxMergeTerms: number;
  /**
   * Every path one batch may touch — **including the ancestor directories the
   * engine derives from the leaves it was given**, not just the leaves.
   *
   * RC5 contract defect 1: a caller that reads this as a leaf bound has a
   * 100,000-leaf snapshot refused `BATCH_TOO_LARGE` in any tree that is not
   * flat, because `src/module{0..511}/…` expands to 100,513. The admissible
   * leaf count is `maxBatchPaths - |distinct ancestor directories|`, and it is
   * the caller's to compute; the engine states the total it can hold.
   */
  maxBatchPaths: number;
  initialMemoryPages: number;
  maximumMemoryPages: number;
}>;

/** One hunk of a two-sided diff. @public */
export type AlgebraDiffHunk = Readonly<{
  kind: 'matching' | 'different';
  contents: ReadonlyArray<Uint8Array<ArrayBuffer>>;
}>;

/** Outcome of an N-term merge: resolved bytes, or the conflicted hunks. @public */
export type AlgebraMergeResult =
  | Readonly<{ kind: 'resolved'; content: Uint8Array<ArrayBuffer> }>
  | Readonly<{ kind: 'conflict'; hunks: ReadonlyArray<ReadonlyArray<Uint8Array<ArrayBuffer>>> }>;

/**
 * The compiled algebra, loaded and verified.
 *
 * **Operand ownership.** Every operand is written once, directly into the
 * engine's linear memory, and is never copied onto the calling thread first —
 * that is what keeps a 100 MiB two-sided diff off the page thread's long-task
 * budget (RC5 S4; decisions Q10 defect 1). The consequence for a caller is that
 * an operand must stay readable and unmodified for the duration of the call: do
 * not mutate it, do not detach it by transferring its buffer to a worker, and
 * do not hand the same buffer to two concurrent calls. Returned bytes are the
 * caller's own copy and carry no such restriction.
 *
 * @public
 */
export type RevisionAlgebra = Readonly<{
  describe(): AlgebraDescriptor;
  diff2(
    input: Readonly<{ left: Uint8Array<ArrayBuffer>; right: Uint8Array<ArrayBuffer>; hunkLevel?: HunkLevel }>,
  ): readonly AlgebraDiffHunk[];
  merge3(
    input: Readonly<{ terms: ReadonlyArray<Uint8Array<ArrayBuffer>>; hunkLevel?: HunkLevel; sameChange?: SameChange }>,
  ): AlgebraMergeResult;
  materialize(
    input: Readonly<{
      terms: ReadonlyArray<Uint8Array<ArrayBuffer>>;
      labels?: readonly string[];
      hunkLevel?: HunkLevel;
      sameChange?: SameChange;
      markerStyle?: MarkerStyle;
      /** `'auto'` lets the engine pick the shortest safe marker length. */
      markerLength?: number | 'auto';
    }>,
  ): Uint8Array<ArrayBuffer>;
  parseConflict(
    input: Readonly<{ content: Uint8Array<ArrayBuffer>; sides: number; markerLength: number }>,
  ): ReadonlyArray<ReadonlyArray<Uint8Array<ArrayBuffer>>>;
}>;

/* eslint-disable @typescript-eslint/naming-convention -- the WebAssembly exports carry the substrate's own C ABI names. */
type RawExports = Readonly<{
  memory: WebAssembly.Memory;
  revision_algebra_alloc: (length: number) => number;
  revision_algebra_dealloc: (pointer: number, length: number) => number;
  revision_algebra_execute: (pointer: number, length: number) => bigint;
}>;
/* eslint-enable @typescript-eslint/naming-convention -- back to Tau's own naming below. */

/** Input for loading the compiled algebra. @public */
export type LoadRevisionAlgebraInput = Readonly<{
  /** Artifact bytes. Verified against `algebraRawWasmSha256` before compilation. */
  artifact: Uint8Array<ArrayBuffer>;
  /** Override the expected digest only to load a deliberately re-cut artifact. */
  expectedSha256?: string;
}>;

/**
 * Verify, compile and instantiate the compiled revision algebra.
 *
 * @param input - Artifact bytes and the digest they must match.
 * @returns A synchronous algebra bound to the verified module.
 * @throws RevisionPortError When the digest, imports or exports do not match.
 * @public
 */
export const loadRevisionAlgebra = async (input: LoadRevisionAlgebraInput): Promise<RevisionAlgebra> => {
  const artifact = new Uint8Array(new ArrayBuffer(input.artifact.length));
  artifact.set(input.artifact);
  const expected = input.expectedSha256 ?? algebraRawWasmSha256;
  const actual = digestHex('sha256', artifact);
  if (actual !== expected) {
    throw new RevisionPortError(
      'ENGINE_UNAVAILABLE',
      `Revision algebra artifact digest ${actual} does not match the recorded ${expected}.`,
    );
  }
  const module = await WebAssembly.compile(artifact);
  if (WebAssembly.Module.imports(module).length > 0) {
    throw new RevisionPortError('ENGINE_UNAVAILABLE', 'Revision algebra artifact declares imports.');
  }
  const instance = await WebAssembly.instantiate(module, {});
  // oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- the export shape is proven by the verified digest.
  const raw = instance.exports as unknown as RawExports;

  /**
   * Run one operation, writing the request straight into the engine.
   *
   * The writer's parts — the operands among them — are copied exactly once,
   * into linear memory, so nothing operand-sized is allocated on the calling
   * thread (RC5 S4 copy gate; decisions Q10 defect 1). The allocation can grow
   * the memory, so the buffer is taken after it.
   *
   * @param opcode - Operation to run.
   * @param writer - The request payload, still in parts.
   * @returns A reader positioned after the response header.
   */
  const execute = (opcode: number, writer: ByteWriter): ByteReader => {
    const length = headerLength + writer.length;
    const pointer = raw.revision_algebra_alloc(length);
    if (pointer === 0) {
      throw new RevisionPortError('ENGINE_FAILED', 'Revision algebra could not allocate its request.');
    }
    try {
      const target = new Uint8Array(raw.memory.buffer, pointer, length);
      writeHeader(target, opcode, writer.length);
      writer.copyInto(target, headerLength);
      const packed = raw.revision_algebra_execute(pointer, length);
      const responsePointer = Number(packed & 0xffff_ffffn);
      const responseLength = Number(packed >> 32n);
      if (responsePointer === 0 || responseLength === 0) {
        throw new RevisionPortError('ENGINE_FAILED', 'Revision algebra lost its substrate.');
      }
      try {
        return responseBody(opcode, new Uint8Array(raw.memory.buffer, responsePointer, responseLength).slice());
      } finally {
        raw.revision_algebra_dealloc(responsePointer, responseLength);
      }
    } finally {
      raw.revision_algebra_dealloc(pointer, length);
    }
  };

  const readHunks = (reader: ByteReader): ReadonlyArray<ReadonlyArray<Uint8Array<ArrayBuffer>>> => {
    const count = reader.u32();
    const hunks: Array<ReadonlyArray<Uint8Array<ArrayBuffer>>> = [];
    for (let index = 0; index < count; index += 1) {
      const terms = reader.u32();
      const values: Array<Uint8Array<ArrayBuffer>> = [];
      for (let term = 0; term < terms; term += 1) {
        values.push(reader.blob());
      }
      hunks.push(Object.freeze(values));
    }
    return Object.freeze(hunks);
  };

  const descriptor = ((): AlgebraDescriptor => {
    const reader = execute(opDescribe, new ByteWriter());
    const contractMajor = reader.u16();
    const contractMinor = reader.u16();
    const implementation = reader.text();
    const sourceRevision = reader.text();
    const provenanceDigest = reader.text();
    reader.u8(); // Projection code
    const features = reader.u32();
    reader.u64(); // Maximum total input bytes
    reader.u64(); // Maximum response bytes
    const maxMergeTerms = reader.u32();
    reader.u32(); // Maximum conflict hunks
    const maxBatchPaths = reader.u32();
    reader.u32(); // Maximum path bytes
    reader.u32(); // Maximum ignore layers
    reader.u64(); // Maximum ignore bytes
    reader.u32(); // Maximum label bytes
    reader.u32(); // Maximum marker length
    const initialMemoryPages = reader.u32();
    const maximumMemoryPages = reader.u32();
    return Object.freeze({
      contractMajor,
      contractMinor,
      implementation,
      sourceRevision,
      provenanceDigest,
      features,
      maxMergeTerms,
      maxBatchPaths,
      initialMemoryPages,
      maximumMemoryPages,
    });
  })();

  if (descriptor.sourceRevision !== algebraSourceRevision || descriptor.provenanceDigest !== algebraProvenanceDigest) {
    throw new RevisionPortError(
      'ENGINE_UNAVAILABLE',
      'Revision algebra artifact reports a different pinned source or provenance.',
    );
  }

  return Object.freeze({
    describe: () => descriptor,
    diff2: ({ left, right, hunkLevel = 'line' }) => {
      const writer = new ByteWriter();
      writer.u8(hunkLevelCode(hunkLevel));
      writer.blob(left);
      writer.blob(right);
      const reader = execute(opDiff, writer);
      const count = reader.u32();
      const hunks: AlgebraDiffHunk[] = [];
      for (let index = 0; index < count; index += 1) {
        const kind = reader.u8() === 0 ? 'matching' : 'different';
        const contents = reader.u32();
        const values: Array<Uint8Array<ArrayBuffer>> = [];
        for (let content = 0; content < contents; content += 1) {
          values.push(reader.blob());
        }
        hunks.push(Object.freeze({ kind, contents: Object.freeze(values) }));
      }
      return Object.freeze(hunks);
    },
    merge3: ({ terms, hunkLevel = 'line', sameChange = 'accept' }) => {
      const writer = new ByteWriter();
      writer.u8(hunkLevelCode(hunkLevel));
      writer.u8(sameChangeCode(sameChange));
      writer.u32(terms.length);
      for (const term of terms) {
        writer.blob(term);
      }
      const reader = execute(opMerge, writer);
      // The status byte precedes the body; read it before anything else.
      const resolved = reader.u8() === 0;
      const result: AlgebraMergeResult = resolved
        ? { kind: 'resolved', content: reader.blob() }
        : { kind: 'conflict', hunks: readHunks(reader) };
      return Object.freeze(result);
    },
    materialize: ({
      terms,
      labels = [],
      hunkLevel = 'line',
      sameChange = 'accept',
      markerStyle = 'diff',
      markerLength = 'auto',
    }) => {
      const writer = new ByteWriter();
      writer.u8(hunkLevelCode(hunkLevel));
      writer.u8(sameChangeCode(sameChange));
      writer.u8(markerStyleCode(markerStyle));
      writer.u16(markerLength === 'auto' ? 0 : markerLength);
      writer.u32(terms.length);
      for (const term of terms) {
        writer.blob(term);
      }
      writer.u32(labels.length);
      for (const label of labels) {
        writer.blob(new TextEncoder().encode(label));
      }
      return execute(opMaterialize, writer).blob();
    },
    parseConflict: ({ content, sides, markerLength }) => {
      const writer = new ByteWriter();
      writer.u32(sides);
      writer.u16(markerLength);
      writer.blob(content);
      return readHunks(execute(opParse, writer));
    },
  });
};
