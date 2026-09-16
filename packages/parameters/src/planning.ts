import { canonicalizeCacheValue, digestContent } from '@taucad/cache-core';
import type { CacheValue } from '@taucad/cache-core';
import type { CheckedFileWrite, JSONValue } from '@taucad/types';
import { currentFileParameterEntrySchema } from '@taucad/types';
import { serializeParameterRecord } from '#record.js';
import { validRequestShape } from '#request.js';
import { resolveParameterBinding } from '#manifest.js';
import { planParameterRecord, resolveEffectiveParameterBinding, valueAtPointer } from '#values.js';
import type { ParameterSnapshot } from '#snapshot.js';
import type { ParameterSetIdentity, ParameterSetPlanResult, ParameterSetRequest } from '#types.js';

/** Pure checked-write proposal; persistence remains the caller's responsibility. @public */
export type ParameterChange =
  | Extract<ParameterSetPlanResult, { status: 'rejected' }>
  | Readonly<{ status: 'unchanged'; current: ParameterSnapshot }>
  | Readonly<{
      status: 'prepared';
      fingerprint: string;
      proposed: ParameterSnapshot;
      write: CheckedFileWrite;
      confirmation?: Extract<ParameterSetPlanResult, { status: 'confirmation-required' }>;
      /** Plan fingerprint the caller explicitly confirmed; required before committing a confirmation plan. */
      confirmed?: string;
    }>;

const sameBaseBinding = (base: NonNullable<ParameterSetRequest['base']>, current: ParameterSnapshot): boolean => {
  if (base.binding === undefined) {
    return false;
  }
  const native = resolveParameterBinding(current.manifest, base.pointer);
  if (native === undefined) {
    return false;
  }
  const group = current.entry.groups[current.entry.activeGroup];
  const effective = resolveEffectiveParameterBinding(
    current.manifest,
    base.pointer,
    native,
    group?.bindings?.[base.pointer],
  );
  return (
    base.binding.unit === effective.unit &&
    base.binding.quantityKind === effective.quantityKind &&
    base.binding.space === effective.space &&
    base.binding.reference === effective.reference &&
    base.binding.representation === effective.representation
  );
};

/**
 * Accept a draft whose whole-record revision moved only because another field changed. The field
 * the request touches must still hold the value the editor was working from, under an unchanged
 * effective binding; source, manifest and dependency revisions are never rebased.
 */
const rebasedExpectation = (
  request: ParameterSetRequest,
  current: ParameterSnapshot,
): ParameterSetIdentity | undefined => {
  const { base, expected } = request;
  if (
    base === undefined ||
    expected.sourceRevision !== current.identity.sourceRevision ||
    expected.manifestRevision !== current.identity.manifestRevision ||
    expected.dependencyRevision !== current.identity.dependencyRevision ||
    expected.valueRevision === current.identity.valueRevision
  ) {
    return undefined;
  }
  const group = current.entry.groups[current.entry.activeGroup];
  const stored = valueAtPointer(group?.values ?? {}, base.pointer);
  // An untouched field is absent from the record and still reads as its manifest default.
  const effective =
    stored ?? valueAtPointer(current.manifest.defaults as Readonly<Record<string, JSONValue>>, base.pointer);
  return Object.is(effective, base.value) && sameBaseBinding(base, current) ? current.identity : undefined;
};

/** Plan one atomic sidecar replacement without reading, writing or resolving producers. @public */
export const planParameterChange = async (
  input: Readonly<{
    current: ParameterSnapshot;
    request: ParameterSetRequest;
  }>,
): Promise<ParameterChange> => {
  try {
    if (!validRequestShape(input.request)) {
      throw new Error('Invalid parameter request.');
    }
  } catch (error) {
    return {
      status: 'rejected',
      code: 'INVALID_REQUEST',
      message: error instanceof Error ? error.message : 'Invalid parameter request.',
    };
  }
  const { current } = input;
  const rebased = rebasedExpectation(input.request, current);
  if (rebased !== undefined) {
    input = { ...input, request: { ...input.request, expected: rebased } };
  }
  const fingerprint = await digestContent({
    bytes: new TextEncoder().encode(
      canonicalizeCacheValue({
        value: {
          target: current.target,
          expected: input.request.expected,
          operation: input.request.operation,
        } as unknown as CacheValue,
      }),
    ),
  });
  const receipt = current.entry.lastOperation;
  if (receipt?.requestId === input.request.requestId) {
    if (receipt.fingerprint !== fingerprint) {
      return {
        status: 'rejected',
        code: 'REQUEST_ID_COLLISION',
        message: 'Request ID was reused with different content.',
      };
    }
    if (
      receipt.sourceRevision === current.identity.sourceRevision &&
      receipt.manifestRevision === current.identity.manifestRevision &&
      receipt.valueRevision === current.identity.valueRevision &&
      receipt.dependencyRevision === current.identity.dependencyRevision
    ) {
      return { status: 'unchanged', current };
    }
    return {
      status: 'rejected',
      code: 'STALE_MANIFEST',
      message: 'The receipt belongs to an earlier parameter state.',
    };
  }
  const request = { ...input.request, fingerprint };
  const result = await planParameterRecord({ current, request });
  if (result.status === 'rejected') {
    return result;
  }
  if (result.status === 'ready' && result.proposed.identity.valueRevision === current.identity.valueRevision) {
    return { status: 'unchanged', current };
  }
  const bytes = serializeParameterRecord(currentFileParameterEntrySchema.parse(result.proposed.entry));
  return {
    status: 'prepared',
    fingerprint,
    // The manifest is deep-frozen at compile time and the planner mutates nothing it is given, so
    // only the bytes that become the checked write are copied.
    proposed: { ...current, ...result.proposed, bytes },
    write: {
      path: current.path,
      data: bytes,
      preconditions: [
        ...current.preconditions,
        { path: current.path, expected: current.bytes === null ? null : Uint8Array.from(current.bytes) },
      ],
    },
    ...(result.status === 'confirmation-required' ? { confirmation: result } : {}),
  };
};
