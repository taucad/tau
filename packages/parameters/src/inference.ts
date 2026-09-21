import { compileParameterManifest, rootResource } from '#manifest.js';
import type { JsonStructureSchema, ParameterDeclaration, ParameterManifest, ParameterProvenance } from '#manifest.js';
import { admitUnit } from '@taucad/units/unit';

const producer = '@taucad/middleware/parameterUnits';
const qudt = 'http://qudt.org/vocab/quantitykind/';
const quantityKinds = {
  depth: `${qudt}Depth`,
  diameter: `${qudt}Diameter`,
  distance: `${qudt}Distance`,
  height: `${qudt}Height`,
  length: `${qudt}Length`,
  planeAngle: `${qudt}PlaneAngle`,
  radius: `${qudt}Radius`,
  width: `${qudt}Width`,
} as const;
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
const genericLengthTokens = new Set(['clearance', 'gap', 'length', 'thickness']);
const compoundSizeTokens = new Set(['cell']);
const lengthKinds = new Set<string>([
  quantityKinds.depth,
  quantityKinds.diameter,
  quantityKinds.distance,
  quantityKinds.height,
  quantityKinds.length,
  quantityKinds.radius,
  quantityKinds.width,
]);
const specificLengthKinds = new Map<string, string>([
  ['depth', quantityKinds.depth],
  ['diameter', quantityKinds.diameter],
  ['distance', quantityKinds.distance],
  ['height', quantityKinds.height],
  ['radius', quantityKinds.radius],
  ['width', quantityKinds.width],
]);
const nonGeometricLengthTokens = new Set(['bit', 'color', 'colour', 'pixel', 'tree']);
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
type InferenceRule = Readonly<{
  family: 'angle' | 'length';
  unit: 'deg' | 'rad' | 'mm';
  quantityKind: string;
  id: string;
}>;
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
    : {
        resource: reference.slice(0, separator),
        pointer: reference.slice(separator + 1),
      };
};
const identifierTokens = (value: string): readonly string[] =>
  value
    .replaceAll(/([\da-z])([A-Z])/g, '$1 $2')
    .replaceAll(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replaceAll(/([A-Za-z])(\d)/g, '$1 $2')
    .replaceAll(/(\d)([A-Za-z])/g, '$1 $2')
    .split(/[^A-Za-z\d]+/u)
    .filter(Boolean)
    .map((token) => token.toLowerCase());
const hasToken = (tokens: readonly string[], candidates: ReadonlySet<string>): boolean =>
  tokens.some((token) => candidates.has(token));
const hasFamilyDimension = (unit: string, family: InferenceRule['family']): boolean => {
  const admitted = admitUnit(unit);
  if (admitted.status !== 'success') {
    return false;
  }
  return Object.entries(admitted.value.dimension).every(
    ([dimension, exponent]) => exponent === (dimension === family ? 1 : 0),
  );
};
const isNumericNode = (node: Record<string, unknown>): boolean => {
  const types = Array.isArray(node['type']) ? node['type'] : [node['type']];
  return types.some((type) => typeof type === 'string' && numericTypes.has(type));
};

const angleRule = (tokens: readonly string[], angleDefault: 'deg' | 'rad'): InferenceRule | undefined => {
  const degrees = hasToken(tokens, degreeTokens);
  const radians = hasToken(tokens, radianTokens);
  if (degrees && radians) {
    return undefined;
  }
  if (degrees) {
    return {
      family: 'angle',
      unit: 'deg',
      quantityKind: quantityKinds.planeAngle,
      id: 'angle-degree-token-v1',
    };
  }
  if (radians) {
    return {
      family: 'angle',
      unit: 'rad',
      quantityKind: quantityKinds.planeAngle,
      id: 'angle-radian-token-v1',
    };
  }
  return hasToken(tokens, angleTokens)
    ? {
        family: 'angle',
        unit: angleDefault,
        quantityKind: quantityKinds.planeAngle,
        id: 'angle-default-v1',
      }
    : undefined;
};

const lengthRule = (tokens: readonly string[]): InferenceRule | undefined => {
  if (hasToken(tokens, nonGeometricLengthTokens)) {
    return undefined;
  }
  const kinds = new Set(tokens.map((token) => specificLengthKinds.get(token)).filter((kind) => kind !== undefined));
  if (kinds.size > 1) {
    return undefined;
  }
  const specificKind = kinds.values().next().value;
  if (specificKind) {
    return {
      family: 'length',
      unit: 'mm',
      quantityKind: specificKind,
      id: `length-${tokens.find((token) => specificLengthKinds.has(token))!}-token-v1`,
    };
  }
  const genericToken = tokens.find((token) => genericLengthTokens.has(token));
  if (genericToken) {
    return {
      family: 'length',
      unit: 'mm',
      quantityKind: quantityKinds.length,
      id: `length-${genericToken}-token-v1`,
    };
  }
  return tokens.includes('size') && hasToken(tokens, compoundSizeTokens)
    ? {
        family: 'length',
        unit: 'mm',
        quantityKind: quantityKinds.length,
        id: 'length-cell-size-v1',
      }
    : undefined;
};

const inferenceRule = (fieldName: string, angleDefault: 'deg' | 'rad'): InferenceRule | undefined => {
  const tokens = identifierTokens(fieldName);
  if (hasToken(tokens, ambiguousTokens)) {
    return undefined;
  }
  const degreeEvidence = hasToken(tokens, degreeTokens);
  const radianEvidence = hasToken(tokens, radianTokens);
  const angleEvidence = degreeEvidence || radianEvidence || hasToken(tokens, angleTokens);
  const specificLengthEvidence = new Set(
    tokens.map((token) => specificLengthKinds.get(token)).filter((kind) => kind !== undefined),
  );
  const lengthEvidence =
    !hasToken(tokens, nonGeometricLengthTokens) &&
    (specificLengthEvidence.size > 0 ||
      hasToken(tokens, genericLengthTokens) ||
      (tokens.includes('size') && hasToken(tokens, compoundSizeTokens)));
  if (degreeEvidence && radianEvidence) {
    return undefined;
  }
  if (specificLengthEvidence.size > 1) {
    return undefined;
  }
  if (angleEvidence && lengthEvidence) {
    return undefined;
  }
  const candidates = [angleRule(tokens, angleDefault), lengthRule(tokens)].filter(
    (candidate): candidate is InferenceRule => candidate !== undefined,
  );
  return candidates.length === 1 ? candidates[0] : undefined;
};

const provenance = (
  context: Readonly<{
    manifest: ParameterManifest;
    profile: string;
    evidence: string;
  }>,
  rule: string,
): Omit<ParameterProvenance, 'field'> => ({
  origin: 'inferred',
  producer,
  sourceRevision: context.manifest.source.revision,
  profile: context.profile,
  rule,
  evidence: context.evidence,
});

const inferVisit = ({
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
  const rule = inferenceRule(visit.fieldName, options.angleDefault);
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
    (unit !== undefined && !hasFamilyDimension(unit, rule.family)) ||
    (quantityKind !== undefined &&
      (rule.family === 'angle' ? quantityKind !== quantityKinds.planeAngle : !lengthKinds.has(quantityKind))) ||
    (space !== undefined && space !== 'linear') ||
    reference !== undefined
  ) {
    return false;
  }

  const profile = `tau-parameter-units-03;manifest=${manifest.profile};language=${options.language};length=mm;angle=${options.angleDefault}`;
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
    ...(inferredKind ? { quantityKind: rule.quantityKind } : {}),
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
  const pending: Visit[] = [
    {
      node: manifest.schema,
      resource: rootResource,
      schemaPointer: '',
      instancePointer: '',
    },
  ];
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
        pending.push({
          ...visit,
          node,
          resource: target.resource,
          schemaPointer: target.pointer,
        });
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
        pending.push({
          ...visit,
          node,
          resource: target.resource,
          schemaPointer: target.pointer,
        });
      }
    }
    changed = inferVisit({ visit, manifest, bindings, options }) || changed;
    const { properties, items } = visit.node;
    if (isRecord(properties)) {
      for (const [name, node] of Object.entries(properties)) {
        pending.push({
          node,
          resource: visit.resource,
          schemaPointer: `${visit.schemaPointer}/properties/${escapePointer(name)}`,
          instancePointer: `${visit.instancePointer}/${escapePointer(name)}`,
          fieldName: name,
        });
      }
    }
    if (isRecord(items)) {
      pending.push({
        node: items,
        resource: visit.resource,
        schemaPointer: `${visit.schemaPointer}/items`,
        instancePointer: `${visit.instancePointer}/*`,
        fieldName: visit.fieldName,
      });
    } else if (Array.isArray(items)) {
      for (const [index, node] of items.entries()) {
        pending.push({
          node,
          resource: visit.resource,
          schemaPointer: `${visit.schemaPointer}/items/${index}`,
          instancePointer: `${visit.instancePointer}/${index}`,
          fieldName: visit.fieldName,
        });
      }
    }
  }
  return changed ? bindings : undefined;
};

/** Apply the versioned English inference rules while preserving native values and declared metadata. @public */
export const inferParameterManifest = async (
  manifest: ParameterManifest,
  options: Readonly<{ angleDefault?: 'deg' | 'rad'; language?: string }> = {},
): Promise<ParameterManifest> => {
  const language = options.language ?? manifest.identity.resolution.inferenceLanguage ?? 'en';
  if (manifest.identity.resolution.mode === 'declared-only' || !/^en(?:-|$)/iu.test(language)) {
    return manifest;
  }
  const bindings = inferBindings(manifest, { language, angleDefault: options.angleDefault ?? 'deg' });
  if (bindings === undefined) {
    return manifest;
  }
  return compileParameterManifest({
    declaration: { schema: manifest.schema, resources: manifest.resources, defaults: manifest.defaults, bindings },
    scope: manifest.scope,
    source: manifest.source,
    dependency: manifest.identity.dependency,
    middleware: manifest.identity.middleware,
    resolution: manifest.identity.resolution,
    sourceFiles: manifest.identity.sourceFiles,
  });
};
