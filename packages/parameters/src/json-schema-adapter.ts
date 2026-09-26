import { admitJsonSchema } from '#schema-admission.js';
import { admitParameterDeclaration } from '#manifest.js';
import type { ParameterDeclaration } from '#manifest.js';
import type { JSONSchema7 } from '@taucad/json-schema';

/** Input for projecting one admitted Draft-07 or 2020-12 schema into a native parameter declaration. @public */
export type Draft7ParameterDeclarationInput = Readonly<{
  schema: JSONSchema7 | Readonly<Record<string, unknown>>;
  defaults: Readonly<Record<string, unknown>>;
  schemaId: string;
  schemaName: string;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const escapePointer = (value: string): string => value.replaceAll('~', '~0').replaceAll('/', '~1');

// The carrier keeps one definitions keyword whichever dialect the author wrote.
const carrierReference = (reference: string): string => reference.replace(/^#\/\$defs\//u, '#/definitions/');
const schemaMapKeywords = new Set(['$defs', 'definitions', 'properties']);
// In 2020-12 documents admission guarantees each numeric format sits on its own JSON type, and the carrier spells
// the width as the type. Draft-07 keeps format an inert annotation.
const draft202012 = 'https://json-schema.org/draft/2020-12/schema';
const carrierWidths = new Set(['float', 'double', 'int32', 'uint32']);
const schemaArrayKeywords = new Set(['allOf', 'anyOf', 'oneOf']);
const schemaKeywords = new Set([
  'additionalItems',
  'additionalProperties',
  'contains',
  'else',
  'if',
  'items',
  'not',
  'propertyNames',
  'then',
]);
const semanticKeywords = new Set([
  'x-ogc-definition',
  'x-ogc-unit',
  'x-tau-quantity-kind',
  'x-tau-reference',
  'x-tau-space',
  'x-tau-symbol',
  'x-tau-symbols',
  'x-tau-unit',
]);

const draftTypeToNative = (value: unknown, width: string | undefined): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => draftTypeToNative(item, width));
  }
  if (value === 'number' || value === 'integer') {
    return width ?? (value === 'number' ? 'double' : 'integer');
  }
  return value;
};

const withoutStringPatterns = (root: Record<string, unknown>): Record<string, unknown> => {
  const projected: Record<string, unknown> = {};
  const stack: Array<{
    source: Record<string, unknown> | unknown[];
    target: Record<string, unknown> | unknown[];
    depth: number;
  }> = [{ source: root, target: projected, depth: 0 }];
  let nodes = 0;
  while (stack.length > 0) {
    const { source, target, depth } = stack.pop()!;
    nodes += 1;
    if (nodes > 2048 || depth > 20) {
      throw new TypeError('SCHEMA_LIMIT: depth or node budget exceeded');
    }
    for (const [key, value] of Object.entries(source)) {
      if (key === 'pattern') {
        continue;
      }
      if (value !== null && typeof value === 'object') {
        const child: Record<string, unknown> | unknown[] = Array.isArray(value) ? [] : {};
        Reflect.set(target, key, child);
        stack.push({
          source: Array.isArray(value) ? value : (value as Record<string, unknown>),
          target: child,
          depth: depth + 1,
        });
      } else {
        Reflect.set(target, key, value);
      }
    }
  }
  return projected;
};

// Admission has refused disagreeing unit and quantity-kind spellings, so either spelling is the claim.
const declaredUnit = (schema: Record<string, unknown>): unknown => schema['x-tau-unit'] ?? schema['x-ogc-unit'];
const declaredKind = (schema: Record<string, unknown>): unknown =>
  schema['x-ogc-definition'] ?? schema['x-tau-quantity-kind'];

type BindingMode = 'definition' | 'exact' | 'unsupported';
type VisitInput = Readonly<{
  value: unknown;
  mode: BindingMode;
  instancePointer: string;
  emit: boolean;
}>;

const createProjection = (
  root: Readonly<Record<string, unknown>>,
): Readonly<{
  schema: Record<string, unknown>;
  bindings: Readonly<Record<string, NonNullable<ParameterDeclaration['bindings']>[string]>>;
}> => {
  const bindings: Record<string, NonNullable<ParameterDeclaration['bindings']>[string]> = {};
  const semanticDefinitions = new Set<Record<string, unknown>>();
  const referencedDefinitions = new Set<Record<string, unknown>>();
  const traversedReferences = new Set<string>();
  const formatWidths = root['$schema'] === draft202012;

  const resolveReference = (reference: string): unknown => {
    let value: unknown = root;
    for (const segment of reference.slice(2).split('/')) {
      if (!isRecord(value)) {
        return undefined;
      }
      value = value[segment.replaceAll('~1', '/').replaceAll('~0', '~')];
    }
    return value;
  };

  const visit = ({ value, mode, instancePointer, emit }: VisitInput): unknown => {
    if (!isRecord(value)) {
      return structuredClone(value);
    }
    const schemaReference = value['$ref'];
    if (typeof schemaReference === 'string') {
      if (Object.keys(value).some((key) => key !== '$ref')) {
        throw new TypeError('NATIVE_PROJECTION_UNSUPPORTED: reference siblings');
      }
      if (/%[0-9A-Fa-f]{2}/u.test(schemaReference)) {
        throw new TypeError('NATIVE_PROJECTION_UNSUPPORTED: percent-encoded bundled reference');
      }
      const target = resolveReference(schemaReference);
      const referenceKey = `${schemaReference}\0${mode}\0${instancePointer}`;
      if (target !== undefined && !traversedReferences.has(referenceKey)) {
        traversedReferences.add(referenceKey);
        visit({ value: target, mode, instancePointer, emit: false });
      }
      return emit ? { type: { $ref: carrierReference(schemaReference) } } : undefined;
    }
    const semantic = Object.keys(value).some((key) => semanticKeywords.has(key));
    if (semantic) {
      if (mode === 'unsupported') {
        throw new TypeError('NATIVE_PROJECTION_UNSUPPORTED: semantic annotation has no exact instance pointer');
      }
      if (mode === 'definition') {
        semanticDefinitions.add(value);
      } else {
        referencedDefinitions.add(value);
        const quantityKind = declaredKind(value);
        const space = value['x-tau-space'];
        const reference = value['x-tau-reference'];
        if (
          declaredUnit(value) !== undefined &&
          (typeof quantityKind === 'string' || typeof space === 'string' || typeof reference === 'string')
        ) {
          bindings[instancePointer] = {
            ...(typeof quantityKind === 'string' ? { quantityKind } : {}),
            ...(space === 'linear' || space === 'difference' || space === 'point' ? { space } : {}),
            ...(typeof reference === 'string' ? { reference } : {}),
          };
        }
      }
    }

    const projected: Record<string, unknown> = {};
    const { format } = value;
    const width = formatWidths && typeof format === 'string' && carrierWidths.has(format) ? format : undefined;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'pattern' || (key === 'format' && width !== undefined)) {
        continue;
      }
      if (key === '$schema' || key.startsWith('x-tau-') || key.startsWith('x-ogc-')) {
        continue;
      }
      if (key === 'dependencies') {
        if (!isRecord(child) || Object.values(child).some((dependency) => !Array.isArray(dependency))) {
          throw new TypeError('NATIVE_PROJECTION_UNSUPPORTED: schema-valued Draft-7 dependencies');
        }
        projected['dependentRequired'] = structuredClone(child);
        continue;
      }
      if (key === 'type') {
        projected[key] = draftTypeToNative(child, width);
        continue;
      }
      if (schemaMapKeywords.has(key) && isRecord(child)) {
        const entries = Object.entries(child).map(([name, schema]) => [
          name,
          visit({
            value: schema,
            mode: key === 'properties' ? mode : 'definition',
            instancePointer:
              key === 'properties' && mode === 'exact' ? `${instancePointer}/${escapePointer(name)}` : instancePointer,
            emit,
          }),
        ]);
        if (entries.length > 0) {
          projected[key === '$defs' ? 'definitions' : key] = Object.fromEntries(entries);
        }
        continue;
      }
      if (schemaArrayKeywords.has(key) && Array.isArray(child)) {
        projected[key] = child.map((schema) => visit({ value: schema, mode, instancePointer, emit }));
        continue;
      }
      if (schemaKeywords.has(key)) {
        if (key === 'items') {
          if (Array.isArray(child)) {
            const items = child.map((schema, index) =>
              visit({
                value: schema,
                mode,
                instancePointer: mode === 'exact' ? `${instancePointer}/${index}` : instancePointer,
                emit,
              }),
            );
            if (items.length > 0 && items.every((item) => JSON.stringify(item) === JSON.stringify(items[0]))) {
              projected[key] = items[0];
            } else if (items.length > 0) {
              throw new TypeError('NATIVE_PROJECTION_UNSUPPORTED: heterogeneous tuple items');
            }
          } else {
            projected[key] = visit({
              value: child,
              mode,
              instancePointer: mode === 'exact' ? `${instancePointer}/*` : instancePointer,
              emit,
            });
          }
          continue;
        }
        projected[key] = Array.isArray(child)
          ? child.map((schema) =>
              visit({
                value: schema,
                mode: 'unsupported',
                instancePointer,
                emit,
              }),
            )
          : visit({ value: child, mode: 'unsupported', instancePointer, emit });
        continue;
      }
      projected[key] = structuredClone(child);
    }
    const unit = declaredUnit(value);
    if (typeof unit === 'string') {
      projected['ucumUnit'] = unit;
    }
    const symbol = value['x-tau-symbol'];
    if (typeof symbol === 'string') {
      projected['symbol'] = symbol;
    }
    const symbols = value['x-tau-symbols'];
    if (isRecord(symbols)) {
      projected['symbols'] = structuredClone(symbols);
    }
    return emit ? projected : undefined;
  };

  const schema = visit({
    value: root,
    mode: 'exact',
    instancePointer: '',
    emit: true,
  });
  if (
    isRecord(schema) &&
    schema['type'] === undefined &&
    (Array.isArray(schema['anyOf']) || Array.isArray(schema['oneOf']))
  ) {
    schema['type'] = 'object';
  }
  for (const definition of semanticDefinitions) {
    if (!referencedDefinitions.has(definition)) {
      throw new TypeError('NATIVE_PROJECTION_UNSUPPORTED: semantic annotation in an unreferenced definition');
    }
  }
  return { schema: schema as Record<string, unknown>, bindings };
};

/**
 * Project admitted Draft-07 or 2020-12 schema data, as its `$schema` declares, and native defaults into a pinned
 * parameter declaration.
 * @param input - Schema data, defaults, and caller-owned stable schema identity.
 * @returns An admitted immutable native parameter declaration.
 * @public
 */
export const projectDraft7SchemaToParameterDeclaration = (
  input: Draft7ParameterDeclarationInput,
): ParameterDeclaration => {
  const { defaults, schema, schemaId, schemaName } = input;
  const schemaRecord = Object.fromEntries(Object.entries(schema));
  admitJsonSchema(withoutStringPatterns(schemaRecord));
  const projection = createProjection(schemaRecord);
  return admitParameterDeclaration({
    schema: {
      ...projection.schema,
      $schema: 'https://json-structure.org/meta/extended/v0/#',
      $id: schemaId,
      $uses: ['JSONSchemaUnits'],
      name: schemaName,
    },
    defaults,
    bindings: projection.bindings,
  });
};
