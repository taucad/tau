/**
 * Seeded synthetic project of the STO-25 shape (charter D21).
 *
 * The reference fixture is 2,000 files: 1,500 text files of about 50 MiB in
 * all and 500 large-object (LFS) binaries of about 450 MiB, five of them
 * 50–100 MiB, with 200 revisions of history. A profile scales both the file
 * counts and the bytes by one factor, so CI runs a small profile and the full
 * shape runs on demand; the same seed and factor always yield the same paths,
 * sizes, revisions and bytes.
 *
 * Planning never materialises bytes: {@link fixtureBytes} generates one entry's
 * content when a scenario asks for it.
 *
 * @module
 */
/* oxlint-disable no-bitwise -- seeded generators and seed mixing are 32-bit integer arithmetic. */

/** A named fixture size. */
export type FixtureProfile = Readonly<{ name: string; scale: number }>;

/** The profiles the harness knows; `small` is CI's, `full` is the STO-25 shape. */
export const fixtureProfiles = {
  small: { name: 'small', scale: 1 / 20 },
  full: { name: 'full', scale: 1 },
} as const satisfies Record<string, FixtureProfile>;

/** The seed every recorded baseline uses. */
export const defaultFixtureSeed = 25;

const mebibyte = 1024 * 1024;

/** The full-scale shape (D21). */
export const referenceShape = {
  textFiles: 1500,
  textBytes: 50 * mebibyte,
  binaryFiles: 500,
  binaryBytes: 450 * mebibyte,
  /** The five large objects at full scale, before jitter, in MiB. */
  largeObjectMebibytes: [50, 62, 75, 87, 100],
  revisions: 200,
} as const;

/** One file of the fixture. */
export type FixtureEntry = Readonly<{
  path: string;
  kind: 'text' | 'binary';
  /** Size at every revision; edits rewrite bytes, never the size. */
  size: number;
  /** Whether `.gitattributes` routes it to LFS. */
  lfs: boolean;
  seed: number;
  /** Ascending revision indices at which this entry's content changed; always starts at 0. */
  revisions: readonly number[];
}>;

/** One revision of the fixture's history. */
export type FixtureRevision = Readonly<{ index: number; changed: readonly string[] }>;

/** A whole fixture, without bytes. */
export type FixturePlan = Readonly<{
  seed: number;
  scale: number;
  entries: readonly FixtureEntry[];
  revisions: readonly FixtureRevision[];
  totals: Readonly<{
    files: number;
    textFiles: number;
    binaryFiles: number;
    largeObjects: number;
    textBytes: number;
    binaryBytes: number;
    bytes: number;
    revisions: number;
  }>;
}>;

/** The token one in ten text files carries, for grep scenarios. */
export const fixtureMarker = 'TAU_FIXTURE_MARKER';

/**
 * Mulberry32: a small, fast, seedable 32-bit generator.
 *
 * @param seed - Any 32-bit integer.
 * @returns A function yielding uniform numbers in [0, 1).
 */
export const createRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const scaledCount = (count: number, scale: number): number => Math.max(1, Math.round(count * scale));

/**
 * Split `total` bytes over `count` files with a log-normal spread, deterministically.
 *
 * @param random - The seeded generator.
 * @param spread - How many sizes, their exact sum, and the spread (sigma) of the underlying normal.
 * @returns The sizes, each at least 64 bytes, summing to `total` when that allows it.
 */
const spreadSizes = (
  random: () => number,
  { count, total, sigma }: Readonly<{ count: number; total: number; sigma: number }>,
): number[] => {
  const weights = Array.from({ length: count }, () => {
    const u = Math.max(random(), Number.EPSILON);
    const v = random();
    return Math.exp(sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v));
  });
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  const sizes = weights.map((weight) => Math.max(64, Math.floor((weight / weightSum) * total)));
  const drift = total - sizes.reduce((sum, size) => sum + size, 0);
  const largest = sizes.indexOf(Math.max(...sizes));
  sizes[largest] = Math.max(64, (sizes[largest] ?? 64) + drift);
  return sizes;
};

const textAreas = ['src', 'lib', 'docs', 'models', 'parts', 'tests', 'scripts', 'config'] as const;
const textExtensions = ['ts', 'ts', 'ts', 'tsx', 'js', 'json', 'md', 'scad', 'py', 'kcl'] as const;
/* Every area is versioned under Tau's path policy: a root `exports/` is Tau's generated
 * output, which no revision carries, so a checkout of a tree holding it is refused. */
const binaryAreas = ['assets/meshes', 'assets/cad', 'assets/textures', 'renders', 'scans'] as const;
/* Binary formats only: STEP is text (ISO 10303-21), so the CAD part is a SolidWorks part, an OLE container. */
const binaryExtensions = ['stl', 'sldprt', 'glb', 'png', '3mf'] as const;

const encoder = new TextEncoder();

const littleEndian32 = (value: number): number[] => [
  value & 0xff,
  (value >>> 8) & 0xff,
  (value >>> 16) & 0xff,
  value >>> 24,
];

/**
 * The leading bytes a real file of the format starts with, as the binary
 * fixture's head (S12). Every one holds a NUL within its first 64 bytes, the
 * smallest planned size, so the production head sniff (NUL in the first
 * 512 bytes, D4) judges every fixture binary as binary, as it would the real
 * format; none starts with a byte-order mark. The header depends on the
 * format and the size only, never the revision.
 *
 * @param path - The entry's path, whose extension names the format.
 * @param size - The entry's size, which a GLB header records.
 * @returns The header bytes.
 */
const binaryHeader = (path: string, size: number): Uint8Array<ArrayBuffer> => {
  const extension = path.slice(path.lastIndexOf('.') + 1);
  switch (extension) {
    case 'png': {
      /* Signature, then the IHDR chunk's length (13) and type. */
      return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);
    }
    case 'glb': {
      /* `glTF`, container version 2, total length. */
      return new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, ...littleEndian32(size)]);
    }
    case 'stl': {
      /* An 80-byte header padded with NUL (never starting `solid`, which names ASCII STL), then the triangle count. */
      const header = new Uint8Array(84);
      header.set(encoder.encode('tau fixture binary stl'));
      header.set(littleEndian32(Math.max(0, Math.floor((size - 84) / 50))), 80);
      return header;
    }
    case '3mf': {
      /* A zip local file header (version 2.0, deflate) for `[Content_Types].xml`. */
      const name = encoder.encode('[Content_Types].xml');
      const header = new Uint8Array(30 + name.length);
      header.set([0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0, 0x08, 0]);
      header.set([name.length, 0], 26);
      header.set(name, 30);
      return header;
    }
    case 'sldprt': {
      /* OLE compound file: signature, a zero CLSID, minor version 0x3E, major version 3, little-endian mark. */
      const header = new Uint8Array(32);
      header.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
      header.set([0x3e, 0, 0x03, 0, 0xfe, 0xff], 24);
      return header;
    }
    default: {
      throw new Error(`No binary header for '${path}'.`);
    }
  }
};

const pick = <Value>(random: () => number, values: readonly Value[]): Value =>
  values[Math.floor(random() * values.length)] as Value;

/**
 * Plan a fixture: every path, size and revision, without bytes.
 *
 * @param options - The seed and the scale factor (1 is the STO-25 shape).
 * @returns The plan; equal inputs always give an equal plan.
 */
export const planFixture = (options: Readonly<{ seed: number; scale: number }>): FixturePlan => {
  const { seed, scale } = options;
  if (!(scale > 0 && scale <= 1)) {
    throw new RangeError(`Fixture scale must be in (0, 1]; got ${String(scale)}.`);
  }
  const random = createRandom(seed);
  const textCount = scaledCount(referenceShape.textFiles, scale);
  const binaryCount = scaledCount(referenceShape.binaryFiles, scale);
  const largeCount = Math.min(binaryCount, scaledCount(referenceShape.largeObjectMebibytes.length, scale));
  const textTotal = Math.round(referenceShape.textBytes * scale);
  const binaryTotal = Math.round(referenceShape.binaryBytes * scale);

  const textSizes = spreadSizes(random, { count: textCount, total: textTotal, sigma: 1.1 });
  const largeSizes = referenceShape.largeObjectMebibytes
    .slice(0, largeCount)
    .map((mebibytes) => Math.round((mebibytes + (random() - 0.5) * 4) * mebibyte * scale));
  const largeTotal = largeSizes.reduce((sum, size) => sum + size, 0);
  const smallBinaryCount = binaryCount - largeCount;
  const smallBinarySizes =
    smallBinaryCount === 0
      ? []
      : spreadSizes(random, { count: smallBinaryCount, total: Math.max(0, binaryTotal - largeTotal), sigma: 1.4 });

  const used = new Set<string>();
  const uniquePath = (candidate: () => string): string => {
    for (;;) {
      const path = candidate();
      if (!used.has(path)) {
        used.add(path);
        return path;
      }
    }
  };
  const nextSeed = (): number => Math.floor(random() * 4_294_967_296);

  const entries: Array<{
    path: string;
    kind: 'text' | 'binary';
    size: number;
    lfs: boolean;
    seed: number;
    revisions: number[];
  }> = [];
  for (const [index, size] of textSizes.entries()) {
    const path =
      index === 0
        ? (used.add('.gitattributes'), '.gitattributes')
        : index === 1
          ? (used.add('main.ts'), 'main.ts')
          : uniquePath(() => {
              const area = pick(random, textAreas);
              const depth = 1 + Math.floor(random() * 3);
              const directories = Array.from({ length: depth }, () => `m${String(Math.floor(random() * 12))}`);
              return `${area}/${directories.join('/')}/f${String(index)}.${pick(random, textExtensions)}`;
            });
    entries.push({ path, kind: 'text', size, lfs: false, seed: nextSeed(), revisions: [0] });
  }
  for (const [index, size] of [...largeSizes, ...smallBinarySizes].entries()) {
    const path = uniquePath(() => {
      const area = pick(random, binaryAreas);
      const group = `g${String(Math.floor(random() * 8))}`;
      return `${area}/${group}/b${String(index)}.${pick(random, binaryExtensions)}`;
    });
    entries.push({ path, kind: 'binary', size, lfs: true, seed: nextSeed(), revisions: [0] });
  }

  /* History: revision 0 adds everything; each later one edits one to ten text
   * files and, every twentieth, one small binary. Sizes never change. */
  const textIndices = entries.flatMap((entry, index) => (entry.kind === 'text' && index > 0 ? [index] : []));
  const binaryIndices = entries.flatMap((entry, index) => (entry.kind === 'binary' ? [index] : []));
  const revisions: FixtureRevision[] = [{ index: 0, changed: entries.map((entry) => entry.path) }];
  for (let index = 1; index < referenceShape.revisions; index += 1) {
    const touched = new Set<number>();
    const edits = 1 + Math.floor(random() * 10);
    for (let edit = 0; edit < edits && textIndices.length > 0; edit += 1) {
      touched.add(pick(random, textIndices));
    }
    if (index % 20 === 0 && binaryIndices.length > largeCount) {
      touched.add(pick(random, binaryIndices.slice(largeCount)));
    }
    const changed = [...touched].sort((left, right) => left - right);
    for (const entryIndex of changed) {
      entries[entryIndex]?.revisions.push(index);
    }
    revisions.push({ index, changed: changed.map((entryIndex) => entries[entryIndex]?.path ?? '') });
  }

  const sum = (kind: 'text' | 'binary'): number => {
    let total = 0;
    for (const entry of entries) {
      total += entry.kind === kind ? entry.size : 0;
    }
    return total;
  };
  const textBytes = sum('text');
  const binaryBytes = sum('binary');
  return {
    seed,
    scale,
    entries,
    revisions,
    totals: {
      files: entries.length,
      textFiles: textCount,
      binaryFiles: binaryCount,
      largeObjects: largeCount,
      textBytes,
      binaryBytes,
      bytes: textBytes + binaryBytes,
      revisions: revisions.length,
    },
  };
};

const words = [
  'const',
  'export',
  'function',
  'return',
  'import',
  'from',
  'width',
  'height',
  'radius',
  'fillet',
  'extrude',
  'sketch',
  'union',
  'translate',
  'rotate',
  'module',
  'value',
  'params',
  'assembly',
  'bracket',
].map((word) => encoder.encode(word));

/**
 * The revision whose content an entry carries at `revision`.
 *
 * @param entry - The entry.
 * @param revision - Any revision index.
 * @returns The latest revision at or before `revision` that changed the entry.
 */
export const contentRevision = (entry: FixtureEntry, revision: number): number =>
  entry.revisions.findLast((changed) => changed <= revision) ?? 0;

const gitattributes = (size: number): Uint8Array<ArrayBuffer> => {
  const rules = binaryExtensions.map((extension) => `*.${extension} filter=lfs diff=lfs merge=lfs -text\n`).join('');
  const bytes = new Uint8Array(size);
  bytes.fill(0x0a);
  bytes.set(encoder.encode(rules).subarray(0, size));
  return bytes;
};

/**
 * Generate one entry's bytes as of `revision`.
 *
 * Text is ASCII pseudo-source (valid UTF-8, newline-terminated lines), and one
 * file in ten carries {@link fixtureMarker}; a binary is its format's real
 * header followed by seeded noise.
 *
 * @param entry - The entry.
 * @param revision - The revision whose content to generate (default 0).
 * @returns Exactly `entry.size` bytes.
 */
export const fixtureBytes = (entry: FixtureEntry, revision = 0): Uint8Array<ArrayBuffer> => {
  const version = contentRevision(entry, revision);
  const seed = (entry.seed ^ Math.imul(version + 1, 0x9e_37_79_b1)) >>> 0;
  if (entry.path === '.gitattributes') {
    return gitattributes(entry.size);
  }
  if (entry.kind === 'binary') {
    const words32 = new Uint32Array(Math.ceil(entry.size / 4));
    let state = seed || 1;
    for (let index = 0; index < words32.length; index += 1) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      words32[index] = state >>> 0;
    }
    const bytes = new Uint8Array(words32.buffer, 0, entry.size).slice();
    bytes.set(binaryHeader(entry.path, entry.size).subarray(0, entry.size));
    return bytes;
  }
  const random = createRandom(seed);
  const bytes = new Uint8Array(entry.size);
  let offset = 0;
  if (seed % 10 === 0) {
    const marker = encoder.encode(`// ${fixtureMarker} r${String(version)}\n`);
    bytes.set(marker.subarray(0, entry.size));
    offset = Math.min(entry.size, marker.length);
  }
  let column = 0;
  while (offset < entry.size) {
    const word = words[Math.floor(random() * words.length)]!;
    const room = entry.size - offset;
    bytes.set(word.subarray(0, room), offset);
    offset += Math.min(word.length, room);
    column += word.length;
    if (offset < entry.size) {
      const separator = column > 72 ? 0x0a : 0x20;
      bytes[offset] = separator;
      offset += 1;
      column = separator === 0x0a ? 0 : column + 1;
    }
  }
  if (entry.size > 0) {
    bytes[entry.size - 1] = 0x0a;
  }
  return bytes;
};

/**
 * The LFS pointer a checkout writes for a large object before its fill.
 *
 * The oid is a seeded stand-in, not the content's SHA-256: hashing 450 MiB at
 * plan time would dominate a small run, and no scenario that runs at W0
 * resolves an oid. The pointer's length and shape match a real one.
 *
 * @param entry - A binary entry.
 * @param revision - The revision whose object the pointer names (default 0).
 * @returns The pointer file's bytes.
 */
export const fixturePointer = (entry: FixtureEntry, revision = 0): Uint8Array<ArrayBuffer> => {
  const random = createRandom((entry.seed ^ (contentRevision(entry, revision) + 1)) >>> 0);
  const oid = Array.from({ length: 64 }, () => Math.floor(random() * 16).toString(16)).join('');
  return encoder.encode(`version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize ${String(entry.size)}\n`);
};

/**
 * What a checkout writes for an entry before any large-object fill: text bytes, or a pointer.
 *
 * @param entry - The entry.
 * @param revision - The revision (default 0).
 * @returns The working-tree bytes before the fill.
 */
export const checkoutBytes = (entry: FixtureEntry, revision = 0): Uint8Array<ArrayBuffer> =>
  entry.lfs ? fixturePointer(entry, revision) : fixtureBytes(entry, revision);
