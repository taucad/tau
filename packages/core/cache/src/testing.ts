import { actionDigest, contentDigest, digestContent } from '#digest.js';
import type { ActionStore, ComputeActionRecord, ContentStore } from '#store.js';
import type { CacheCodec } from '#types.js';

const assert = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(`Cache store conformance failed: ${message}`);
  }
};

const equalBytes = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): boolean =>
  left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);

/** Inputs for the framework-neutral content store conformance suite. @public */
export type ContentStoreConformanceInput = {
  readonly createStore: () => ContentStore | Promise<ContentStore>;
};

/** Inputs for the framework-neutral action store conformance suite. @public */
export type ActionStoreConformanceInput = {
  readonly createStore: () => ActionStore | Promise<ActionStore>;
};

/** One content/action store pair already scoped by its host authority. @public */
export type OwnerScopedComputeStores = {
  readonly contentStore: ContentStore;
  readonly actionStore: ActionStore;
};

/** Inputs for the shared owner-scoped store conformance suite. @public */
export type OwnerScopedStoreConformanceInput = {
  readonly createStores: () =>
    | {
        readonly primary: OwnerScopedComputeStores;
        readonly sameOwner: OwnerScopedComputeStores;
        readonly otherOwner: OwnerScopedComputeStores;
      }
    | Promise<{
        readonly primary: OwnerScopedComputeStores;
        readonly sameOwner: OwnerScopedComputeStores;
        readonly otherOwner: OwnerScopedComputeStores;
      }>;
};

/** Inputs for the framework-neutral codec conformance suite. @public */
export type CacheCodecConformanceInput<T> = {
  readonly codec: CacheCodec<T>;
  readonly samples: readonly T[];
  readonly equal: (input: { readonly actual: T; readonly expected: T }) => boolean;
};

/**
 * Verify stable encoding and round-trip decoding for a cache codec.
 * @param input - Codec, representative values, and their semantic equality predicate.
 * @returns A promise that rejects on the first conformance violation.
 * @public
 */
export const runCacheCodecConformance = async <T>(input: CacheCodecConformanceInput<T>): Promise<void> => {
  assert(input.codec.id.length > 0, 'a codec id must not be empty');
  assert(input.codec.version.length > 0, 'a codec version must not be empty');
  assert(input.codec.mediaType.length > 0, 'a codec media type must not be empty');
  for (const sample of input.samples) {
    const { signal } = new AbortController();
    // oxlint-disable-next-line no-await-in-loop -- sample checks are intentionally isolated
    const first = new Uint8Array(await input.codec.encode({ value: sample, signal }));
    // oxlint-disable-next-line no-await-in-loop -- determinism requires a second encoding
    const second = new Uint8Array(await input.codec.encode({ value: sample, signal }));
    assert(equalBytes(first, second), 'encoding the same value twice must produce identical bytes');
    // oxlint-disable-next-line no-await-in-loop -- each encoded sample must round trip
    const decoded = await input.codec.decode({ bytes: new Uint8Array(first), signal });
    assert(input.equal({ actual: decoded, expected: sample }), 'decoded content must equal its source');
  }
};

/**
 * Verify isolation, idempotency, and maintenance behavior of a content store adapter.
 * @param input - Factory for an empty adapter instance.
 * @returns A promise that rejects on the first conformance violation.
 * @public
 */
export const runContentStoreConformance = async (input: ContentStoreConformanceInput): Promise<void> => {
  const store = await input.createStore();
  const original = new Uint8Array([11, 22, 33]);
  const expected = new Uint8Array(original);
  const digest = await digestContent({ bytes: original });
  const initialRead = await store.read({ digest });
  assert(initialRead.status === 'miss', 'a fresh content store must miss');
  const initialWrite = await store.write({ digest, bytes: original });
  assert(initialWrite.status === 'stored', 'the first write must store');
  original[0] = 99;
  const firstRead = await store.read({ digest });
  assert(firstRead.status === 'hit', 'stored content must be readable');
  if (firstRead.status !== 'hit') {
    return;
  }
  assert(equalBytes(firstRead.bytes, expected), 'content writes must be defensively copied');
  firstRead.bytes[1] = 99;
  const secondRead = await store.read({ digest });
  assert(secondRead.status === 'hit', 'content must survive caller mutation');
  if (secondRead.status !== 'hit') {
    return;
  }
  assert(equalBytes(secondRead.bytes, expected), 'content reads must be defensively copied');
  const duplicate = await store.write({ digest, bytes: expected });
  assert(duplicate.status === 'existing', 'writes must be idempotent');

  if (store.maintenance.status === 'supported') {
    const cleared = await store.maintenance.clear({});
    const clearStatus: unknown = cleared.status;
    assert(clearStatus === 'cleared', 'maintenance must clear');
    const afterClear = await store.read({ digest });
    assert(afterClear.status === 'miss', 'cleared content must miss');
  } else {
    const unsupported = await store.maintenance.clear({});
    const clearStatus: unknown = unsupported.status;
    assert(clearStatus === 'unsupported', 'unsupported must be explicit');
  }
};

/**
 * Verify isolation, idempotency, conflict, and maintenance behavior of an action store adapter.
 * @param input - Factory for an empty adapter instance.
 * @returns A promise that rejects on the first conformance violation.
 * @public
 */
export const runActionStoreConformance = async (input: ActionStoreConformanceInput): Promise<void> => {
  const store = await input.createStore();
  const key = actionDigest({ value: `sha256:${'1'.repeat(64)}` });
  const output = contentDigest({ value: `sha256:${'2'.repeat(64)}` });
  const record: ComputeActionRecord = {
    schemaVersion: 1,
    actionDigest: key,
    codec: { id: 'conformance', version: '1' },
    output: { digest: output, size: 3, mediaType: 'application/octet-stream' },
    dependencies: [],
  };
  const initialRead = await store.read({ digest: key });
  assert(initialRead.status === 'miss', 'a fresh action store must miss');
  const initialPublication = await store.publish({ record });
  assert(initialPublication.status === 'published', 'the first record must publish');
  (record.output as { mediaType: string }).mediaType = 'mutated';
  const firstRead = await store.read({ digest: key });
  assert(firstRead.status === 'hit', 'a published action must be readable');
  if (firstRead.status !== 'hit') {
    return;
  }
  assert(firstRead.record.output.mediaType === 'application/octet-stream', 'writes must be copied');
  (firstRead.record.output as { mediaType: string }).mediaType = 'mutated-again';
  const secondRead = await store.read({ digest: key });
  assert(secondRead.status === 'hit', 'an action must survive caller mutation');
  if (secondRead.status !== 'hit') {
    return;
  }
  assert(secondRead.record.output.mediaType === 'application/octet-stream', 'reads must be copied');
  const duplicate = await store.publish({ record: secondRead.record });
  assert(duplicate.status === 'existing', 'publish must be idempotent');
  let conflictRejected = false;
  try {
    await store.publish({ record: { ...secondRead.record, output: { ...secondRead.record.output, size: 4 } } });
  } catch {
    conflictRejected = true;
  }
  assert(conflictRejected, 'a conflicting action publication must reject');

  if (store.maintenance.status === 'supported') {
    const cleared = await store.maintenance.clear({});
    const clearStatus: unknown = cleared.status;
    assert(clearStatus === 'cleared', 'maintenance must clear');
    const afterClear = await store.read({ digest: key });
    assert(afterClear.status === 'miss', 'cleared actions must miss');
  } else {
    const unsupported = await store.maintenance.clear({});
    const clearStatus: unknown = unsupported.status;
    assert(clearStatus === 'unsupported', 'unsupported must be explicit');
  }
};

/**
 * Verify transactional publication, idempotency, defensive reads, and authority
 * isolation for project, host, and remote store adapters.
 *
 * Each supplied pair is already scoped by the adapter's authority mechanism.
 * The suite deliberately uses no owner identifier so credentials and project
 * locations cannot leak into cache-core action identity.
 * @param input - Factories for two views of one owner and one foreign owner.
 * @returns A promise that rejects on the first conformance violation.
 * @public
 */
export const runOwnerScopedStoreConformance = async (input: OwnerScopedStoreConformanceInput): Promise<void> => {
  const { primary, sameOwner, otherOwner } = await input.createStores();
  const bytes = new Uint8Array([41, 42, 43]);
  const digest = await digestContent({ bytes });
  const key = actionDigest({ value: `sha256:${'3'.repeat(64)}` });
  const record: ComputeActionRecord = {
    schemaVersion: 1,
    actionDigest: key,
    codec: { id: 'owner-conformance', version: '1' },
    output: { digest, size: bytes.byteLength, mediaType: 'application/octet-stream' },
    dependencies: [],
  };

  const initialContent = await primary.contentStore.read({ digest });
  const initialAction = await primary.actionStore.read({ digest: key });
  assert(initialContent.status === 'miss', 'a fresh owner must miss content');
  assert(initialAction.status === 'miss', 'a fresh owner must miss actions');

  let missingOutputRejected = false;
  try {
    await primary.actionStore.publish({ record });
  } catch {
    missingOutputRejected = true;
  }
  assert(missingOutputRejected, 'an action must not publish before its owner can read the output content');

  const contentPublications = await Promise.all([
    primary.contentStore.write({ digest, bytes }),
    sameOwner.contentStore.write({ digest, bytes: new Uint8Array(bytes) }),
  ]);
  assert(
    contentPublications.every((publication) => publication.status !== 'rejected'),
    'concurrent identical owner writes must succeed idempotently',
  );
  const duplicateContent = await primary.contentStore.write({ digest, bytes: new Uint8Array(bytes) });
  assert(duplicateContent.status !== 'rejected', 'a repeated content write must remain idempotent');

  let digestMismatchRejected = false;
  try {
    await primary.contentStore.write({ digest, bytes: new Uint8Array([99]) });
  } catch {
    digestMismatchRejected = true;
  }
  assert(digestMismatchRejected, 'content bytes must match their declared digest');

  const primaryContent = await primary.contentStore.read({ digest });
  assert(primaryContent.status === 'hit', 'published content must be readable by its owner');
  if (primaryContent.status === 'hit') {
    primaryContent.bytes[0] = 99;
  }
  const sameOwnerContent = await sameOwner.contentStore.read({ digest });
  assert(sameOwnerContent.status === 'hit', 'another view of the same owner must share content');
  if (sameOwnerContent.status === 'hit') {
    assert(equalBytes(sameOwnerContent.bytes, bytes), 'content reads must not expose shared mutable bytes');
  }
  const unauthorizedContent = await otherOwner.contentStore.read({ digest });
  assert(unauthorizedContent.status === 'miss', 'digest knowledge must not authorize a foreign owner content read');

  const actionPublications = await Promise.all([
    primary.actionStore.publish({ record }),
    sameOwner.actionStore.publish({ record }),
  ]);
  assert(
    actionPublications.every((publication) => publication.status !== 'rejected'),
    'concurrent identical owner actions must publish idempotently',
  );
  const duplicateAction = await primary.actionStore.publish({ record });
  assert(duplicateAction.status !== 'rejected', 'a repeated action publication must remain idempotent');

  const sameOwnerAction = await sameOwner.actionStore.read({ digest: key });
  assert(sameOwnerAction.status === 'hit', 'another view of the same owner must share action records');
  if (sameOwnerAction.status === 'hit') {
    (sameOwnerAction.record.output as { mediaType: string }).mediaType = 'mutated';
  }
  const primaryAction = await primary.actionStore.read({ digest: key });
  assert(primaryAction.status === 'hit', 'published actions must survive caller mutation');
  if (primaryAction.status === 'hit') {
    assert(
      primaryAction.record.output.mediaType === 'application/octet-stream',
      'action reads must not expose shared mutable records',
    );
  }
  const unauthorizedAction = await otherOwner.actionStore.read({ digest: key });
  assert(unauthorizedAction.status === 'miss', 'digest knowledge must not authorize a foreign owner action read');

  const foreignContent = await otherOwner.contentStore.write({ digest, bytes: new Uint8Array(bytes) });
  assert(foreignContent.status !== 'rejected', 'a foreign owner may independently own identical content');
  const foreignAction = await otherOwner.actionStore.publish({ record });
  assert(foreignAction.status !== 'rejected', 'an owner may publish only after independently owning the content');
  const authorizedForeignAction = await otherOwner.actionStore.read({ digest: key });
  assert(authorizedForeignAction.status === 'hit', 'a newly authorized owner must read its own action');
};
