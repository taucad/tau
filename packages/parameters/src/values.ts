import type { ParameterSetRequest, ParameterSetPlanResult } from '#types.js';
import type { ParameterSnapshot } from '#snapshot.js';
import { snapshotFor } from '#snapshot.js';
import { groupOperationRejection, validRequestShape } from '#request.js';
import { canonicalizeCacheValue } from '@taucad/cache-core';
import type { CacheValue } from '@taucad/cache-core';
import { fileParameterEntrySchema } from '@taucad/types';
import type { FileParameterEntry, JSONValue, ParameterGroup } from '@taucad/types';
import { parseInput } from '@taucad/units/input';
import { convert, createQuantity } from '@taucad/units/quantity';
import {
  admitParameterValues,
  resolveParameterBinding,
  resolveParameterBindingPointer,
  rootResource,
} from '#manifest.js';
import type { ParameterBinding, ParameterManifest, ParameterProvenance } from '#manifest.js';

const failure = (code: string, message: string, applicationState?: string): Error =>
  Object.assign(new Error(message), { code, applicationState });

const escapePointer = (value: string): string => value.replaceAll('~', '~0').replaceAll('/', '~1');

/**
 * The unit a person authored for one field, and whether its producer sanctioned the change. A
 * sanctioned claim may override the producer's own declared unit because the producer converts the
 * stored value back; an unsanctioned one may only refine a unit the manifest inferred or omitted.
 */
const chosenUnitFor = (
  group: ParameterGroup | undefined,
  pointer: string,
): Readonly<{ unit: string; sanctioned: boolean }> | undefined => {
  const unit = group?.units?.[pointer];
  return unit === undefined ? undefined : { unit, sanctioned: group?.sourceUnits?.[pointer] !== undefined };
};

/** Resolve the provenance for one field of the effective parameter binding. @public */
// oxlint-disable-next-line max-params -- Provenance lookup needs the admitted manifest, pointer, binding, and one field.
export const resolveEffectiveParameterProvenance = (
  manifest: ParameterManifest,
  pointer: string,
  binding: ParameterBinding,
  field: 'unit' | 'quantityKind' | 'space' | 'reference',
  group?: ParameterGroup,
): Omit<ParameterProvenance, 'field'> | undefined => {
  // A unit in the record is the whole "the person chose this" bit; nothing else is ever authored.
  if (field === 'unit' && appliedUnit(manifest, pointer, binding, group) !== undefined) {
    return {
      origin: 'project',
      producer: manifest.source.id,
      sourceRevision: manifest.source.revision,
      evidence: `unit:${pointer}`,
    };
  }
  const bindingPointer = resolveParameterBindingPointer(manifest, pointer) ?? pointer;
  const declared = manifest.bindingDeclarations[bindingPointer]?.provenance?.[field];
  if (declared !== undefined) {
    return declared;
  }
  const claim = `${binding.schema.resource}#${binding.schema.pointer}/@binding/${escapePointer(bindingPointer)}/@${field}`;
  const schemaUnit = `${binding.schema.resource}#${binding.schema.pointer}/ucumUnit`;
  const found = manifest.provenance[claim] ?? (field === 'unit' ? manifest.provenance[schemaUnit] : undefined);
  return found === undefined
    ? undefined
    : {
        origin: found.origin,
        producer: found.producer,
        sourceRevision: found.sourceRevision,
        ...(found.profile === undefined ? {} : { profile: found.profile }),
        ...(found.rule === undefined ? {} : { rule: found.rule }),
        ...(found.evidence === undefined ? {} : { evidence: found.evidence }),
      };
};

/** Whether the manifest states this field's unit itself rather than guessing at it. */
const manifestDeclaresUnit = (manifest: ParameterManifest, pointer: string, binding: ParameterBinding): boolean => {
  if (binding.unit === undefined) {
    return false;
  }
  const origin = resolveEffectiveParameterProvenance(manifest, pointer, binding, 'unit')?.origin;
  return origin !== undefined && origin !== 'inferred';
};

/** The chosen unit once precedence has been applied, or `undefined` when the manifest keeps its own. */
// oxlint-disable-next-line max-params -- Unit precedence needs the manifest, pointer, binding and group.
const appliedUnit = (
  manifest: ParameterManifest,
  pointer: string,
  binding: ParameterBinding,
  group?: ParameterGroup,
): string | undefined => {
  const chosen = chosenUnitFor(group, pointer);
  if (chosen === undefined || chosen.unit === binding.unit) {
    return undefined;
  }
  return chosen.sanctioned || !manifestDeclaresUnit(manifest, pointer, binding) ? chosen.unit : undefined;
};

/**
 * Refuse a stored unit the producer's own declaration contradicts. A source-unit change is exempt:
 * the producer advertised the capability and converts the stored value back itself.
 * @param manifest - Effective admitted parameter manifest.
 * @param group - The group whose authored claims are being admitted.
 * @throws A `METADATA_CONFLICT` failure naming the first contradicted field.
 */
const admitGroupClaims = (manifest: ParameterManifest, group: ParameterGroup): void => {
  for (const [pointer, unit] of Object.entries(group.units ?? {})) {
    const binding = resolveParameterBinding(manifest, pointer);
    if (binding === undefined || unit === binding.unit || group.sourceUnits?.[pointer] !== undefined) {
      continue;
    }
    if (manifestDeclaresUnit(manifest, pointer, binding)) {
      throw failure(
        'METADATA_CONFLICT',
        `Project unit for ${pointer} conflicts with the explicit parameter declaration.`,
        'known-not-applied',
      );
    }
  }
};

const pointerParts = (pointer: string): string[] | undefined => {
  if (!pointer.startsWith('/')) {
    return undefined;
  }
  const parts = pointer.slice(1).split('/');
  if (parts.some((part) => /~(?![01])/u.test(part))) {
    return undefined;
  }
  return parts.map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'));
};

const arrayIndex = (part: string, length: number): number | undefined => {
  if (!/^(?:0|[1-9]\d*)$/u.test(part)) {
    return undefined;
  }
  const index = Number(part);
  return Number.isSafeInteger(index) && index < length ? index : undefined;
};

/** Read one RFC 6901 pointer out of a group's values; `undefined` when the pointer is absent. @public */
export const valueAtPointer = (root: Readonly<Record<string, JSONValue>>, pointer: string): JSONValue | undefined => {
  const parts = pointerParts(pointer);
  if (parts === undefined || parts.length === 0) {
    return undefined;
  }
  let current: JSONValue | undefined = root;
  for (const part of parts) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }
    if (Array.isArray(current)) {
      const index = arrayIndex(part, current.length);
      if (index === undefined || !Object.hasOwn(current, index)) {
        return undefined;
      }
      current = current[index];
    } else {
      if (!Object.hasOwn(current, part)) {
        return undefined;
      }
      current = current[part];
    }
    if (current === undefined) {
      return undefined;
    }
  }
  return current;
};

const setPointer = (
  root: Readonly<Record<string, JSONValue>>,
  pointer: string,
  value: JSONValue,
): Record<string, JSONValue> => {
  const parts = pointerParts(pointer);
  if (parts === undefined || parts.length === 0) {
    throw failure('INVALID_POINTER', 'Parameter pointer is invalid.');
  }
  const output = structuredClone(root);
  let current: Record<string, JSONValue> | JSONValue[] = output;
  for (const part of parts.slice(0, -1)) {
    let child: JSONValue | undefined;
    if (Array.isArray(current)) {
      const index = arrayIndex(part, current.length);
      if (index === undefined || !Object.hasOwn(current, index)) {
        throw failure('INVALID_POINTER', 'Parameter pointer crosses an absent array item.');
      }
      child = current[index];
    } else if (Object.hasOwn(current, part)) {
      child = current[part];
    } else {
      child = {};
      Object.defineProperty(current, part, {
        value: child,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    if (typeof child !== 'object' || child === null) {
      throw failure('INVALID_POINTER', 'Parameter pointer crosses a non-object value.');
    }
    current = child;
  }
  const finalPart = parts.at(-1)!;
  if (Array.isArray(current)) {
    const index = arrayIndex(finalPart, current.length);
    if (index === undefined || !Object.hasOwn(current, index)) {
      throw failure('INVALID_POINTER', 'Parameter pointer addresses an absent array item.');
    }
    current[index] = value;
  } else {
    Object.defineProperty(current, finalPart, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return output;
};

/**
 * Return the active record group as request input. A source-unit value carries its stored unit as
 * text so later composition cannot separate the number from the unit it is expressed in.
 *
 * @param record - Validated stored parameter record.
 * @returns A pure copy of the active values suitable for parameter input resolution.
 * @public
 */
export const parameterRecordInputValues = (record: FileParameterEntry): Readonly<Record<string, JSONValue>> => {
  const group = record.groups[record.activeGroup]!;
  let values = structuredClone(group.values);
  for (const pointer of Object.keys(group.sourceUnits ?? {})) {
    const value = valueAtPointer(values, pointer);
    const unit = group.units?.[pointer];
    if (typeof value === 'number' && unit !== undefined) {
      values = setPointer(values, pointer, `${JSON.stringify(value)} ${unit}`);
    }
  }
  return values;
};

const nonScalarSchemaTypes = new Set([
  'array',
  'object',
  'int8',
  'uint8',
  'int16',
  'uint16',
  'int32',
  'uint32',
  'int64',
  'uint64',
  'int128',
  'uint128',
  'integer',
  'float',
  'float8',
  'double',
  'number',
  'decimal',
]);

const schemaValueAtPointer = (value: unknown, pointer: string): unknown => {
  if (pointer === '') {
    return value;
  }
  const parts = pointerParts(pointer);
  if (parts === undefined) {
    return undefined;
  }
  let current = value;
  for (const part of parts) {
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9]\d*)$/u.test(part) || Number(part) >= current.length) {
        return undefined;
      }
      current = current[Number(part)];
    } else if (typeof current === 'object' && current !== null && Object.hasOwn(current, part)) {
      current = Reflect.get(current, part);
    } else {
      return undefined;
    }
  }
  return current;
};

const schemaTypesAtPointer = (manifest: ParameterManifest, pointer: string): readonly string[] => {
  const parts = pointerParts(pointer);
  if (parts === undefined) {
    return [];
  }
  const visited = new Set<string>();
  const visit = (node: unknown, resource: string, remaining: readonly string[]): string[] => {
    if (typeof node !== 'object' || node === null || Array.isArray(node)) {
      return [];
    }
    const record = node as Record<string, unknown>;
    const followReference = (reference: string): string[] => {
      const hash = reference.indexOf('#');
      const targetResource = reference.startsWith('#') ? resource : hash === -1 ? reference : reference.slice(0, hash);
      const targetPointer = reference.startsWith('#')
        ? reference.slice(1)
        : hash === -1
          ? ''
          : reference.slice(hash + 1);
      const key = `${targetResource}#${targetPointer}\0${remaining.join('/')}`;
      if (visited.has(key)) {
        return [];
      }
      visited.add(key);
      const targetSchema = targetResource === rootResource ? manifest.schema : manifest.resources[targetResource];
      return visit(schemaValueAtPointer(targetSchema, targetPointer), targetResource, remaining);
    };
    if (typeof record['$ref'] === 'string') {
      return followReference(record['$ref']);
    }

    const types = Array.isArray(record['type']) ? record['type'] : [record['type']];
    const output = types.flatMap((type) => {
      const reference = schemaValueAtPointer(type, '/$ref');
      return typeof reference === 'string' ? followReference(reference) : [];
    });
    for (const keyword of ['allOf', 'anyOf', 'oneOf']) {
      const branches = record[keyword];
      if (Array.isArray(branches)) {
        output.push(...branches.flatMap((branch) => visit(branch, resource, remaining)));
      }
    }
    if (remaining.length === 0) {
      output.push(...types.filter((type): type is string => typeof type === 'string'));
      return output;
    }
    const head = remaining[0]!;
    const tail = remaining.slice(1);
    const { properties, items } = record;
    if (typeof properties === 'object' && properties !== null && !Array.isArray(properties) && head in properties) {
      output.push(...visit(Reflect.get(properties, head), resource, tail));
    }
    if (/^(?:0|[1-9]\d*)$/u.test(head)) {
      output.push(...visit(Array.isArray(items) ? items[Number(head)] : items, resource, tail));
    }
    return output;
  };
  return visit(manifest.schema, rootResource, parts);
};

/** Whatever the manifest calls the declaration, so a refusal names the file the agent is editing. */
const sourceName = (manifest: ParameterManifest): string =>
  manifest.scope.kind === 'source' ? manifest.scope.entry : manifest.source.id;

const nonScalarRefusal = (pointer: string, types: readonly string[]): Error => {
  const noun = types.includes('object') ? 'an object' : types.includes('array') ? 'an array' : undefined;
  return failure(
    'REPRESENTATION_UNSUPPORTED',
    noun === undefined
      ? `${pointer} declares no editable scalar value.`
      : `${pointer} is ${noun}. Edit one of its fields, or replace the group values.`,
  );
};

/**
 * Resolve a field named by pointer alone under the pinned manifest. A pointer the schema declares
 * nowhere is an unknown field; one that is not an editable scalar is unrepresentable. A declared
 * scalar with no binding resolves to `undefined` and its value is stored as sent.
 */
const admittedNativeBinding = (manifest: ParameterManifest, pointer: string): ParameterBinding | undefined => {
  const binding = resolveParameterBinding(manifest, pointer);
  if (binding !== undefined) {
    return binding;
  }
  const types = schemaTypesAtPointer(manifest, pointer);
  if (types.length === 0) {
    throw failure(
      'UNKNOWN_FIELD',
      `${sourceName(manifest)} declares no parameter at ${pointer}. Use a pointer that get_parameters lists.`,
    );
  }
  if (!types.some((type) => type !== 'null') || types.some((type) => nonScalarSchemaTypes.has(type))) {
    throw nonScalarRefusal(pointer, types);
  }
  return undefined;
};

/** The same resolution for an operation that can only act on a field the manifest binds. */
const admittedBinding = (manifest: ParameterManifest, pointer: string): ParameterBinding => {
  const binding = admittedNativeBinding(manifest, pointer);
  if (binding === undefined) {
    throw failure('REPRESENTATION_UNSUPPORTED', `${pointer} declares no unit; send native-value.`);
  }
  return binding;
};

/**
 * Resolve the effective binding for one field: the admitted manifest binding, refined by the unit
 * the person chose for it. Constraints follow the unit, so a bound authored in the manifest's unit
 * is reported in the chosen one. Nothing here throws; {@link admitGroupClaims} refuses a claim the
 * declaration contradicts before a write, and display tolerates it. @public
 */
// oxlint-disable-next-line max-params -- Effective binding precedence correlates the record's authored claims.
export const resolveEffectiveParameterBinding = (
  manifest: ParameterManifest,
  pointer: string,
  binding: ParameterBinding,
  group?: ParameterGroup,
): ParameterBinding => {
  const unit = appliedUnit(manifest, pointer, binding, group);
  if (unit === undefined) {
    return binding;
  }
  return {
    ...binding,
    unit,
    // Bounds authored in the producer's unit are restated in the chosen one. With no prior unit
    // there is nothing to convert from, so they stay as the producer wrote them.
    constraints:
      binding.unit === undefined || group?.sourceUnits?.[pointer] === undefined
        ? binding.constraints
        : convertedConstraints(binding, binding.constraints, binding.unit, unit),
  };
};

const nativeUnitValue = (binding: ParameterBinding, value: string | JSONValue, inputUnit?: string): JSONValue => {
  if (binding.representation === 'decimal') {
    if (typeof value !== 'string') {
      throw failure('REPRESENTATION_UNSUPPORTED', 'Decimal data must remain lexical text.');
    }
    return value;
  }
  if (inputUnit === undefined) {
    return value;
  }
  if (binding.unit === undefined) {
    throw failure('SEMANTICS_UNRESOLVED', 'Unit-bearing input requires admitted native semantics.');
  }
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw failure('REPRESENTATION_UNSUPPORTED', 'Unit-bearing input requires a finite numeric value.');
  }
  const parsed =
    typeof value === 'string'
      ? parseInput({
          text: value,
          inputUnit,
          expectedUnit: binding.unit,
          ...(binding.quantityKind === undefined ? {} : { kind: binding.quantityKind }),
          space: binding.space ?? 'linear',
          ...(binding.reference === undefined ? {} : { reference: binding.reference }),
        })
      : createQuantity({
          value,
          representation: binding.representation,
          unit: inputUnit,
          ...(binding.quantityKind === undefined ? {} : { kind: binding.quantityKind }),
          space: binding.space ?? 'linear',
          ...(binding.reference === undefined ? {} : { reference: binding.reference }),
        });
  if (parsed.status !== 'success') {
    throw failure(parsed.diagnostic.code, parsed.diagnostic.message);
  }
  const quantity = 'quantity' in parsed.value ? parsed.value.quantity : parsed.value;
  const converted = convert({ quantity, to: binding.unit });
  if (converted.status !== 'success') {
    throw failure(converted.diagnostic.code, converted.diagnostic.message);
  }
  if (typeof converted.value.value !== 'number') {
    throw failure('REPRESENTATION_UNSUPPORTED', 'The converted value is not executable as finite binary64.');
  }
  if (binding.representation === 'safe-integer' && !Number.isSafeInteger(converted.value.value)) {
    throw failure('REPRESENTATION_UNSUPPORTED', 'The converted value does not preserve a safe integer.');
  }
  // Ponytail: affine (point-space) conversions go through the absolute reference in binary64, so a
  // representable target such as 0 °C from 32 °F can persist a one-ulp residue (5.684e-14 = ulp(273.15)).
  // The residue is stored as computed rather than snapped; snap per declared rounding policy if one lands.
  return converted.value.value;
};

/**
 * Restate numeric bounds in the chosen unit. A bound the conversion cannot carry is dropped rather
 * than reported wrongly: it constrains the producer's own unit, which still admits the value.
 */
// oxlint-disable-next-line max-params -- Constraint conversion needs both authored and selected unit context.
const convertedConstraints = (
  binding: ParameterBinding,
  constraints: Readonly<Record<string, unknown>>,
  inputUnit: string,
  unit: string,
): ParameterBinding['constraints'] => {
  const convertValue = (item: unknown): JSONValue | undefined => {
    if (typeof item !== 'number') {
      return undefined;
    }
    try {
      return nativeUnitValue({ ...binding, unit, representation: 'binary64' }, item, inputUnit);
    } catch {
      return undefined;
    }
  };
  return Object.fromEntries(
    Object.entries(constraints).flatMap(([key, value]) => {
      if (Array.isArray(value)) {
        const items = value.map((item) => convertValue(item));
        return items.some((item) => item === undefined) ? [] : [[key, items as JSONValue]];
      }
      const converted = convertValue(value);
      return converted === undefined ? [] : [[key, converted]];
    }),
  ) as ParameterBinding['constraints'];
};

const sourceUnitRebindRequired = (): Error =>
  failure(
    'SOURCE_UNIT_REBIND_REQUIRED',
    'The saved source unit no longer matches its declaration owner; reset the group or choose the source unit again.',
    'known-not-applied',
  );

/**
 * Convert every source-unit field of a group back to the unit its producer executes in, so the
 * admitted values are the ones the producer will actually see.
 */
const producerNativeValues = (
  manifest: ParameterManifest,
  group: ParameterGroup,
  values: Readonly<Record<string, JSONValue>>,
): Readonly<Record<string, JSONValue>> => {
  let resolved = structuredClone(values);
  for (const pointer of Object.keys(group.sourceUnits ?? {})) {
    const binding = resolveParameterBinding(manifest, pointer);
    const chosen = group.units?.[pointer];
    if (binding?.sourceUnitCapability === undefined || chosen === undefined) {
      throw sourceUnitRebindRequired();
    }
    const value = valueAtPointer(resolved, pointer);
    if (value === undefined) {
      continue;
    }
    resolved = setPointer(resolved, pointer, nativeUnitValue(binding, value, chosen));
  }
  return resolved;
};

const admitGroupValues = (
  manifest: ParameterManifest,
  group: ParameterGroup,
  values: Readonly<Record<string, JSONValue>>,
): void => {
  admitGroupClaims(manifest, group);
  admitParameterValues(manifest, producerNativeValues(manifest, group, values));
};

const concretePointers = (root: Readonly<Record<string, JSONValue>>, template: string): readonly string[] => {
  const parts = pointerParts(template);
  if (parts === undefined || !parts.includes('*')) {
    return [template];
  }
  const output: string[] = [];
  const visit = (value: JSONValue, index: number, pointer: string): void => {
    if (index === parts.length) {
      output.push(pointer);
      return;
    }
    const part = parts[index]!;
    if (part === '*') {
      if (!Array.isArray(value)) {
        return;
      }
      for (const [itemIndex, item] of value.entries()) {
        visit(item, index + 1, `${pointer}/${itemIndex}`);
      }
      return;
    }
    if (typeof value !== 'object' || value === null) {
      return;
    }
    if (Array.isArray(value)) {
      const itemIndex = arrayIndex(part, value.length);
      if (itemIndex !== undefined && Object.hasOwn(value, itemIndex)) {
        visit(value[itemIndex]!, index + 1, `${pointer}/${itemIndex}`);
      }
      return;
    }
    if (Object.hasOwn(value, part)) {
      visit(value[part]!, index + 1, `${pointer}/${escapePointer(part)}`);
    }
  };
  visit(root, 0, '');
  return output;
};

/** Convert unit-bearing textual overrides to admitted native execution values. @public */
export const resolveParameterInputValues = (
  manifest: ParameterManifest,
  values: Readonly<Record<string, unknown>>,
): Readonly<Record<string, JSONValue>> => {
  let resolved = structuredClone(values) as Record<string, JSONValue>;
  for (const [template, templateBinding] of Object.entries(manifest.bindings)) {
    for (const pointer of concretePointers(resolved, template)) {
      const value = valueAtPointer(resolved, pointer);
      if (value === undefined) {
        continue;
      }
      const binding = resolveParameterBinding(manifest, pointer) ?? templateBinding;
      if (binding.representation === 'decimal') {
        throw failure(
          'REPRESENTATION_UNSUPPORTED',
          'Decimal parameter data is preserved but cannot be executed exactly.',
        );
      }
      if (typeof value === 'string' && binding.unit !== undefined) {
        resolved = setPointer(resolved, pointer, nativeUnitValue(binding, value, binding.unit));
      }
    }
  }
  admitParameterValues(manifest, resolved);
  return resolved;
};

/** Drop a claim map once it holds nothing, so an untouched group stays at its minimal shape. */
const withoutEmptyClaims = (group: ParameterGroup): ParameterGroup => ({
  values: group.values,
  ...(group.units === undefined || Object.keys(group.units).length === 0 ? {} : { units: group.units }),
  ...(group.sourceUnits === undefined || Object.keys(group.sourceUnits).length === 0
    ? {}
    : { sourceUnits: group.sourceUnits }),
});

const sameValues = (left: Readonly<Record<string, JSONValue>>, right: Readonly<Record<string, JSONValue>>): boolean =>
  canonicalizeCacheValue({ value: left as CacheValue }) === canonicalizeCacheValue({ value: right as CacheValue });

/** Compute a record transition from one admitted semantic snapshot. @internal */
export const planParameterRecord = (
  input: Readonly<{ current: ParameterSnapshot; request: ParameterSetRequest }>,
): ParameterSetPlanResult => {
  if (!validRequestShape(input.request)) {
    return { status: 'rejected', code: 'INVALID_REQUEST', message: 'Invalid parameter request.' };
  }
  if (input.request.expected.manifestRevision !== input.current.identity.manifestRevision) {
    return { status: 'rejected', code: 'STALE_MANIFEST', message: 'Parameter semantics changed.' };
  }
  const rejected = groupOperationRejection(input.request, input.current);
  if (rejected !== undefined) {
    return { status: 'rejected', ...rejected };
  }
  const { manifest } = input.current;
  try {
    const entry = fileParameterEntrySchema.parse(structuredClone(input.current.entry));
    const { operation } = input.request;
    let changed = true;
    switch (operation.kind) {
      case 'create-group': {
        if (Object.hasOwn(entry.groups, operation.group)) {
          throw failure('GROUP_ALREADY_EXISTS', `Parameter group "${operation.group}" already exists.`);
        }
        const values = structuredClone(operation.values ?? {});
        admitGroupValues(manifest, { values }, values);
        entry.groups[operation.group] = { values };
        break;
      }
      case 'delete-group': {
        Reflect.deleteProperty(entry.groups, operation.group);
        break;
      }
      case 'select-group': {
        changed = entry.activeGroup !== operation.group;
        entry.activeGroup = operation.group;
        break;
      }
      case 'rename-group': {
        changed = operation.group !== operation.nextGroup;
        if (changed) {
          entry.groups = Object.fromEntries(
            Object.entries(entry.groups).map(([name, group]) =>
              name === operation.group ? [operation.nextGroup, group] : [name, group],
            ),
          );
          entry.activeGroup = entry.activeGroup === operation.group ? operation.nextGroup : entry.activeGroup;
        }
        break;
      }
      case 'reset-group': {
        // Reset drops the authored units with the values: it restores the producer's own defaults.
        entry.groups[operation.group] = { values: {} };
        break;
      }
      case 'replace-group-values': {
        const group = entry.groups[operation.group]!;
        const values = structuredClone(operation.values);
        // Authored units survive a value replacement: they say what the numbers mean.
        const next = withoutEmptyClaims({ ...group, values });
        admitGroupValues(manifest, next, values);
        changed = !sameValues(values, group.values);
        entry.groups[operation.group] = next;
        break;
      }
      case 'native-value': {
        const binding = admittedNativeBinding(manifest, operation.pointer);
        const group = entry.groups[operation.group]!;
        const value =
          binding === undefined
            ? operation.value
            : nativeUnitValue(
                resolveEffectiveParameterBinding(manifest, operation.pointer, binding, group),
                operation.value,
              );
        const values = setPointer(group.values, operation.pointer, value);
        const next = withoutEmptyClaims({ ...group, values });
        admitGroupValues(manifest, next, values);
        changed = !sameValues(values, group.values);
        entry.groups[operation.group] = next;
        break;
      }
      case 'unit-value': {
        const binding = admittedBinding(manifest, operation.pointer);
        const group = entry.groups[operation.group]!;
        const effective = resolveEffectiveParameterBinding(manifest, operation.pointer, binding, group);
        const value = nativeUnitValue(effective, operation.value, operation.inputUnit);
        const values = setPointer(group.values, operation.pointer, value);
        const next = withoutEmptyClaims({ ...group, values });
        admitGroupValues(manifest, next, values);
        changed = !sameValues(values, group.values);
        entry.groups[operation.group] = next;
        break;
      }
      case 'batch': {
        const group = entry.groups[operation.group]!;
        let values = structuredClone(group.values);
        for (const edit of operation.edits) {
          // A unit-bearing edit needs a bound field; a plain one is the native-value rule.
          const binding =
            edit.inputUnit === undefined
              ? admittedNativeBinding(manifest, edit.pointer)
              : admittedBinding(manifest, edit.pointer);
          values = setPointer(
            values,
            edit.pointer,
            binding === undefined
              ? edit.value
              : nativeUnitValue(
                  resolveEffectiveParameterBinding(manifest, edit.pointer, binding, group),
                  edit.value,
                  edit.inputUnit,
                ),
          );
        }
        const next = withoutEmptyClaims({ ...group, values });
        admitGroupValues(manifest, next, values);
        changed = !sameValues(values, group.values);
        entry.groups[operation.group] = next;
        break;
      }
      case 'source-unit': {
        // An unbound field has no source unit to change, so "send native-value" would be the wrong recovery.
        const binding = admittedNativeBinding(manifest, operation.pointer);
        if (binding?.unit === undefined || binding.representation !== 'binary64' || binding.space === 'point') {
          throw failure('REPRESENTATION_UNSUPPORTED', 'Source-unit changes require finite linear binary64 semantics.');
        }
        if (
          binding.sourceUnitCapability !== 'change-source-unit:preserve-size:v1' ||
          operation.producerCapability.capability !== binding.sourceUnitCapability ||
          operation.producerCapability.producer !== manifest.source.id ||
          operation.producerCapability.sourceRevision !== manifest.source.revision
        ) {
          throw failure(
            'SOURCE_UNIT_UNAVAILABLE',
            'The declaration owner does not support this source-unit transaction.',
          );
        }
        const group = entry.groups[operation.group]!;
        // The unit in force for this field today: the one already authored, else the producer's.
        const fromUnit = group.units?.[operation.pointer] ?? binding.unit;
        if (fromUnit === operation.unit) {
          throw failure('NO_CHANGE', 'The requested source unit is already active.');
        }
        const current =
          valueAtPointer(group.values, operation.pointer) ??
          valueAtPointer(manifest.defaults as Readonly<Record<string, JSONValue>>, operation.pointer);
        if (current === undefined) {
          throw failure('INVALID_OPERATION', 'The source-unit parameter has no current or default value.');
        }
        const values = setPointer(
          group.values,
          operation.pointer,
          nativeUnitValue({ ...binding, unit: operation.unit }, current, fromUnit),
        );
        const units = { ...group.units, [operation.pointer]: operation.unit };
        const sourceUnits = { ...group.sourceUnits, [operation.pointer]: operation.unit };
        if (operation.unit === binding.unit) {
          Reflect.deleteProperty(units, operation.pointer);
          Reflect.deleteProperty(sourceUnits, operation.pointer);
        }
        const next = withoutEmptyClaims({ values, units, sourceUnits });
        admitGroupValues(manifest, next, values);
        entry.groups[operation.group] = next;
        return {
          status: 'confirmation-required',
          proposed: snapshotFor(entry, manifest),
          planFingerprint: `${input.request.requestId}:${operation.pointer}:${operation.unit}`,
          producerCapability: operation.producerCapability,
        };
      }
    }
    if (!changed) {
      return { status: 'ready', proposed: input.current };
    }
    return { status: 'ready', proposed: snapshotFor(entry, manifest) };
  } catch (error) {
    return {
      status: 'rejected',
      code: typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'INVALID_OPERATION',
      message: error instanceof Error ? error.message : 'Parameter operation is invalid.',
    };
  }
};
