import { randomBytes } from 'node:crypto';
import type { ManifestBytes } from '#api/git/store/port.js';
import { retentionWindowMilliseconds } from '#api/git/store/limits.js';

/**
 * The manifest codec. The manifest and the packs it lists are the complete
 * authoritative state of a repository (NI1); nothing on any worker's disk is.
 * The port below this file treats the manifest as bytes, so the format lives
 * here alone — including the two things that make a race decidable: a random
 * per-incarnation nonce, and a strictly increasing generation.
 *
 * Shape and field names are the north star's, unchanged (charter D2).
 */

/** The only format this build reads or writes. */
export const manifestFormat = 1;

export type ManifestRef = {
  readonly oid: string;
  /** The commit an annotated tag points at. Absent for a lightweight ref. */
  readonly peeled?: string;
};

export type ManifestPack = {
  /** Repository-relative, unique to the upload that created it (NI4). */
  readonly key: string;
  readonly bytes: number;
  /** Whether a `.idx` sits beside the pack, or hydration derives one. */
  readonly indexStored: boolean;
};

export type RetiredPack = { readonly key: string; readonly retiredAt: string };

/**
 * One commit's attribution (EQ11, L6-F12): who the server authenticated, which
 * device carried it, and the tip every ref it moved now holds. `tip` is absent
 * for a ref the commit removed, which only the audited verb does (D24).
 *
 * Appended by every successor, so it is the server's record of *who pushed
 * what* — the trustworthy half next to a commit's client-asserted author.
 */
export type PushRecord = {
  readonly generation: number;
  readonly committedAt: string;
  readonly committedBy: string;
  /** The host that pushed on the account's behalf; absent for the account's own push (W10). */
  readonly viaDevice?: string;
  /** The moved refs, at most {@link pushRecordRefLimit} of them, in name order. */
  readonly refs: ReadonlyArray<{ readonly ref: string; readonly tip?: string }>;
  /** How many more moved refs the record counts but does not list; absent when none. */
  readonly omitted?: number;
};

/**
 * The most refs one push record lists (EQ11). A push that moves more — a first
 * push of a project with hundreds of chats, a restore — lists the first ones
 * by name (branches and tags sort before chats) and counts the rest, so one
 * record stays a few kilobytes whatever the push was.
 */
export const pushRecordRefLimit = 64;

/**
 * The encoded bytes the push log may occupy (EQ11). The oldest records go
 * first, so every request's manifest read stays bounded however many refs
 * each push moved; at a typical record's ~200 bytes this is over a thousand
 * pushes.
 *
 * ponytail: a byte cap drops the oldest attribution; spill older records to
 * their own store objects if evidence ever needs further back.
 */
export const pushLogByteLimit = 256 * 1024;

/** Keeps the newest records whose encoded sizes fit in {@link pushLogByteLimit}. */
const boundedPushLog = (records: readonly PushRecord[]): PushRecord[] => {
  const kept: PushRecord[] = [];
  /* The array's brackets, then each record and its separator: the log's exact encoded length. */
  let bytes = 1;
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (record === undefined) {
      break;
    }
    bytes += JSON.stringify(record).length + 1;
    if (bytes > pushLogByteLimit) {
      break;
    }
    kept.push(record);
  }
  return kept.reverse();
};

/**
 * Where a pack's stored index lives: the same key with `.pack` replaced by
 * `.idx` (D33). One derivation, used by the writer, the reader and the sweep,
 * so an index is never orphaned from the pack it belongs to.
 */
export const indexKeyFor = (packKey: string): string => `${packKey.slice(0, -'.pack'.length)}.idx`;

/**
 * Written by conditional write before any byte is removed (NI12). It fences
 * in-flight writers and any creator of a new generation 1, so a project id
 * cannot be deleted and re-registered onto the same bytes.
 */
export type ManifestTombstone = { readonly tombstonedAt: string; readonly purgeAfter: string };

export type Manifest = {
  readonly format: typeof manifestFormat;
  /** Random per incarnation, so no two manifests are ever byte-identical (NI6). */
  readonly incarnation: string;
  readonly generation: number;
  readonly committedAt: string;
  /** The authenticated pusher, set by the server and never by a request body (NI16). */
  readonly committedBy: string;
  readonly refs: Readonly<Record<string, ManifestRef>>;
  readonly packs: readonly ManifestPack[];
  readonly retired: readonly RetiredPack[];
  /** Per-commit attribution, appended (EQ11). */
  readonly pushes: readonly PushRecord[];
  readonly encryption: 'none';
  /* oxlint-disable-next-line typescript/no-restricted-types -- `null` is the north star's manifest shape on the wire, not a Tau-internal optional */
  readonly tombstone: ManifestTombstone | null;
};

export type ManifestErrorCode = 'malformed' | 'unsupported-format' | 'generation-not-monotonic' | 'incarnation-changed';

/** Every refusal the codec raises, carrying the code a caller switches on. */
export class ManifestError extends Error {
  public constructor(
    public readonly code: ManifestErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ManifestError';
  }
}

const objectIdPattern = /^[\da-f]{40}$|^[\da-f]{64}$/u;
const refNamePattern = /^refs\/[\w.\-/]+$/u;
const packKeyPattern = /^packs\/[\w.-]+\.pack$/u;
const incarnationPattern = /^[\da-f]{32}$/u;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/*
 * Annotated rather than inferred so TypeScript narrows after a call: `refuse`
 * returns `never`, and the control-flow analysis that depends on it only fires
 * for an identifier with an explicit type.
 */
const refuse: (code: ManifestErrorCode, message: string) => never = (code, message) => {
  throw new ManifestError(code, message);
};

const readString = (source: Record<string, unknown>, field: string): string => {
  const value = source[field];
  if (typeof value !== 'string' || value === '') {
    refuse('malformed', `manifest field '${field}' must be a non-empty string`);
  }
  return value;
};

const readTimestamp = (source: Record<string, unknown>, field: string): string => {
  const value = readString(source, field);
  if (Number.isNaN(Date.parse(value))) {
    refuse('malformed', `manifest field '${field}' must be an ISO timestamp`);
  }
  return value;
};

const readReferences = (value: unknown): Record<string, ManifestRef> => {
  if (!isRecord(value)) {
    refuse('malformed', 'manifest field `refs` must be an object');
  }

  const references: Record<string, ManifestRef> = {};
  for (const [name, entry] of Object.entries(value)) {
    if (!refNamePattern.test(name) || name.includes('..')) {
      refuse('malformed', `manifest ref '${name}' is not a storable ref name`);
    }
    if (!isRecord(entry)) {
      refuse('malformed', `manifest ref '${name}' must be an object`);
    }
    const { oid, peeled } = entry as { oid?: unknown; peeled?: unknown };
    if (typeof oid !== 'string' || !objectIdPattern.test(oid)) {
      refuse('malformed', `manifest ref '${name}' has no object id`);
    }
    if (peeled !== undefined && (typeof peeled !== 'string' || !objectIdPattern.test(peeled))) {
      refuse('malformed', `manifest ref '${name}' has a peeled target that is not an object id`);
    }
    references[name] = peeled === undefined ? { oid } : { oid, peeled };
  }
  return references;
};

const readPacks = (value: unknown): ManifestPack[] => {
  if (!Array.isArray(value)) {
    refuse('malformed', 'manifest field `packs` must be an array');
  }

  return value.map((entry) => {
    if (!isRecord(entry)) {
      refuse('malformed', 'every entry of `packs` must be an object');
    }
    const { key, bytes, indexStored } = entry as { key?: unknown; bytes?: unknown; indexStored?: unknown };
    if (typeof key !== 'string' || !packKeyPattern.test(key) || key.includes('..')) {
      refuse('malformed', `pack key '${String(key)}' is not a storable pack key`);
    }
    if (typeof bytes !== 'number' || !Number.isInteger(bytes) || bytes < 0) {
      refuse('malformed', `pack '${String(key)}' has no byte size`);
    }
    if (typeof indexStored !== 'boolean') {
      refuse('malformed', `pack '${String(key)}' does not say whether its index is stored`);
    }
    return { key, bytes, indexStored };
  });
};

const readRetired = (value: unknown): RetiredPack[] => {
  if (!Array.isArray(value)) {
    refuse('malformed', 'manifest field `retired` must be an array');
  }

  return value.map((entry) => {
    if (!isRecord(entry)) {
      refuse('malformed', 'every entry of `retired` must be an object');
    }
    const key = readString(entry, 'key');
    if (!packKeyPattern.test(key) || key.includes('..')) {
      refuse('malformed', `retired key '${key}' is not a storable pack key`);
    }
    return { key, retiredAt: readTimestamp(entry, 'retiredAt') };
  });
};

const readPushes = (value: unknown): PushRecord[] => {
  if (!Array.isArray(value)) {
    refuse('malformed', 'manifest field `pushes` must be an array');
  }

  return value.map((entry) => {
    if (!isRecord(entry)) {
      refuse('malformed', 'every entry of `pushes` must be an object');
    }
    const { generation, viaDevice, refs } = entry as { generation?: unknown; viaDevice?: unknown; refs?: unknown };
    if (typeof generation !== 'number' || !Number.isInteger(generation) || generation < 1) {
      refuse('malformed', 'a push record has no generation');
    }
    if (viaDevice !== undefined && (typeof viaDevice !== 'string' || viaDevice === '')) {
      refuse('malformed', 'a push record names a device that is not a string');
    }
    if (!Array.isArray(refs)) {
      refuse('malformed', 'a push record has no ref list');
    }
    if (refs.length > pushRecordRefLimit) {
      refuse('malformed', 'a push record lists more refs than the limit');
    }
    const { omitted } = entry as { omitted?: unknown };
    if (omitted !== undefined && (typeof omitted !== 'number' || !Number.isInteger(omitted) || omitted < 1)) {
      refuse('malformed', 'a push record counts its omitted refs with something other than a positive integer');
    }
    const moved = refs.map((move: unknown) => {
      const { ref, tip } = (isRecord(move) ? move : {}) as { ref?: unknown; tip?: unknown };
      if (typeof ref !== 'string' || !refNamePattern.test(ref) || ref.includes('..')) {
        refuse('malformed', `a push record names '${String(ref)}', which is not a storable ref name`);
      }
      if (tip !== undefined && (typeof tip !== 'string' || !objectIdPattern.test(tip))) {
        refuse('malformed', `a push record gives ${ref} a tip that is not an object id`);
      }
      return tip === undefined ? { ref } : { ref, tip };
    });
    return {
      generation,
      committedAt: readTimestamp(entry, 'committedAt'),
      committedBy: readString(entry, 'committedBy'),
      ...(viaDevice === undefined ? {} : { viaDevice }),
      refs: moved,
      ...(omitted === undefined ? {} : { omitted }),
    };
  });
};

/* oxlint-disable-next-line typescript/no-restricted-types -- decodes the wire shape above */
const readTombstone = (value: unknown): ManifestTombstone | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (!isRecord(value)) {
    refuse('malformed', 'manifest field `tombstone` must be an object or null');
  }
  return {
    tombstonedAt: readTimestamp(value, 'tombstonedAt'),
    purgeAfter: readTimestamp(value, 'purgeAfter'),
  };
};

/** The bytes committed to the store. One line of JSON; nothing derives from its layout. */
export const encodeManifest = (manifest: Manifest): ManifestBytes =>
  new TextEncoder().encode(JSON.stringify(manifest)) as ManifestBytes;

/**
 * Parses and validates stored bytes. Every field is checked, because these
 * bytes decide which objects a lease fetches and which keys a sweep deletes:
 * a ref name or a pack key that traverses would reach outside the tenant.
 */
export const decodeManifest = (bytes: Uint8Array<ArrayBuffer>): Manifest => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch (error) {
    throw new ManifestError('malformed', `manifest is not JSON: ${String(error)}`);
  }

  if (!isRecord(parsed)) {
    refuse('malformed', 'manifest is not an object');
  }

  const source = parsed;
  if (source['format'] !== manifestFormat) {
    refuse('unsupported-format', `manifest format ${String(source['format'])} is not readable by this build`);
  }

  const incarnation = readString(source, 'incarnation');
  if (!incarnationPattern.test(incarnation)) {
    refuse('malformed', 'manifest field `incarnation` must be 32 hexadecimal characters');
  }

  const { generation } = source;
  if (typeof generation !== 'number' || !Number.isInteger(generation) || generation < 1) {
    refuse('malformed', 'manifest field `generation` must be a positive integer');
  }

  if (source['encryption'] !== 'none') {
    refuse('malformed', `manifest encryption '${String(source['encryption'])}' is not supported`);
  }

  return {
    format: manifestFormat,
    incarnation,
    generation,
    committedAt: readTimestamp(source, 'committedAt'),
    committedBy: readString(source, 'committedBy'),
    refs: readReferences(source['refs']),
    packs: readPacks(source['packs']),
    retired: readRetired(source['retired']),
    pushes: readPushes(source['pushes']),
    encryption: 'none',
    tombstone: readTombstone(source['tombstone']),
  };
};

/** A fresh incarnation nonce. Drawn at creation and at restore, never otherwise (NI6). */
export const newIncarnation = (): string => randomBytes(16).toString('hex');

export type ManifestDraft = {
  readonly refs: Readonly<Record<string, ManifestRef>>;
  readonly packs: readonly ManifestPack[];
  readonly retired: readonly RetiredPack[];
  readonly committedBy: string;
  /** The host that pushed on the account's behalf (W10); absent for the account's own push. */
  readonly viaDevice?: string;
  /** Set only by a restore, which rolls forward into a new incarnation (NI6, NI7). */
  readonly incarnation?: string;
  /* oxlint-disable-next-line typescript/no-restricted-types -- same wire shape */
  readonly tombstone?: ManifestTombstone | null;
};

/** Every ref whose object changed between two ref maps, with the tip it now holds. */
const movedTips = (before: Manifest['refs'], after: Manifest['refs']): PushRecord['refs'] =>
  [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((ref) => before[ref]?.oid !== after[ref]?.oid)
    .sort()
    .map((ref) => {
      const tip = after[ref]?.oid;
      return tip === undefined ? { ref } : { ref, tip };
    });

/**
 * The next manifest after `base`. `undefined` means the repository does not
 * exist yet: generation 1 with a fresh nonce.
 *
 * Every successor — a push, a removal, a restore, a tombstone — appends its
 * attribution record here, so no writer can forget to (EQ11).
 */
export const succeedManifest = (base: Manifest | undefined, draft: ManifestDraft, at: Date = new Date()): Manifest => {
  const generation = (base?.generation ?? 0) + 1;
  const committedAt = at.toISOString();
  const moved = movedTips(base?.refs ?? {}, draft.refs);
  const record: PushRecord = {
    generation,
    committedAt,
    committedBy: draft.committedBy,
    ...(draft.viaDevice === undefined ? {} : { viaDevice: draft.viaDevice }),
    refs: moved.slice(0, pushRecordRefLimit),
    ...(moved.length > pushRecordRefLimit ? { omitted: moved.length - pushRecordRefLimit } : {}),
  };
  return {
    format: manifestFormat,
    incarnation: draft.incarnation ?? base?.incarnation ?? newIncarnation(),
    generation,
    committedAt,
    committedBy: draft.committedBy,
    refs: draft.refs,
    packs: draft.packs,
    retired: draft.retired,
    pushes: boundedPushLog([...(base?.pushes ?? []), record]),
    encryption: 'none',
    tombstone: draft.tombstone ?? null,
  };
};

/** Generations never repeat, so an ETag never repeats within one incarnation (NI6). */
export const assertGenerationSucceeds = (base: Manifest, next: Manifest): void => {
  if (next.generation <= base.generation) {
    refuse(
      'generation-not-monotonic',
      `generation ${String(next.generation)} does not follow ${String(base.generation)}`,
    );
  }
};

/**
 * The ABA defence (AR-A E7, confirmed on R2 by W0b). A conditional write sees
 * only bytes: if a repository is purged and re-registered while a lease is
 * open, the new manifest can carry the same generation and the same refs, and
 * the stale holder's `If-Match` would succeed against identical bytes. The
 * nonce makes the two incarnations distinguishable, and this is where the
 * committer looks.
 */
export const assertSameIncarnation = (hydrated: Manifest, current: Manifest): void => {
  if (hydrated.incarnation !== current.incarnation) {
    refuse(
      'incarnation-changed',
      `the repository was re-created under incarnation ${current.incarnation} while this lease held ${hydrated.incarnation}`,
    );
  }
};

export const isTombstoned = (manifest: Manifest | undefined): boolean =>
  manifest !== undefined && manifest.tombstone !== null;

/**
 * The tombstone manifest (D10). The pack list is carried forward untouched so
 * the purge job knows what it is removing, and `purgeAfter` is the whole of
 * the deletion policy: one retention window, or immediately when the deletion
 * is a verified erasure request.
 */
export const tombstoneManifest = (
  base: Manifest,
  args: { committedBy: string; at: Date; erasureVerified?: boolean },
): Manifest =>
  succeedManifest(
    base,
    {
      refs: base.refs,
      packs: base.packs,
      retired: base.retired,
      committedBy: args.committedBy,
      tombstone: {
        tombstonedAt: args.at.toISOString(),
        purgeAfter: new Date(
          args.at.getTime() + (args.erasureVerified === true ? 0 : retentionWindowMilliseconds),
        ).toISOString(),
      },
    },
    args.at,
  );
