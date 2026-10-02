/**
 * The operation log (charter D15, policy rule 10): `refs/tau/ops/<device>`.
 *
 * Every settled head move this host makes is one JSON line appended to its
 * device's log. The ref has the chat segment's shape — an orphan chain whose
 * tree holds append-only `events/<device>.jsonl` segments, sealed at
 * {@link segmentEntryLimit} lines or {@link segmentByteLimit} bytes and
 * continued in `events/<device>.<n>.jsonl` — so it is a Records ref: pushed per
 * ref, and a refusal of it never blocks history (I8). The log is what *Undo*
 * walks.
 *
 * **Record devices (EQ10 (a)).** The `<device>` segment is not the host's device
 * id. It is a random id this host keeps per *actor form* — the person a revision
 * is attributed to, or their pseudonym — so a pushed record never lists an
 * account's revisions and a pseudonym's under one device. The ids live in
 * `.git/ops-devices.json`, which no tree records. Every pushed record name that
 * names a device uses {@link OpsLog.deviceFor}: the ops refs and the conflict
 * lines of D14 and the chat segments. A form whose device a remote refuses —
 * two hosts sharing one after a copied `.git` — gets a new one
 * ({@link OpsLog.retire}); the old id stays this host's own.
 */

import { randomUuid } from '@taucad/utils/id';

import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import type { CheckoutCutTrigger } from '#checkout.machine.js';
import type { RevisionActor, RevisionProvenance, RevisionUserActor } from '#revision-authority.js';
import type { RevisionFileSystem } from '#revision-effects.types.js';
import { RevisionPortError } from '#revision-port.js';
import type { RevisionPort } from '#revision-port.js';

/** The namespace every operation log lives in, as a `listRefs` prefix. @public */
export const opsRefPrefix = 'refs/tau/ops';

/**
 * One record device's operation log.
 *
 * @param device - A record device id from {@link OpsLog.deviceFor}.
 * @returns The fully-qualified ref.
 * @public
 */
export const opsRefName = (device: string): string => `${opsRefPrefix}/${device}`;

/* A sealed segment is never written again; the next line starts the next one. */
const segmentEntryLimit = 256;
const segmentByteLimit = 64 * 1024;

/* Segment `n` of one log: the chat segment's spelling, then numbered continuations. */
const opsSegmentPath = (device: string, index: number): string =>
  index === 0 ? `events/${device}.jsonl` : `events/${device}.${String(index)}.jsonl`;

/* A record device id has no `.`, so the index is the only dotted part. */
const segmentIndexOf = (device: string, path: string): number | undefined => {
  if (path === opsSegmentPath(device, 0)) {
    return 0;
  }
  const match = /^events\/([\da-f-]+)\.(\d+)\.jsonl$/u.exec(path);
  return match?.[1] === device ? Number(match[2]) : undefined;
};

const isSealed = (bytes: Uint8Array<ArrayBuffer>): boolean =>
  bytes.byteLength >= segmentByteLimit || bytes.filter((byte) => byte === 0x0a).length >= segmentEntryLimit;

/* Where this host keeps its record devices: a control-plane path, never versioned. */
const recordDevicesPath = '.git/ops-devices.json';

/* What a record device id must look like; anything else in the file is ignored and replaced. */
const recordDevicePattern = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/u;

/**
 * One settled operation, as its log line holds it.
 *
 * `kind` is the checkout cut that minted `to`, or `move` for a head move no cut
 * made: a sync apply, a resolution, a branch created, renamed or removed.
 *
 * @public
 */
export type OpsEntry = Readonly<{
  v: 1;
  /** The head that moved, in full: `refs/heads/<branch>`. */
  ref: string;
  /** Where it stood; absent when it was unborn. */
  from?: string;
  /** Where it stands; absent when it was removed. */
  to?: string;
  kind: CheckoutCutTrigger | 'move';
  /** The operation this one undid, when it is an *Undo* (or D2's *Undo restore*). */
  undoes?: string;
  /** The actor id the revision carries: the same form, never another. */
  actor: string;
  /** Milliseconds since the Unix epoch. */
  at: number;
}>;

/**
 * The person an actor form belongs to: an agent's is the person it works for.
 *
 * @param actor - A revision's actor, when the host resolved one.
 * @returns The person, or `undefined` for the host's own identity.
 */
const personOf = (actor: RevisionActor | undefined): RevisionUserActor | undefined =>
  actor?.kind === 'agent' ? actor.onBehalfOf : actor;

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

const isOpsEntry = (value: unknown): value is OpsEntry => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return (
    entry['v'] === 1 &&
    typeof entry['ref'] === 'string' &&
    (entry['from'] === undefined || typeof entry['from'] === 'string') &&
    (entry['to'] === undefined || typeof entry['to'] === 'string') &&
    typeof entry['kind'] === 'string' &&
    (entry['undoes'] === undefined || typeof entry['undoes'] === 'string') &&
    typeof entry['actor'] === 'string' &&
    typeof entry['at'] === 'number'
  );
};

/* Leniently: a line this reader does not understand is skipped, never fatal. */
const parseOps = (bytes: Uint8Array<ArrayBuffer> | undefined): readonly OpsEntry[] =>
  bytes === undefined
    ? []
    : textDecoder
        .decode(bytes)
        .split('\n')
        .flatMap((line) => {
          if (line === '') {
            return [];
          }
          try {
            const value: unknown = JSON.parse(line);
            return isOpsEntry(value) ? [value] : [];
          } catch {
            return [];
          }
        });

/* Every cut trigger but `merge` names an operation a person can undo; `move` never does. */
const undoableKinds: ReadonlySet<string> = new Set<CheckoutCutTrigger>([
  'turn',
  'save',
  'idle',
  'hidden',
  'close',
  'restore',
  'switch',
]);

/**
 * The operations *Undo* may reverse on one line, newest first (D15).
 *
 * An operation is a candidate when a cut made it, it is not itself an undo, no
 * later undo reversed it, and it is not `skip` — the cut the undo verb made of
 * the files as they were, which is the person's own work rather than the thing
 * they asked to undo. A `move` is never a candidate: its delta is someone else's
 * work arriving, and reversing it would revert another device by content.
 *
 * A `merge` this host made — a merge, a sync's auto-merge, a conflict decision —
 * cannot be undone and ends the walk: it is the last candidate, so the caller
 * refuses there rather than reaching past it into the history it composed.
 *
 * @param entries - One record device's log, oldest first.
 * @param ref - The line, in full: `refs/heads/<branch>`.
 * @param skip - A revision to pass over, when one.
 * @returns The candidates, newest first, ending at the newest `merge` when one.
 * @public
 */
export const undoCandidates = (entries: readonly OpsEntry[], ref: string, skip?: string): readonly OpsEntry[] => {
  const undone = new Set(entries.flatMap((entry) => (entry.undoes === undefined ? [] : [entry.undoes])));
  const candidates: OpsEntry[] = [];
  for (const entry of entries.toReversed()) {
    if (entry.ref !== ref || entry.to === undefined) {
      continue;
    }
    if (entry.kind === 'merge') {
      candidates.push(entry);
      break;
    }
    if (undoableKinds.has(entry.kind) && entry.undoes === undefined && entry.to !== skip && !undone.has(entry.to)) {
      candidates.push(entry);
    }
  }
  return candidates;
};

/** The operation log and record devices of one project, on one host. @public */
export type OpsLog = Readonly<{
  /**
   * The record device for an actor's form, minted the first time it is asked.
   *
   * @param actor - Who the record is by.
   * @returns A random id, stable for that form on this host.
   */
  deviceFor: (actor: RevisionActor | undefined) => Promise<string>;
  /**
   * Every record device this host holds or has retired, for telling its own
   * records from others'. Answers after every append already started has
   * landed, so a caller that lists `refs/tau/ops` next sees each log those
   * appends wrote.
   */
  ownDevices: () => Promise<ReadonlySet<string>>;
  /** The record devices this host writes under now: the logs it offers. */
  currentDevices: () => Promise<ReadonlySet<string>>;
  /**
   * Give a device's form a new record device, carrying its log over, after a
   * remote refused the log as a rewrite: two hosts share the device (a copied
   * `.git`), and neither log can ever fast-forward the other's.
   *
   * @param device - The refused device.
   * @returns The new device, or `undefined` when `device` is not a current one.
   */
  retire: (device: string) => Promise<string | undefined>;
  /**
   * Append one operation to its form's log, in order with every other append.
   *
   * @param actor - Who the operation is by; chooses the log.
   * @param entry - The line.
   */
  append: (actor: RevisionActor | undefined, entry: OpsEntry) => Promise<void>;
  /**
   * One form's log, oldest first.
   *
   * @param actor - Whose log.
   * @returns Its entries; empty when there is none.
   */
  read: (actor: RevisionActor | undefined) => Promise<readonly OpsEntry[]>;
}>;

/* What `.git/ops-devices.json` holds: each form's current device, and the retired ones. */
type RecordDevices = {
  readonly current: Map<string, string>;
  readonly retired: Set<string>;
};

/**
 * Build one project's operation log over its store and its records filesystem.
 *
 * @param dependencies - The store (unwrapped: an ops ref is not a head), the
 *   records filesystem `.git/` lives in, and the host's clock.
 * @returns Its appender, readers and record-device helper.
 * @public
 */
export const createOpsLog = (
  dependencies: Readonly<{
    port: RevisionPort;
    recordsFileSystem: () => Promise<RevisionFileSystem>;
    now: () => number;
    /** The id a revision with no resolved actor is committed under. */
    actorId: string;
  }>,
): OpsLog => {
  const { port, recordsFileSystem, now } = dependencies;
  let devices: Promise<RecordDevices> | undefined;

  /* Only a missing file is an empty one: a file this host cannot read or parse
   * is refused, never replaced — replacing it would orphan every log it names. */
  const readDevices = async (): Promise<RecordDevices> => {
    const records = await recordsFileSystem();
    if (!(await records.exists(recordDevicesPath))) {
      return { current: new Map(), retired: new Set() };
    }
    const stored: unknown = JSON.parse(await records.readFile(recordDevicesPath, 'utf8'));
    const field = (name: string): unknown =>
      typeof stored === 'object' && stored !== null ? Reflect.get(stored, name) : undefined;
    const current = field('devices');
    const retired = field('retired');
    const entries: ReadonlyArray<readonly [string, unknown]> =
      typeof current === 'object' && current !== null ? Object.entries(current) : [];
    return {
      current: new Map(
        entries.flatMap(([form, id]) =>
          typeof id === 'string' && recordDevicePattern.test(id) ? [[form, id] as const] : [],
        ),
      ),
      retired: new Set(
        Array.isArray(retired)
          ? retired.filter((id): id is string => typeof id === 'string' && recordDevicePattern.test(id))
          : [],
      ),
    };
  };

  /* Atomic where the filesystem renames over a file, as the sync queue writes (review 2 R5). */
  const writeDevices = async (known: RecordDevices): Promise<void> => {
    const records = await recordsFileSystem();
    const body = `${JSON.stringify(
      { version: 1, devices: Object.fromEntries(known.current), retired: [...known.retired] },
      undefined,
      2,
    )}\n`;
    try {
      await records.writeFile(`${recordDevicesPath}.writing`, body);
      await records.rename(`${recordDevicesPath}.writing`, recordDevicesPath);
    } catch {
      await records.writeFile(recordDevicesPath, body);
    }
  };

  /* One writer for the device file and the logs alike: two forms minting at once
   * must not both write the file, and two appends must not race one ref's CAS. */
  let chain: Promise<void> = Promise.resolve();
  const serialized = async <Result>(run: () => Promise<Result>): Promise<Result> => {
    const previous = chain;
    const turn = Promise.withResolvers<void>();
    chain = turn.promise;
    try {
      await previous;
      return await run();
    } finally {
      turn.resolve();
    }
  };

  const knownDevices = async (): Promise<RecordDevices> => {
    devices ??= readDevices();
    try {
      return await devices;
    } catch (error) {
      devices = undefined;
      throw error;
    }
  };

  /* Inside the chain: another process of this host may have written the file
   * since this one cached it, and its devices are this host's too. */
  const freshDevices = async (): Promise<RecordDevices> => {
    const [held, stored] = await Promise.all([knownDevices(), readDevices()]);
    for (const [form, id] of stored.current) {
      held.current.set(form, id);
    }
    for (const id of stored.retired) {
      held.retired.add(id);
    }
    return held;
  };

  const formOf = (actor: RevisionActor | undefined): string => personOf(actor)?.id ?? 'host';

  const existingDevice = async (actor: RevisionActor | undefined): Promise<string | undefined> => {
    const known = await knownDevices();
    return known.current.get(formOf(actor));
  };

  const mintDevice = async (actor: RevisionActor | undefined): Promise<string> => {
    const form = formOf(actor);
    const cache = await knownDevices();
    const cached = cache.current.get(form);
    if (cached !== undefined) {
      return cached;
    }
    const known = await freshDevices();
    const held = known.current.get(form);
    if (held !== undefined) {
      return held;
    }
    const minted = randomUuid();
    known.current.set(form, minted);
    await writeDevices(known);
    return minted;
  };

  /* Every segment of one log, in order. */
  const segmentsOf = (device: string, tree: ImmutableRevisionTree | undefined): Map<number, Uint8Array<ArrayBuffer>> =>
    new Map(
      (tree?.entries() ?? [])
        .flatMap((file) => {
          const index = segmentIndexOf(device, file.path);
          return index === undefined ? [] : [[index, file.content] as const];
        })
        .toSorted(([left], [right]) => left - right),
    );

  const readLog = async (device: string): Promise<readonly OpsEntry[]> => {
    const head = await port.readRef(opsRefName(device));
    if (head === undefined) {
      return [];
    }
    const tree = await port.readTree(head);
    return [...segmentsOf(device, tree).values()].flatMap((bytes) => parseOps(bytes));
  };

  const appendOnce = async (
    device: string,
    person: RevisionUserActor | undefined,
    lines: readonly string[],
  ): Promise<boolean> => {
    const ref = opsRefName(device);
    const head = await port.readRef(ref);
    const tree = head === undefined ? undefined : await port.readTree(head);
    const segments = segmentsOf(device, tree);
    for (const line of lines) {
      const last = Math.max(0, ...segments.keys());
      const previous = segments.get(last);
      const index = previous !== undefined && isSealed(previous) ? last + 1 : last;
      const before = segments.get(index);
      const added = textEncoder.encode(line);
      const bytes = new Uint8Array(new ArrayBuffer((before?.byteLength ?? 0) + added.byteLength));
      if (before !== undefined) {
        bytes.set(before);
      }
      bytes.set(added, before?.byteLength ?? 0);
      segments.set(index, bytes);
    }
    const provenance: RevisionProvenance = Object.freeze({
      source: 'user',
      actorId: person?.id ?? dependencies.actorId,
      ...(person === undefined ? {} : { actor: person }),
      createdAt: now(),
    });
    /* ponytail: the port takes whole trees, so each append reads and re-hashes
     * every sealed segment — O(whole log) per append — while the new objects it
     * writes stay bounded by one 64 KiB segment. Upgrade path: a port write that
     * reuses an unchanged blob's id. */
    const receipt = await port.writeRevision({
      parents: head === undefined ? [] : [head],
      tree: new ImmutableRevisionTree(
        [...segments].map(([index, bytes]) => [opsSegmentPath(device, index), bytes] as const),
      ),
      largeObjects: false,
      provenance,
      summary: { generated: 'Operation log' },
    });
    const published = await port.updateRef({ name: ref, expectedHead: head, head: revisionId(receipt.commitId) });
    return published.status === 'updated';
  };

  /* This host is the log's only writer, so a lost CAS is another process of the
   * same host between one read and one write: read again, once. */
  const appendLines = async (
    device: string,
    person: RevisionUserActor | undefined,
    lines: readonly string[],
  ): Promise<void> => {
    if (!(await appendOnce(device, person, lines)) && !(await appendOnce(device, person, lines))) {
      throw new RevisionPortError('ENGINE_FAILED', 'The operation log moved twice while it was being written.');
    }
  };

  return Object.freeze({
    deviceFor: async (actor) => (await existingDevice(actor)) ?? serialized(async () => mintDevice(actor)),
    ownDevices: async () =>
      serialized(async () => {
        const known = await knownDevices();
        return new Set([...known.current.values(), ...known.retired]);
      }),
    currentDevices: async () =>
      serialized(async () => {
        const known = await knownDevices();
        return new Set(known.current.values());
      }),
    retire: async (device) =>
      serialized(async () => {
        const known = await freshDevices();
        const form = [...known.current].find(([, id]) => id === device)?.[0];
        if (form === undefined) {
          return undefined;
        }
        const [entries, head] = await Promise.all([readLog(device), port.readRef(opsRefName(device))]);
        const successor = randomUuid();
        if (entries.length > 0) {
          /* The carried log is committed by the same form, as every append to it was. */
          const previous = head === undefined ? undefined : await port.readRevision(head);
          await appendLines(
            successor,
            personOf(previous?.provenance.actor),
            entries.map((entry) => `${JSON.stringify(entry)}\n`),
          );
        }
        known.current.set(form, successor);
        known.retired.add(device);
        await writeDevices(known);
        return successor;
      }),
    append: async (actor, entry) =>
      serialized(async () => {
        const device = await mintDevice(actor);
        await appendLines(device, personOf(actor), [`${JSON.stringify(entry)}\n`]);
      }),
    /* Reads queue behind every append already started, so a reader never misses
     * an operation whose head move it has heard of (I5) although the save path
     * does not wait for the log commit (B1). */
    read: async (actor) =>
      serialized(async () => {
        const device = await existingDevice(actor);
        return device === undefined ? [] : readLog(device);
      }),
  });
};
