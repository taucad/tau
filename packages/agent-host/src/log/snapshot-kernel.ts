import type { JsonValue } from '#log/event-types.js';

const kernelLabel = /^[a-z][\da-z-]{0,63}$/u;

const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)[key]
    : undefined;

const label = (value: unknown): string | undefined =>
  typeof value === 'string' && kernelLabel.test(value) ? value : undefined;

/**
 * The kernel a run targets, as an observability label (LW17), read from the snapshot frozen with its turn (D2): the
 * chat's chosen kernel, or under `auto` the kernel bound to the project's main entry. An entry-less `auto` project, a
 * snapshot without a `kernel` object and a value that is not a kernel id name none.
 *
 * @param snapshot - The turn's snapshot, as the host committed it.
 * @returns The kernel id, or `undefined` when the snapshot names none.
 */
export const snapshotKernel = (snapshot: JsonValue | undefined): string | undefined => {
  const kernel = field(snapshot, 'kernel');
  const preference = label(field(kernel, 'preference'));
  return preference !== undefined && preference !== 'auto'
    ? preference
    : label(field(field(kernel, 'owner'), 'kernel'));
};
