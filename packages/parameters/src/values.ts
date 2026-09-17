import type { ParameterSetRequest, ParameterSetPlanResult } from '#types.js';
import type { ParameterSnapshot } from '#snapshot.js';
import { snapshotFor } from '#snapshot.js';
import { groupOperationRejection, validRequestShape, sameIdentity } from '#request.js';
import { canonicalizeCacheValue } from '@taucad/cache-core';
import type { CacheValue } from '@taucad/cache-core';
import { fileParameterEntrySchema } from '@taucad/types';
import type { FileParameterEntry, JSONValue } from '@taucad/types';
import { parseInput } from '@taucad/units/input';
import { convert, createQuantity } from '@taucad/units/quantity';
import { admitUnit } from '@taucad/units/unit';
import { admitParameterValues, resolveParameterBinding, resolveParameterBindingPointer } from '#manifest.js';
import type { ParameterBinding, ParameterDeclaration, ParameterManifest, ParameterProvenance } from '#manifest.js';

const failure = (code: string, message: string, applicationState?: string): Error =>
  Object.assign(new Error(message), { code, applicationState });

const escapePointer = (value: string): string => value.replaceAll('~', '~0').replaceAll('/', '~1');
type PersistedParameterBinding = NonNullable<FileParameterEntry['groups'][string]['bindings']>[string];

/** Resolve the provenance for one field of the effective parameter binding. @public */
// oxlint-disable-next-line max-params -- Provenance lookup needs the admitted manifest, pointer, binding, and one field.
export const resolveEffectiveParameterProvenance = (
  manifest: ParameterManifest,
  pointer: string,
  binding: ParameterBinding,
  field: 'unit' | 'quantityKind' | 'space' | 'reference',
  persisted?: PersistedParameterBinding,
): Omit<ParameterProvenance, 'field'> | undefined => {
  if (shouldKeepPersistedField(manifest, pointer, binding, persisted, field)) {
    return persisted?.provenance?.[field];
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

const persistedMatchesBinding = (
  binding: ParameterBinding,
  persisted?: PersistedParameterBinding,
): persisted is PersistedParameterBinding =>
  persisted !== undefined &&
  persisted.parameter.value === binding.parameter.value &&
  persisted.parameter.stability === binding.parameter.stability &&
  persisted.schema.resource === binding.schema.resource &&
  persisted.schema.pointer === binding.schema.pointer &&
  persisted.representation === binding.representation;

// oxlint-disable-next-line max-params -- Claim precedence is defined across the admitted and persisted records.
const shouldKeepPersistedField = (
  manifest: ParameterManifest,
  pointer: string,
  binding: ParameterBinding,
  persisted: PersistedParameterBinding | undefined,
  field: 'unit' | 'quantityKind' | 'space' | 'reference',
): boolean => {
  if (!persistedMatchesBinding(binding, persisted)) {
    return false;
  }
  const previous = persisted.provenance?.[field];
  const current = resolveEffectiveParameterProvenance(manifest, pointer, binding, field);
  return (
    persisted[field] !== undefined &&
    previous?.origin === 'project' &&
    (binding[field] === undefined ||
      current?.origin === 'inferred' ||
      (field === 'unit' && persisted.sourceUnit !== undefined))
  );
};

// oxlint-disable-next-line max-params -- Persisted binding construction correlates one manifest binding with prior evidence.
const persistedBinding = (
  manifest: ParameterManifest,
  pointer: string,
  binding: ParameterBinding,
  previous?: PersistedParameterBinding,
) => ({
  parameter: binding.parameter,
  schema: binding.schema,
  representation: binding.representation,
  ...(binding.unit === undefined ? {} : { unit: binding.unit }),
  ...(binding.quantityKind === undefined ? {} : { quantityKind: binding.quantityKind }),
  ...(binding.space === undefined ? {} : { space: binding.space }),
  ...(binding.reference === undefined ? {} : { reference: binding.reference }),
  constraints: structuredClone(binding.constraints) as Record<string, JSONValue>,
  ...(previous?.sourceUnit === undefined ? {} : { sourceUnit: previous.sourceUnit }),
  provenance: Object.fromEntries(
    (['unit', 'quantityKind', 'space', 'reference'] as const).flatMap((field) => {
      const previousProvenance = previous?.provenance?.[field];
      const current = resolveParameterBinding(manifest, pointer);
      const currentProvenance =
        current === undefined ? undefined : resolveEffectiveParameterProvenance(manifest, pointer, current, field);
      const keepPrevious =
        previousProvenance?.origin === 'project' &&
        (current?.[field] === undefined ||
          currentProvenance?.origin === 'inferred' ||
          (field === 'unit' && previous?.sourceUnit !== undefined));
      const value = keepPrevious
        ? previousProvenance
        : resolveEffectiveParameterProvenance(manifest, pointer, binding, field);
      return value === undefined ? [] : [[field, value]];
    }),
  ),
});

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

const admittedBinding = (
  manifest: ParameterManifest,
  input: Readonly<{ parameterId: string; resource: string; pointer: string }>,
): ParameterBinding => {
  const binding = resolveParameterBinding(manifest, input.pointer);
  if (
    binding === undefined ||
    binding.parameter.value !== input.parameterId ||
    binding.schema.resource !== input.resource
  ) {
    throw failure('STALE_MANIFEST', 'The operation does not match an admitted manifest binding.');
  }
  return binding;
};

/** Resolve declared, project and inferred claims using the authority's canonical precedence. @public */
// oxlint-disable-next-line max-params -- Effective binding precedence requires the current and persisted claims together.
export const resolveEffectiveParameterBinding = (
  manifest: ParameterManifest,
  pointer: string,
  binding: ParameterBinding,
  persisted?: PersistedParameterBinding,
): ParameterBinding => {
  const keep = (field: 'unit' | 'quantityKind' | 'space' | 'reference'): boolean => {
    return shouldKeepPersistedField(manifest, pointer, binding, persisted, field);
  };
  return {
    ...binding,
    ...(keep('unit') ? { unit: persisted!.unit } : {}),
    ...(keep('quantityKind') ? { quantityKind: persisted!.quantityKind } : {}),
    ...(keep('space') ? { space: persisted!.space } : {}),
    ...(keep('reference') ? { reference: persisted!.reference } : {}),
    constraints:
      persistedMatchesBinding(binding, persisted) && persisted.sourceUnit !== undefined
        ? (persisted.constraints ?? binding.constraints)
        : binding.constraints,
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

// oxlint-disable-next-line max-params -- Constraint conversion needs both authored and selected unit context.
const convertedConstraints = (
  binding: ParameterBinding,
  constraints: Readonly<Record<string, unknown>>,
  inputUnit: string,
  unit: string,
): Readonly<Record<string, unknown>> =>
  Object.fromEntries(
    Object.entries(constraints).map(([key, value]) => {
      const convertValue = (item: unknown): JSONValue => {
        if (typeof item !== 'number') {
          throw failure('REPRESENTATION_UNSUPPORTED', `Source-unit constraint ${key} must be numeric.`);
        }
        return nativeUnitValue({ ...binding, unit }, item, inputUnit);
      };
      return [key, Array.isArray(value) ? value.map((item) => convertValue(item)) : convertValue(value)];
    }),
  );

/**
 * A persisted source-unit context stays valid while the same producer still advertises the same
 * capability for the same authored unit; an unrelated source edit does not invalidate it.
 */
const sourceUnitContextMatches = (
  context: NonNullable<PersistedParameterBinding['sourceUnit']>,
  producer: Readonly<{ id: string; capability?: string; unit?: string }>,
): boolean =>
  context.producer === producer.id &&
  context.capability === producer.capability &&
  context.producerUnit === producer.unit;

const sourceUnitRebindRequired = (): Error =>
  failure(
    'SOURCE_UNIT_REBIND_REQUIRED',
    'The saved source unit no longer matches its declaration owner; reset the group or choose the source unit again.',
    'known-not-applied',
  );

const producerNativeValues = (
  manifest: ParameterManifest,
  group: FileParameterEntry['groups'][string],
  values: Readonly<Record<string, JSONValue>>,
): Readonly<Record<string, JSONValue>> => {
  let resolved = structuredClone(values);
  for (const [pointer, persisted] of Object.entries(group.bindings ?? {})) {
    const context = persisted.sourceUnit;
    if (context === undefined) {
      continue;
    }
    const binding = resolveParameterBinding(manifest, pointer);
    if (
      binding === undefined ||
      !sourceUnitContextMatches(context, {
        id: manifest.source.id,
        ...(binding.sourceUnitCapability === undefined ? {} : { capability: binding.sourceUnitCapability }),
        ...(binding.unit === undefined ? {} : { unit: binding.unit }),
      })
    ) {
      throw sourceUnitRebindRequired();
    }
    const value = valueAtPointer(resolved, pointer);
    if (value === undefined || persisted.unit === undefined) {
      continue;
    }
    const effective = resolveEffectiveParameterBinding(manifest, pointer, binding, persisted);
    resolved = setPointer(
      resolved,
      pointer,
      nativeUnitValue({ ...effective, unit: context.producerUnit }, value, persisted.unit),
    );
  }
  return resolved;
};

const admitGroupValues = (
  manifest: ParameterManifest,
  group: FileParameterEntry['groups'][string],
  values: Readonly<Record<string, JSONValue>>,
): void => {
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

/** Convert a checked source-unit record back to one producer's authored execution units. @public */
export const resolveProducerParameterValues = (
  input: Readonly<{
    producer: string;
    declaration: ParameterDeclaration;
    entry: FileParameterEntry;
    values: Readonly<Record<string, unknown>>;
  }>,
): Readonly<Record<string, JSONValue>> => {
  const group = input.entry.groups[input.entry.activeGroup];
  if (group === undefined) {
    throw failure('INVALID_RECORD', 'The active parameter group is missing.');
  }
  let resolved = structuredClone(input.values) as Record<string, JSONValue>;
  for (const [pointer, persisted] of Object.entries(group.bindings ?? {})) {
    const context = persisted.sourceUnit;
    if (context === undefined) {
      continue;
    }
    const declared = input.declaration.bindings?.[pointer];
    if (
      declared === undefined ||
      !sourceUnitContextMatches(context, {
        id: input.producer,
        ...(declared.sourceUnitCapability === undefined ? {} : { capability: declared.sourceUnitCapability }),
        ...(declared.unit === undefined ? {} : { unit: declared.unit }),
      }) ||
      persisted.unit === undefined ||
      persisted.representation === undefined
    ) {
      throw sourceUnitRebindRequired();
    }
    const value = valueAtPointer(resolved, pointer);
    if (value === undefined) {
      continue;
    }
    resolved = setPointer(
      resolved,
      pointer,
      nativeUnitValue(
        {
          parameter: persisted.parameter,
          schema: persisted.schema,
          representation: persisted.representation,
          optional: false,
          nullable: false,
          unit: context.producerUnit,
          quantityKind: declared.quantityKind ?? persisted.quantityKind,
          space: declared.space ?? persisted.space,
          reference: declared.reference ?? persisted.reference,
          constraints: persisted.constraints ?? {},
        },
        value,
        persisted.unit,
      ),
    );
  }
  return resolved;
};

/** Compute a record transition from one admitted semantic snapshot. @internal */
export const planParameterRecord = async (
  input: Readonly<{ current: ParameterSnapshot; request: ParameterSetRequest & Readonly<{ fingerprint: string }> }>,
): Promise<ParameterSetPlanResult> => {
  if (!validRequestShape(input.request)) {
    return { status: 'rejected', code: 'INVALID_REQUEST', message: 'Invalid parameter request.' };
  }
  if (!sameIdentity(input.request.expected, input.current.identity)) {
    return { status: 'rejected', code: 'STALE_MANIFEST', message: 'Parameter snapshot changed.' };
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
      case 'display-preference': {
        return {
          status: 'rejected',
          code: 'DISPLAY_ONLY_ACTION',
          message: 'Display preferences are not persisted.',
        };
      }
      case 'create-group': {
        if (Object.hasOwn(entry.groups, operation.group)) {
          throw failure('GROUP_ALREADY_EXISTS', `Parameter group "${operation.group}" already exists.`);
        }
        const values = structuredClone(operation.values ?? {});
        admitGroupValues(manifest, { values }, values);
        entry.groups[operation.group] = { values };
        entry.order = [...(entry.order ?? Object.keys(input.current.entry.groups)), operation.group];
        break;
      }
      case 'delete-group': {
        Reflect.deleteProperty(entry.groups, operation.group);
        entry.order = entry.order?.filter((group) => group !== operation.group);
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
          entry.groups[operation.nextGroup] = entry.groups[operation.group]!;
          Reflect.deleteProperty(entry.groups, operation.group);
          entry.activeGroup = entry.activeGroup === operation.group ? operation.nextGroup : entry.activeGroup;
          entry.order = entry.order?.map((group) => (group === operation.group ? operation.nextGroup : group));
        }
        break;
      }
      case 'reset-group': {
        entry.groups[operation.group] = { values: {} };
        break;
      }
      case 'replace-group-values': {
        const group = entry.groups[operation.group]!;
        const values = structuredClone(operation.values);
        const bindings = Object.fromEntries(
          Object.entries(manifest.bindings).map(([pointer, binding]) => {
            const previous = group.bindings?.[pointer];
            return [
              pointer,
              persistedBinding(
                manifest,
                pointer,
                resolveEffectiveParameterBinding(manifest, pointer, binding, previous),
                previous,
              ),
            ];
          }),
        );
        admitGroupValues(manifest, { values, bindings }, values);
        changed =
          canonicalizeCacheValue({ value: values as CacheValue }) !==
          canonicalizeCacheValue({ value: group.values as CacheValue });
        entry.groups[operation.group] = {
          values,
          bindings,
        };
        break;
      }
      case 'native-value':
      case 'unit-value': {
        const binding = admittedBinding(manifest, operation);
        const group = entry.groups[operation.group]!;
        const previous = group.bindings?.[operation.pointer];
        const effective = resolveEffectiveParameterBinding(manifest, operation.pointer, binding, previous);
        const value = nativeUnitValue(
          effective,
          operation.value,
          operation.kind === 'unit-value' ? operation.inputUnit : undefined,
        );
        const values = setPointer(group.values, operation.pointer, value);
        const nextGroup = {
          values,
          bindings: {
            ...group.bindings,
            [operation.pointer]: persistedBinding(manifest, operation.pointer, effective, previous),
          },
        };
        admitGroupValues(manifest, nextGroup, values);
        changed =
          canonicalizeCacheValue({ value: values as CacheValue }) !==
          canonicalizeCacheValue({ value: group.values as CacheValue });
        entry.groups[operation.group] = nextGroup;
        break;
      }
      case 'batch': {
        const group = entry.groups[operation.group]!;
        let values = structuredClone(group.values);
        const bindings = { ...group.bindings };
        for (const edit of operation.edits) {
          const binding = admittedBinding(manifest, edit);
          const previous = bindings[edit.pointer];
          const effective = resolveEffectiveParameterBinding(manifest, edit.pointer, binding, previous);
          values = setPointer(values, edit.pointer, nativeUnitValue(effective, edit.value, edit.inputUnit));
          bindings[edit.pointer] = persistedBinding(manifest, edit.pointer, effective, previous);
        }
        admitGroupValues(manifest, { values, bindings }, values);
        changed =
          canonicalizeCacheValue({ value: values as CacheValue }) !==
          canonicalizeCacheValue({ value: group.values as CacheValue });
        entry.groups[operation.group] = { values, bindings };
        break;
      }
      case 'confirm-inference': {
        const binding = admittedBinding(manifest, operation);
        const group = entry.groups[operation.group]!;
        const persisted = persistedBinding(
          manifest,
          operation.pointer,
          resolveEffectiveParameterBinding(manifest, operation.pointer, binding, group.bindings?.[operation.pointer]),
          group.bindings?.[operation.pointer],
        );
        entry.groups[operation.group] = {
          ...group,
          bindings: {
            ...group.bindings,
            [operation.pointer]: {
              ...persisted,
              provenance: Object.fromEntries(
                Object.entries(persisted.provenance).map(([field, provenance]) => [
                  field,
                  provenance.origin === 'inferred'
                    ? {
                        ...provenance,
                        origin: 'project',
                        evidence: `confirmed:${operation.pointer}`,
                      }
                    : provenance,
                ]),
              ),
            },
          },
        };
        break;
      }
      case 'bind-parameter': {
        const admitted = admittedBinding(manifest, operation);
        const group = entry.groups[operation.group];
        if (group === undefined) {
          throw failure('GROUP_NOT_FOUND', `Parameter group "${operation.group}" does not exist.`);
        }
        for (const field of ['unit', 'quantityKind', 'space', 'reference'] as const) {
          if (operation.binding[field] === undefined) {
            continue;
          }
          const current = resolveEffectiveParameterProvenance(manifest, operation.pointer, admitted, field);
          if (
            admitted[field] !== undefined &&
            current?.origin !== 'inferred' &&
            current?.origin !== 'project' &&
            operation.binding[field] !== admitted[field]
          ) {
            throw failure(
              'METADATA_CONFLICT',
              `Project ${field} conflicts with the explicit parameter declaration.`,
              'known-not-applied',
            );
          }
        }
        const binding: ParameterBinding = { ...admitted, ...operation.binding };
        if (binding.unit !== undefined) {
          const unit = admitUnit(binding.unit);
          if (unit.status !== 'success') {
            throw failure(unit.diagnostic.code, unit.diagnostic.message);
          }
          const quantity = createQuantity({
            value: 0,
            representation: binding.representation === 'decimal' ? 'binary64' : binding.representation,
            unit: binding.unit,
            ...(binding.quantityKind === undefined ? {} : { kind: binding.quantityKind }),
            space: binding.space ?? 'linear',
            ...(binding.reference === undefined ? {} : { reference: binding.reference }),
          });
          if (quantity.status !== 'success') {
            throw failure(quantity.diagnostic.code, quantity.diagnostic.message);
          }
        }
        const persisted = persistedBinding(manifest, operation.pointer, binding, group.bindings?.[operation.pointer]);
        const projectProvenance = Object.fromEntries(
          (['unit', 'quantityKind', 'space', 'reference'] as const).flatMap((field) =>
            operation.binding[field] === undefined || operation.binding[field] === admitted[field]
              ? []
              : [
                  [
                    field,
                    {
                      origin: 'project',
                      producer: 'parameter-set',
                      sourceRevision: manifest.source.revision,
                      evidence: `binding:${operation.pointer}`,
                    },
                  ],
                ],
          ),
        );
        entry.groups[operation.group] = {
          ...group,
          bindings: {
            ...group.bindings,
            [operation.pointer]: {
              ...persisted,
              provenance: { ...persisted.provenance, ...projectProvenance },
            },
          },
        };
        break;
      }
      case 'source-unit': {
        const binding = admittedBinding(manifest, operation);
        if (binding.unit === undefined || binding.representation !== 'binary64' || binding.space === 'point') {
          throw failure('REPRESENTATION_UNSUPPORTED', 'Source-unit changes require finite linear binary64 semantics.');
        }
        if (
          operation.mode !== 'preserve-size' ||
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
        for (const [file, digest] of Object.entries(operation.dependencies ?? {})) {
          if (manifest.identity.sourceFiles[file] !== digest) {
            throw failure(
              'STALE_MANIFEST',
              `The source-unit request observed ${file} at a different revision than the admitted manifest.`,
              'known-not-applied',
            );
          }
        }
        const group = entry.groups[operation.group]!;
        const previous = group.bindings?.[operation.pointer];
        const fromUnit = previous?.sourceUnit ? previous.unit : binding.unit;
        if (fromUnit === undefined || fromUnit === operation.unit) {
          throw failure('NO_CHANGE', 'The requested source unit is already active.');
        }
        const current =
          valueAtPointer(group.values, operation.pointer) ??
          valueAtPointer(manifest.defaults as Readonly<Record<string, JSONValue>>, operation.pointer);
        if (current === undefined) {
          throw failure('INVALID_OPERATION', 'The source-unit parameter has no current or default value.');
        }
        const sourceBinding = resolveEffectiveParameterBinding(manifest, operation.pointer, binding, previous);
        const producerDefault = valueAtPointer(
          manifest.defaults as Readonly<Record<string, JSONValue>>,
          operation.pointer,
        );
        const constraints = {
          ...(producerDefault === undefined
            ? {}
            : {
                default:
                  previous?.sourceUnit === undefined
                    ? producerDefault
                    : nativeUnitValue({ ...binding, unit: fromUnit }, producerDefault, binding.unit),
              }),
          ...sourceBinding.constraints,
        };
        const nextBinding: NonNullable<FileParameterEntry['groups'][string]['bindings']>[string] = {
          ...persistedBinding(
            manifest,
            operation.pointer,
            {
              ...sourceBinding,
              unit: operation.unit,
              constraints: convertedConstraints(sourceBinding, constraints, fromUnit, operation.unit),
            },
            previous,
          ),
          sourceUnit: {
            producer: operation.producerCapability.producer,
            sourceRevision: operation.producerCapability.sourceRevision,
            capability: operation.producerCapability.capability,
            producerUnit: previous?.sourceUnit?.producerUnit ?? binding.unit,
          },
          unit: operation.unit,
          provenance: {
            ...persistedBinding(manifest, operation.pointer, binding).provenance,
            unit: {
              origin: 'project',
              producer: operation.producerCapability.producer,
              sourceRevision: operation.producerCapability.sourceRevision,
              evidence: `source-unit:${operation.pointer}`,
            },
          },
        };
        const values = setPointer(
          group.values,
          operation.pointer,
          nativeUnitValue({ ...sourceBinding, unit: operation.unit }, current, fromUnit),
        );
        const nextGroup = {
          values,
          bindings: {
            ...group.bindings,
            [operation.pointer]: nextBinding,
          },
        };
        admitGroupValues(manifest, nextGroup, values);
        entry.groups[operation.group] = nextGroup;
        const proposed = await snapshotFor(entry, manifest);
        proposed.entry.lastOperation = {
          requestId: input.request.requestId,
          fingerprint: input.request.fingerprint,
          outcome: 'committed',
          ...proposed.identity,
        };
        return {
          status: 'confirmation-required',
          proposed: {
            ...proposed,
            entry: fileParameterEntrySchema.parse(proposed.entry),
          },
          planFingerprint: input.request.fingerprint,
          producerCapability: operation.producerCapability,
          dependencies: manifest.identity.sourceFiles,
        };
      }
    }
    if (!changed) {
      return { status: 'ready', proposed: input.current };
    }
    const proposed = await snapshotFor(entry, manifest);
    proposed.entry.lastOperation = {
      requestId: input.request.requestId,
      fingerprint: input.request.fingerprint,
      outcome: 'committed',
      ...proposed.identity,
    };
    return {
      status: 'ready',
      proposed: {
        ...proposed,
        entry: fileParameterEntrySchema.parse(proposed.entry),
      },
    };
  } catch (error) {
    return {
      status: 'rejected',
      code: typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'INVALID_OPERATION',
      message: error instanceof Error ? error.message : 'Parameter operation is invalid.',
    };
  }
};
