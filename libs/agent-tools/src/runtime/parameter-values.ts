/**
 * The agent's default `get_parameters` projection: one row per parameter of the active group, with
 * the manifest's provenance, bindings and duplicate schema views left to `detail: 'full'`.
 *
 * @module
 */

import type { ParameterValue } from '@taucad/chat/schemas/tools/parameter';
import { projectParameterField, resolveParameterBinding, valueAtPointer } from '@taucad/parameters';
import type { ParameterManifest } from '@taucad/parameters';
import type { FileParameterEntry, JSONValue } from '@taucad/types';

type JsonRecord = Readonly<Record<string, JSONValue>>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const escapePointerPart = (part: string): string => part.replaceAll('~', '~0').replaceAll('/', '~1');

/** Leaf instance pointers of a value object; arrays are one value, as the runtime merge treats them. */
const leafPointers = (value: JsonRecord, prefix = '', into = new Set<string>()): Set<string> => {
  for (const [key, child] of Object.entries(value)) {
    const pointer = `${prefix}/${escapePointerPart(key)}`;
    if (isRecord(child) && Object.keys(child).length > 0) {
      leafPointers(child, pointer, into);
    } else {
      into.add(pointer);
    }
  }
  return into;
};

/** The schema node for an instance pointer, following object `properties` from the root schema. */
const schemaNodeAt = (schema: unknown, pointer: string): JsonRecord | undefined => {
  let node: unknown = schema;
  for (const raw of pointer.split('/').slice(1)) {
    const part = raw.replaceAll('~1', '/').replaceAll('~0', '~');
    const properties: unknown = isRecord(node) ? node['properties'] : undefined;
    node = isRecord(properties) ? properties[part] : undefined;
  }
  return isRecord(node) ? node : undefined;
};

/**
 * Project the active group's parameters for an agent read.
 *
 * `value` is the stored value, else the default; `unit` is the effective unit the record's own
 * unit rule assigns, which also states the constraints. `default` is shown only while it is in
 * that unit, since a unit the person chose relabels the stored number but not the producer default.
 *
 * @param manifest - The admitted manifest the read was resolved from.
 * @param entry - The person's checked parameter record.
 * @returns Rows keyed by instance pointer, in pointer order.
 * @public
 */
export const projectParameterValues = (
  manifest: ParameterManifest,
  entry: FileParameterEntry,
): Readonly<Record<string, ParameterValue>> => {
  const group = entry.groups[entry.activeGroup];
  const stored: JsonRecord = group?.values ?? {};
  const defaults: JsonRecord = isRecord(manifest.defaults) ? manifest.defaults : {};
  const pointers = new Set([
    ...leafPointers(defaults),
    ...leafPointers(stored),
    ...Object.keys(manifest.bindings).filter((pointer) => pointer.startsWith('/') && !pointer.includes('*')),
  ]);
  const rows: Record<string, ParameterValue> = {};
  for (const pointer of [...pointers].sort()) {
    const field = projectParameterField(manifest, pointer, {}, group);
    const storedValue = valueAtPointer(stored, pointer);
    const defaultValue = valueAtPointer(defaults, pointer);
    const value = storedValue ?? defaultValue;
    const nativeUnit = resolveParameterBinding(manifest, pointer)?.unit;
    const unit = field.nativeUnit === '1' ? undefined : field.nativeUnit;
    const { default: _default, ...constraints } = field.constraints ?? {};
    const node = schemaNodeAt(manifest.schema, pointer);
    const choices = node?.['enum'];
    const description = node?.['description'];
    rows[pointer] = {
      ...(value === undefined ? {} : { value }),
      ...(defaultValue === undefined || (unit !== undefined && unit !== nativeUnit) ? {} : { default: defaultValue }),
      ...(unit === undefined ? {} : { unit }),
      ...(field.inferredFields?.includes('unit') === true ? { unitInferred: true } : {}),
      ...(Object.keys(constraints).length === 0 ? {} : { constraints: constraints as Record<string, JSONValue> }),
      ...(Array.isArray(choices) ? { enum: choices } : {}),
      ...(typeof description === 'string' ? { description } : {}),
    };
  }
  return rows;
};
