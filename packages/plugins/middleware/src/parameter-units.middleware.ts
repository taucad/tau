import { z } from 'zod';
import { compileParameterManifest } from '@taucad/runtime/parameter';
import type {
  JsonStructureSchema,
  ParameterDeclaration,
  ParameterManifest,
  ParameterProvenance,
} from '@taucad/runtime/parameter';
import { defineMiddleware } from '@taucad/runtime/middleware';

const rootResource = 'urn:taucad:parameter-schema:root';
const producer = '@taucad/middleware/parameterUnits';
const planeAngle = 'http://qudt.org/vocab/quantitykind/PlaneAngle';
const numericTypes = new Set([
  'decimal',
  'double',
  'float',
  'float8',
  'int8',
  'int16',
  'int32',
  'int64',
  'int128',
  'integer',
  'number',
  'uint8',
  'uint16',
  'uint32',
  'uint64',
  'uint128',
]);
const angleTokens = new Set([
  'angle',
  'angles',
  'angular',
  'rotation',
  'rotations',
  'tilt',
  'tilts',
  'twist',
  'twists',
]);
const degreeTokens = new Set(['degree', 'degrees', 'deg']);
const radianTokens = new Set(['radian', 'radians', 'rad']);
const ambiguousTokens = new Set([
  'amount',
  'color',
  'colour',
  'copies',
  'copy',
  'count',
  'energy',
  'frequency',
  'hex',
  'multiplier',
  'num',
  'number',
  'percent',
  'percentage',
  'quantity',
  'ratio',
  'scale',
  'strain',
  'torque',
]);

type BindingDeclaration = NonNullable<ParameterDeclaration['bindings']>[string];
type BindingDeclarations = Record<string, BindingDeclaration>;
type Visit = Readonly<{
  node: unknown;
  resource: string;
  schemaPointer: string;
  instancePointer: string;
  fieldName?: string;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const escapePointer = (value: string): string => value.replaceAll('~', '~0').replaceAll('/', '~1');
const resolvePointer = (schema: JsonStructureSchema, pointer: string): unknown => {
  let value: unknown = schema;
  for (const part of pointer === '' ? [] : pointer.slice(1).split('/')) {
    if (!isRecord(value)) {
      return undefined;
    }
    value = value[part.replaceAll('~1', '/').replaceAll('~0', '~')];
  }
  return value;
};
const resolveReference = (
  reference: string,
  currentResource: string,
): Readonly<{ resource: string; pointer: string }> => {
  if (reference.startsWith('#')) {
    return { resource: currentResource, pointer: reference.slice(1) };
  }
  const separator = reference.indexOf('#');
  return separator === -1
    ? { resource: reference, pointer: '' }
    : { resource: reference.slice(0, separator), pointer: reference.slice(separator + 1) };
};
const identifierTokens = (value: string): readonly string[] =>
  value
    .replaceAll(/([\da-z])([A-Z])/g, '$1 $2')
    .replaceAll(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z\d]+/u)
    .filter(Boolean)
    .map((token) => token.toLowerCase());
const hasToken = (tokens: readonly string[], candidates: ReadonlySet<string>): boolean =>
  tokens.some((token) => candidates.has(token));
const isNumericNode = (node: Record<string, unknown>): boolean => {
  const types = Array.isArray(node['type']) ? node['type'] : [node['type']];
  return types.some((type) => typeof type === 'string' && numericTypes.has(type));
};

const angleRule = (
  fieldName: string,
  angleDefault: 'deg' | 'rad',
): Readonly<{ unit: 'deg' | 'rad'; id: string }> | undefined => {
  const tokens = identifierTokens(fieldName);
  if (hasToken(tokens, ambiguousTokens)) {
    return undefined;
  }
  const degrees = hasToken(tokens, degreeTokens);
  const radians = hasToken(tokens, radianTokens);
  if (degrees && radians) {
    return undefined;
  }
  if (degrees) {
    return { unit: 'deg', id: 'angle-degree-token-v1' };
  }
  if (radians) {
    return { unit: 'rad', id: 'angle-radian-token-v1' };
  }
  return hasToken(tokens, angleTokens) ? { unit: angleDefault, id: 'angle-default-v1' } : undefined;
};

const provenance = (
  context: Readonly<{ manifest: ParameterManifest; profile: string; evidence: string }>,
  rule: string,
): Omit<ParameterProvenance, 'field'> => ({
  origin: 'inferred',
  producer,
  sourceRevision: context.manifest.source.revision,
  profile: context.profile,
  rule,
  evidence: context.evidence,
});

const inferAngle = ({
  visit,
  manifest,
  bindings,
  options,
}: Readonly<{
  visit: Visit;
  manifest: ParameterManifest;
  bindings: BindingDeclarations;
  options: Readonly<{ angleDefault: 'deg' | 'rad'; language: string }>;
}>): boolean => {
  if (!visit.fieldName || !isRecord(visit.node) || !isNumericNode(visit.node)) {
    return false;
  }
  const rule = angleRule(visit.fieldName, options.angleDefault);
  if (!rule) {
    return false;
  }
  const declared = bindings[visit.instancePointer] ?? {};
  const effective = manifest.bindings[visit.instancePointer];
  const unit = declared.unit ?? effective?.unit;
  const quantityKind = declared.quantityKind ?? effective?.quantityKind;
  const space = declared.space ?? effective?.space;
  const reference = declared.reference ?? effective?.reference;
  if (
    (unit !== undefined && unit !== 'deg' && unit !== 'rad') ||
    (quantityKind !== undefined && quantityKind !== planeAngle) ||
    (space !== undefined && space !== 'linear') ||
    reference !== undefined
  ) {
    return false;
  }

  const profile = `tau-parameter-units-01;manifest=${manifest.profile};language=${options.language};angle=${options.angleDefault}`;
  const evidence = `${visit.resource}#${visit.schemaPointer};instance=${visit.instancePointer};name=${visit.fieldName}`;
  const context = { manifest, profile, evidence };
  const inferredUnit = unit === undefined;
  const inferredKind = quantityKind === undefined;
  const inferredSpace = space === undefined;
  if (!inferredUnit && !inferredKind && !inferredSpace) {
    return false;
  }
  bindings[visit.instancePointer] = {
    ...declared,
    ...(inferredUnit ? { unit: rule.unit } : {}),
    ...(inferredKind ? { quantityKind: planeAngle } : {}),
    ...(inferredSpace ? { space: 'linear' } : {}),
    provenance: {
      ...declared.provenance,
      ...(inferredUnit ? { unit: provenance(context, `${rule.id}/unit`) } : {}),
      ...(inferredKind ? { quantityKind: provenance(context, `${rule.id}/quantity-kind`) } : {}),
      ...(inferredSpace ? { space: provenance(context, `${rule.id}/space`) } : {}),
    },
  };
  return true;
};

const inferBindings = (
  manifest: ParameterManifest,
  options: Readonly<{ angleDefault: 'deg' | 'rad'; language: string }>,
): BindingDeclarations | undefined => {
  const resources: Readonly<Record<string, JsonStructureSchema>> = {
    [rootResource]: manifest.schema,
    ...manifest.resources,
  };
  const bindings: BindingDeclarations = structuredClone(manifest.bindingDeclarations);
  const pending: Visit[] = [{ node: manifest.schema, resource: rootResource, schemaPointer: '', instancePointer: '' }];
  const visited = new Set<string>();
  let changed = false;
  while (pending.length > 0) {
    const visit = pending.pop()!;
    if (!isRecord(visit.node)) {
      continue;
    }
    const reference = visit.node['$ref'];
    if (typeof reference === 'string') {
      const target = resolveReference(reference, visit.resource);
      const resource = resources[target.resource];
      const node = resource && resolvePointer(resource, target.pointer);
      const key = `${target.resource}#${target.pointer}\0${visit.instancePointer}`;
      if (node !== undefined && !visited.has(key)) {
        visited.add(key);
        pending.push({ ...visit, node, resource: target.resource, schemaPointer: target.pointer });
      }
      continue;
    }
    const types = Array.isArray(visit.node['type']) ? visit.node['type'] : [visit.node['type']];
    for (const type of types) {
      if (!isRecord(type) || typeof type['$ref'] !== 'string') {
        continue;
      }
      const target = resolveReference(type['$ref'], visit.resource);
      const resource = resources[target.resource];
      const node = resource && resolvePointer(resource, target.pointer);
      const key = `${target.resource}#${target.pointer}\0${visit.instancePointer}`;
      if (node !== undefined && !visited.has(key)) {
        visited.add(key);
        pending.push({ ...visit, node, resource: target.resource, schemaPointer: target.pointer });
      }
    }
    changed = inferAngle({ visit, manifest, bindings, options }) || changed;
    if (!isRecord(visit.node['properties'])) {
      continue;
    }
    for (const [name, node] of Object.entries(visit.node['properties'])) {
      pending.push({
        node,
        resource: visit.resource,
        schemaPointer: `${visit.schemaPointer}/properties/${escapePointer(name)}`,
        instancePointer: `${visit.instancePointer}/${escapePointer(name)}`,
        fieldName: name,
      });
    }
  }
  return changed ? bindings : undefined;
};

/** Infer bounded parameter-unit semantics while preserving producer values and declarations. @public */
export const parameterUnits = defineMiddleware({
  id: 'parameterUnits',
  name: 'ParameterUnits',
  version: '1.0.0',
  optionsSchema: z.object({
    angleDefault: z.enum(['deg', 'rad']).default('deg'),
  }),

  async wrapGetParameters(input, handler, { options }) {
    const result = await handler(input);
    if (!result.success || input.resolution?.mode === 'declared-only') {
      return result;
    }
    const language = input.resolution?.inferenceLanguage ?? 'en';
    if (!/^en(?:-|$)/iu.test(language)) {
      return result;
    }
    const bindings = inferBindings(result.data, { angleDefault: options.angleDefault, language });
    if (!bindings) {
      return result;
    }
    const manifest = result.data;
    return {
      ...result,
      data: await compileParameterManifest({
        declaration: {
          schema: manifest.schema,
          resources: manifest.resources,
          defaults: manifest.defaults,
          bindings,
        },
        scope: manifest.scope,
        source: manifest.source,
        dependency: manifest.identity.dependency,
        middleware: manifest.identity.middleware,
        resolution: manifest.identity.resolution,
      }),
    };
  },
});
