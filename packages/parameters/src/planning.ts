import type { CheckedFileWrite, JSONValue } from '@taucad/types';
import { serializeParameterRecord, sameRecordBytes } from '#record.js';
import { validRequestShape } from '#request.js';
import { resolveParameterBinding } from '#manifest.js';
import { planParameterRecord, resolveEffectiveParameterBinding, valueAtPointer } from '#values.js';
import type { ParameterSnapshot } from '#snapshot.js';
import type { ParameterSetPlanResult, ParameterSetRequest } from '#types.js';

/** Pure checked-write proposal; persistence remains the caller's responsibility. @public */
export type ParameterChange =
  | Extract<ParameterSetPlanResult, { status: 'rejected' }>
  | Readonly<{ status: 'unchanged'; current: ParameterSnapshot }>
  | Readonly<{
      status: 'prepared';
      proposed: ParameterSnapshot;
      write: CheckedFileWrite;
      confirmation?: Extract<ParameterSetPlanResult, { status: 'confirmation-required' }>;
      /** Plan fingerprint the caller explicitly confirmed; required before committing a confirmation plan. */
      confirmed?: string;
    }>;

const sameBaseBinding = (base: NonNullable<ParameterSetRequest['base']>, current: ParameterSnapshot): boolean => {
  if (base.binding === undefined) {
    return true;
  }
  const native = resolveParameterBinding(current.manifest, base.pointer);
  if (native === undefined) {
    return false;
  }
  const effective = resolveEffectiveParameterBinding(
    current.manifest,
    base.pointer,
    native,
    current.entry.groups[current.entry.activeGroup],
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
 * Field-scoped conflict: an edit commits while its own field still holds the value the editor was
 * working from, under the binding it was working from. An edit of a different field, a group
 * operation or an agent write elsewhere in the record never blocks it.
 */
const conflictsWithBase = (request: ParameterSetRequest, current: ParameterSnapshot): boolean => {
  const { base, operation } = request;
  if (base === undefined || (operation.kind !== 'native-value' && operation.kind !== 'unit-value')) {
    return false;
  }
  const stored = valueAtPointer(current.entry.groups[operation.group]?.values ?? {}, base.pointer);
  // An untouched field is absent from the record and still reads as its manifest default; a stored
  // `null` is an explicit value, not an absence.
  const effective =
    stored === undefined
      ? valueAtPointer(current.manifest.defaults as Readonly<Record<string, JSONValue>>, base.pointer)
      : stored;
  return !Object.is(effective, base.value) || !sameBaseBinding(base, current);
};

/** Plan one atomic sidecar replacement without reading, writing or resolving producers. @public */
export const planParameterChange = (
  input: Readonly<{
    current: ParameterSnapshot;
    request: ParameterSetRequest;
  }>,
): ParameterChange => {
  if (!validRequestShape(input.request)) {
    return { status: 'rejected', code: 'INVALID_REQUEST', message: 'Invalid parameter request.' };
  }
  const { current, request } = input;
  if (conflictsWithBase(request, current)) {
    return {
      status: 'rejected',
      code: 'STALE_MANIFEST',
      message: 'The field changed since this edit began.',
    };
  }
  const result = planParameterRecord({ current, request });
  if (result.status === 'rejected') {
    return result;
  }
  const bytes = serializeParameterRecord(result.proposed.entry);
  // Equal bytes are the whole no-op proof: the record we would write is the record on disk.
  if (result.status === 'ready' && sameRecordBytes(bytes, current.bytes)) {
    return { status: 'unchanged', current };
  }
  return {
    status: 'prepared',
    // The manifest is deep-frozen at compile time and the planner mutates nothing it is given, so
    // only the bytes that become the checked write are copied.
    proposed: { ...current, ...result.proposed, bytes },
    write: {
      path: current.path,
      data: bytes,
      // The sidecar's own bytes are the entire concurrency proof; no source file is pinned.
      preconditions: [{ path: current.path, expected: current.bytes === null ? null : Uint8Array.from(current.bytes) }],
    },
    ...(result.status === 'confirmation-required' ? { confirmation: result } : {}),
  };
};
