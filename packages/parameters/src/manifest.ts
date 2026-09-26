import { InstanceValidator, SchemaValidator } from '@json-structure/sdk';
import type { JsonValue, ValidationError } from '@json-structure/sdk';
import { canonicalizeCacheValue, digestContent } from '@taucad/cache-core';
import type { CacheValue, ContentDigest } from '@taucad/cache-core';
import { admitUnit, unitProfile } from '@taucad/units/unit';
import { quantityKinds, quantityReferences } from '@taucad/units/quantity';
import type { JSONSchema7 } from '@taucad/json-schema';
import { admitJsonSchema } from '#schema-admission.js';
import { cloneBoundedJson } from '#bounded-json.js';

/** Native JSON Structure Core -04 schema data. @public */
export type JsonStructureSchema = Readonly<Record<string, unknown>>;

/** Runtime-supported semantic resolution settings. @public */
export type ParameterResolutionOptions = Readonly<{
  mode?: 'default' | 'declared-only';
  profile?: typeof unitProfile;
  inferenceLanguage?: string;
  projectBindingDigest?: ContentDigest;
  sourceUnitDigest?: ContentDigest;
}>;

/** Identity of the authority that owns a parameter record. @public */
export type ParameterScope =
  | Readonly<{
      kind: 'source';
      authority: string;
      root: string;
      checkout?: string;
      entry: string;
    }>
  | Readonly<{
      kind: 'provider';
      provider: string;
      configuration: string;
    }>;

/** Source identity and declaration capability supplied by a parameter producer. @public */
export type ParameterSource = Readonly<{
  id: string;
  version: string;
  revision: string;
  capability: 'json-structure' | 'none';
}>;

/** Stable or explicitly revision-scoped identity for one parameter. @public */
export type ParameterIdentity = Readonly<{
  value: string;
  stability: 'stable' | 'revision-scoped';
}>;

/** Runtime semantic binding for one JSON instance pointer. @public */
export type ParameterBinding = Readonly<{
  parameter: ParameterIdentity;
  schema: Readonly<{ resource: string; pointer: string }>;
  representation: 'binary64' | 'safe-integer' | 'decimal';
  optional: boolean;
  nullable: boolean;
  unit?: string;
  quantityKind?: string;
  space?: 'linear' | 'difference' | 'point';
  reference?: string;
  symbol?: string;
  symbols?: Readonly<Record<string, string>>;
  sourceUnitCapability?: string;
  constraints: Readonly<Record<string, unknown>>;
}>;

/** Independent provenance for one semantic claim. @public */
export type ParameterProvenance = Readonly<{
  field: 'unit' | 'quantity-kind' | 'space' | 'reference' | 'producer' | 'source-revision';
  origin: 'declared' | 'project' | 'inferred' | 'derived';
  producer: string;
  sourceRevision: string;
  profile?: string;
  rule?: string;
  evidence?: string;
}>;

/** Structured manifest diagnostic with stable source and instance locations. @public */
export type ParameterDiagnostic = Readonly<{
  code:
    | 'INVALID_SCHEMA'
    | 'INVALID_ANNOTATION'
    | 'INVALID_REFERENCE'
    | 'RESOURCE_LIMIT'
    | 'METADATA_CONFLICT'
    | 'SEMANTICS_UNRESOLVED'
    | 'REPRESENTATION_UNSUPPORTED'
    | 'LEGACY_PROJECTION_LOSS';
  message: string;
  severity: 'error' | 'warning';
  resource: string;
  schemaPointer: string;
  instancePointer?: string;
  parameterId?: string;
  expected?: unknown;
  actual?: unknown;
}>;

/** Producer-authored native schema plus optional runtime semantic declarations. @public */
export type ParameterDeclaration = Readonly<{
  schema: JsonStructureSchema;
  resources?: Readonly<Record<string, JsonStructureSchema>>;
  defaults: Readonly<Record<string, unknown>>;
  bindings?: Readonly<
    Record<
      string,
      Readonly<{
        parameterId?: string;
        unit?: string;
        quantityKind?: string;
        space?: 'linear' | 'difference' | 'point';
        reference?: string;
        sourceUnitCapability?: string;
        provenance?: Readonly<
          Partial<Record<'unit' | 'quantityKind' | 'space' | 'reference', Omit<ParameterProvenance, 'field'>>>
        >;
      }>
    >
  >;
}>;

/** Complete effective native parameter manifest carried across the runtime boundary. @public */
export type ParameterManifest = Readonly<{
  version: 1;
  profile: typeof unitProfile;
  dialect: Readonly<{
    core: '-04';
    units: '-03';
    activation: 'JSONSchemaUnits';
  }>;
  schema: JsonStructureSchema;
  resources: Readonly<Record<string, JsonStructureSchema>>;
  defaults: Readonly<Record<string, unknown>>;
  bindingDeclarations: NonNullable<ParameterDeclaration['bindings']>;
  bindings: Readonly<Record<string, ParameterBinding>>;
  provenance: Readonly<Record<string, ParameterProvenance>>;
  diagnostics: readonly ParameterDiagnostic[];
  legacyProjection: ParameterLegacyProjection;
  scope: ParameterScope;
  source: ParameterSource;
  identity: Readonly<{
    dependency: ContentDigest;
    middleware: ContentDigest;
    resolution: ParameterResolutionOptions;
    sourceFiles: Readonly<Record<string, ContentDigest | 'missing'>>;
  }>;
  revision: ContentDigest;
}>;

/** Explicit status of the temporary Draft-7/OGC parameter view. @public */
export type ParameterLegacyProjection =
  | Readonly<{
      status: 'usable';
      dialect: 'draft-07';
      schema: JSONSchema7;
      diagnostics: readonly ParameterDiagnostic[];
    }>
  | Readonly<{
      status: 'unsupported';
      dialect: 'draft-07';
      diagnostics: readonly ParameterDiagnostic[];
    }>;

/** Trusted execution identity used when admitting middleware or cache output. @public */
export type ParameterAdmissionExpectation = Readonly<{
  scope: ParameterScope;
  source: ParameterSource;
  identity: ParameterManifest['identity'];
  producerDeclaration: ParameterDeclaration;
}>;

/** Inputs owned by the runtime when compiling a producer declaration. @public */
export type CompileParameterManifestInput = Readonly<{
  declaration: ParameterDeclaration;
  scope: ParameterScope;
  source: ParameterSource;
  dependency: ContentDigest;
  middleware: ContentDigest;
  resolution?: ParameterResolutionOptions;
  sourceFiles?: Readonly<Record<string, ContentDigest | 'missing'>>;
}>;

const limits = {
  code: 'PARAMETER_MANIFEST',
  maximumDepth: 64,
  maximumNodes: 10_000,
  maximumCharacters: 1_000_000,
} as const;
const profile = unitProfile;
const schemaUri = 'https://json-structure.org/meta/extended/v0/#';
/** The resource every parameter schema root is addressed by; module-internal, never a caller's word. @internal */
export const rootResource = 'urn:taucad:parameter-schema:root';
const contentDigestPattern = /^sha256:[0-9a-f]{64}$/u;
const decimalLexicalPattern = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/u;
const numericTypes = new Set([
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
const integerTypes = new Set([
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
]);
const constraintKeys = [
  'const',
  'default',
  'enum',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'examples',
] as const;
const symbolToUcum = new Map<string, string>([
  ['m', 'm'],
  ['mm', 'mm'],
  ['cm', 'cm'],
  ['km', 'km'],
  ['s', 's'],
  ['kg', 'kg'],
  ['K', 'K'],
  ['A', 'A'],
  ['mol', 'mol'],
  ['cd', 'cd'],
  ['rad', 'rad'],
  ['°', 'deg'],
  ['°C', 'Cel'],
]);
const knownKinds = new Set<string>(Object.values(quantityKinds));
const knownReferences = new Set<string>(Object.values(quantityReferences));

/** Pinned public parameter manifest profile. @public */
export const parameterManifestProfile = profile;
const projectionKeywords = new Set([
  '$comment',
  '$id',
  '$ref',
  'additionalProperties',
  'allOf',
  'anyOf',
  'const',
  'default',
  'definitions',
  'description',
  'else',
  'enum',
  'examples',
  'exclusiveMaximum',
  'exclusiveMinimum',
  'if',
  'items',
  'maximum',
  'minimum',
  'multipleOf',
  'not',
  'oneOf',
  'properties',
  'required',
  'then',
  'title',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const assertOnlyKeys = (value: Record<string, unknown>, allowed: ReadonlySet<string>, pointer: string): void => {
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown !== undefined) {
    fail(
      diagnostic(
        'INVALID_SCHEMA',
        `unsupported metadata ${unknown}`,
        rootResource,
        `${pointer}/${escapePointer(unknown)}`,
      ),
    );
  }
};
const escapePointer = (value: string): string => value.replaceAll('~', '~0').replaceAll('/', '~1');
const isPointer = (value: string): boolean => value === '' || (value.startsWith('/') && !/~(?![01])/u.test(value));
const qualify = (resource: string, pointer: string): string => `${resource}#${pointer}`;

const qualifyBindingClaim = (
  location: Readonly<{
    resource: string;
    schemaPointer: string;
    instancePointer: string;
  }>,
  field: 'unit' | 'quantityKind' | 'space' | 'reference',
): string =>
  `${qualify(location.resource, location.schemaPointer)}/@binding/${escapePointer(location.instancePointer)}/@${field}`;

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const assertProvenanceRecord = (provenance: Record<string, unknown>, pointer: string): void => {
  if (
    !['declared', 'project', 'inferred', 'derived'].includes(String(provenance['origin'])) ||
    !isNonEmptyString(provenance['producer']) ||
    !isNonEmptyString(provenance['sourceRevision']) ||
    (provenance['profile'] !== undefined && !isNonEmptyString(provenance['profile'])) ||
    (provenance['rule'] !== undefined && !isNonEmptyString(provenance['rule'])) ||
    (provenance['evidence'] !== undefined && !isNonEmptyString(provenance['evidence'])) ||
    (provenance['origin'] === 'inferred' &&
      (!isNonEmptyString(provenance['profile']) ||
        !isNonEmptyString(provenance['rule']) ||
        !isNonEmptyString(provenance['evidence']))) ||
    (provenance['origin'] === 'project' && !isNonEmptyString(provenance['evidence']))
  ) {
    fail(diagnostic('INVALID_ANNOTATION', 'invalid parameter provenance declaration', rootResource, pointer));
  }
};

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
};

// oxlint-disable-next-line max-params -- diagnostics carry a fixed code/message/resource/pointer tuple plus optional details.
const diagnostic = (
  code: ParameterDiagnostic['code'],
  message: string,
  resource: string,
  schemaPointer: string,
  details: Partial<ParameterDiagnostic> = {},
): ParameterDiagnostic => ({
  code,
  message,
  severity: 'error',
  resource,
  schemaPointer,
  ...details,
});

/** Error raised when a native declaration or effective manifest fails admission. @public */
export class ParameterAdmissionError extends TypeError {
  public readonly diagnostics: readonly ParameterDiagnostic[];

  public constructor(diagnostics: readonly ParameterDiagnostic[]) {
    super(diagnostics.map(({ code, schemaPointer }) => `${code} at ${schemaPointer || '/'}`).join('; '));
    this.name = 'ParameterAdmissionError';
    this.diagnostics = diagnostics;
  }
}

const fail = (item: ParameterDiagnostic): never => {
  throw new ParameterAdmissionError([item]);
};

const asCacheValue = (value: unknown): CacheValue => {
  canonicalizeCacheValue({ value: value as CacheValue });
  return value as CacheValue;
};

const copySchemaForSdk = (schema: JsonStructureSchema): JsonValue => {
  const copy = structuredClone(schema) as Record<string, unknown>;
  const pending: unknown[] = [copy];
  while (pending.length > 0) {
    const value = pending.pop();
    if (!isRecord(value) && !Array.isArray(value)) {
      continue;
    }
    if (isRecord(value)) {
      const uses = value['$uses'];
      if (Array.isArray(uses)) {
        value['$uses'] = uses.map((entry: unknown) => (entry === 'JSONSchemaUnits' ? 'JSONStructureUnits' : entry));
      }
    }
    const children: unknown[] = Array.isArray(value) ? (value as unknown[]) : Object.values(value);
    pending.push(...children);
  }
  return copy as JsonValue;
};

const validateSymbols = (node: Record<string, unknown>, resource: string, pointer: string): void => {
  if ('symbol' in node && (typeof node['symbol'] !== 'string' || node['symbol'].length === 0)) {
    fail(diagnostic('INVALID_ANNOTATION', 'symbol must be a non-empty string', resource, `${pointer}/symbol`));
  }
  if (!('symbols' in node)) {
    return;
  }
  const { symbols } = node;
  if (!isRecord(symbols)) {
    fail(diagnostic('INVALID_ANNOTATION', 'symbols must be an object', resource, `${pointer}/symbols`));
  }
  const symbolRecord = symbols as Record<string, unknown>;
  for (const [key, value] of Object.entries(symbolRecord)) {
    let languageValid = key === 'default';
    if (key.startsWith('lang:')) {
      try {
        languageValid = Intl.getCanonicalLocales(key.slice(5)).length === 1;
      } catch {
        languageValid = false;
      }
    }
    if (!languageValid || typeof value !== 'string' || value.length === 0) {
      fail(
        diagnostic(
          'INVALID_ANNOTATION',
          'symbols entries require default or lang:BCP47 string values',
          resource,
          `${pointer}/symbols/${escapePointer(key)}`,
        ),
      );
    }
  }
};

const nodeTypes = (node: Record<string, unknown>): readonly string[] => {
  const { type } = node;
  if (typeof type === 'string') {
    return [type];
  }
  if (!Array.isArray(type)) {
    return [];
  }
  return type.flatMap((entry) => {
    if (typeof entry === 'string') {
      return [entry];
    }
    return isRecord(entry) && typeof entry['$ref'] === 'string' ? [] : ['<invalid>'];
  });
};

const validateUnit = (
  node: Record<string, unknown>,
  resource: string,
  pointer: string,
): Readonly<{ code?: string; derived: boolean }> => {
  validateSymbols(node, resource, pointer);
  const declaredUnit = node['unit'];
  const declaredUcum = node['ucumUnit'];
  if (declaredUnit === undefined && declaredUcum === undefined) {
    return { derived: false };
  }
  if (declaredUnit !== undefined && (typeof declaredUnit !== 'string' || declaredUnit.length === 0)) {
    fail(diagnostic('INVALID_ANNOTATION', 'unit must be a non-empty BIPM symbol string', resource, `${pointer}/unit`));
  }
  if (declaredUcum !== undefined && typeof declaredUcum !== 'string') {
    fail(diagnostic('INVALID_ANNOTATION', 'ucumUnit must be a string', resource, `${pointer}/ucumUnit`));
  }
  const types = nodeTypes(node);
  if (types.length === 0 || types.some((type) => type !== 'null' && !numericTypes.has(type))) {
    fail(
      diagnostic(
        'INVALID_ANNOTATION',
        'unit annotations require a numeric or nullable numeric type',
        resource,
        pointer,
      ),
    );
  }
  const mapped = typeof declaredUnit === 'string' ? symbolToUcum.get(declaredUnit) : undefined;
  if (declaredUnit !== undefined && mapped === undefined) {
    fail(
      diagnostic('INVALID_ANNOTATION', 'unit symbol has no reviewed UCUM mapping', resource, `${pointer}/unit`, {
        actual: declaredUnit,
      }),
    );
  }
  if (typeof declaredUcum === 'string' && mapped !== undefined && declaredUcum !== mapped) {
    fail(
      diagnostic('METADATA_CONFLICT', 'unit and ucumUnit declarations disagree', resource, pointer, {
        expected: mapped,
        actual: declaredUcum,
      }),
    );
  }
  const code = typeof declaredUcum === 'string' ? declaredUcum : mapped;
  if (code !== undefined) {
    const admitted = admitUnit(code);
    if (admitted.status !== 'success') {
      fail(
        diagnostic('INVALID_ANNOTATION', admitted.diagnostic.message, resource, `${pointer}/ucumUnit`, {
          actual: code,
        }),
      );
    }
  }
  return { code, derived: declaredUcum === undefined && mapped !== undefined };
};

const sdkDiagnostics = (errors: readonly ValidationError[], resource: string): ParameterDiagnostic[] =>
  errors.map((error) => diagnostic('INVALID_SCHEMA', error.message, resource, error.path.replace(/^#/u, '')));

const validateSchema = (
  schema: JsonStructureSchema,
  resources: Readonly<Record<string, JsonStructureSchema>>,
  resource: string,
): void => {
  if (schema['$schema'] !== schemaUri) {
    fail(diagnostic('INVALID_SCHEMA', `expected pinned schema ${schemaUri}`, resource, '/$schema'));
  }
  const uses = schema['$uses'];
  if (!Array.isArray(uses) || !uses.includes('JSONSchemaUnits') || uses.includes('JSONStructureUnits')) {
    fail(diagnostic('INVALID_SCHEMA', 'expected public JSONSchemaUnits activation', resource, '/$uses'));
  }
  const enabled = uses as unknown[];
  if (enabled.some((value) => value !== 'JSONSchemaUnits')) {
    fail(diagnostic('INVALID_SCHEMA', 'unsupported required schema extension', resource, '/$uses'));
  }
  const external = new Map<string, JsonValue>(
    Object.entries(resources).map(([uri, value]) => [uri, copySchemaForSdk(value)]),
  );
  const result = new SchemaValidator({
    extended: true,
    allowImport: true,
    externalSchemas: external,
  }).validate(copySchemaForSdk(schema));
  if (!result.isValid) {
    throw new ParameterAdmissionError(sdkDiagnostics(result.errors, resource));
  }
};

const validateDefaults = (declaration: ParameterDeclaration): void => {
  if (Object.keys(declaration.defaults).length === 0) {
    return;
  }
  const suppliedResources: Readonly<Record<string, JsonStructureSchema>> = {
    [rootResource]: declaration.schema,
    ...declaration.resources,
  };
  let referenceCount = 0;
  const inlineExternalReferences = (value: unknown, currentResource: string): unknown => {
    if (Array.isArray(value)) {
      return value.map((child) => inlineExternalReferences(child, currentResource));
    }
    if (!isRecord(value)) {
      return value;
    }
    if (typeof value['$ref'] === 'string' && !value['$ref'].startsWith('#')) {
      referenceCount += 1;
      if (referenceCount > 256) {
        fail(
          diagnostic(
            'RESOURCE_LIMIT',
            'reference traversal limit exceeded while validating defaults',
            currentResource,
            '',
          ),
        );
      }
      const target = parseReference(value['$ref'], currentResource);
      const targetSchema = suppliedResources[target.resource];
      const targetNode = targetSchema && resolvePointer(targetSchema, target.pointer);
      if (!targetSchema || !isRecord(targetNode)) {
        fail(
          diagnostic('INVALID_REFERENCE', 'default validation reference target is unavailable', currentResource, ''),
        );
      }
      return inlineExternalReferences(targetNode, target.resource);
    }
    const typeReference = value['type'];
    if (
      isRecord(typeReference) &&
      typeof typeReference['$ref'] === 'string' &&
      !typeReference['$ref'].startsWith('#')
    ) {
      const resolvedType = inlineExternalReferences(typeReference, currentResource);
      const remainder = { ...value };
      delete remainder['type'];
      return {
        ...(isRecord(resolvedType) ? resolvedType : {}),
        ...(inlineExternalReferences(remainder, currentResource) as Record<string, unknown>),
      };
    }
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      output[key] = inlineExternalReferences(child, currentResource);
    }
    return output;
  };
  const allowPartialValues = (value: JsonValue): JsonValue => {
    if (Array.isArray(value)) {
      return value.map((child) => allowPartialValues(child));
    }
    if (!isRecord(value)) {
      return value;
    }
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, child]) =>
        key === 'required' && Array.isArray(child) ? [] : [[key, allowPartialValues(child)]],
      ),
    );
  };
  const schema = allowPartialValues(
    copySchemaForSdk(inlineExternalReferences(declaration.schema, rootResource) as JsonStructureSchema),
  );
  const external = new Map<string, JsonValue>(
    Object.entries(declaration.resources ?? {}).map(([uri, value]) => [uri, copySchemaForSdk(value)]),
  );
  const result = new InstanceValidator({
    extended: true,
    allowImport: true,
    externalSchemas: external,
    maxValidationDepth: 64,
  }).validate(structuredClone(declaration.defaults) as JsonValue, schema);
  if (!result.isValid) {
    throw new ParameterAdmissionError(
      result.errors.map((error) =>
        diagnostic('INVALID_SCHEMA', `default value: ${error.message}`, rootResource, error.path.replace(/^#/u, '')),
      ),
    );
  }
  const tables = deriveManifestTables(declaration, {
    id: 'parameter-default-admission',
    version: profile,
    revision: 'admission',
    capability: 'json-structure',
  });
  for (const [pointer, binding] of Object.entries(tables.bindings)) {
    const value = resolvePointer(declaration.defaults, pointer);
    const bindingSchema = suppliedResources[binding.schema.resource];
    const bindingNode = bindingSchema && resolvePointer(bindingSchema, binding.schema.pointer);
    if (
      value !== undefined &&
      isRecord(bindingNode) &&
      nodeTypes(bindingNode).includes('integer') &&
      !Number.isSafeInteger(value)
    ) {
      fail(
        diagnostic('INVALID_SCHEMA', 'default value: integer exceeds safe execution range', rootResource, '', {
          instancePointer: pointer,
          actual: value,
        }),
      );
    }
    if (
      value !== undefined &&
      binding.representation === 'decimal' &&
      (typeof value !== 'string' || !decimalLexicalPattern.test(value))
    ) {
      fail(
        diagnostic('INVALID_SCHEMA', 'default value: invalid decimal lexical representation', rootResource, '', {
          instancePointer: pointer,
          actual: value,
        }),
      );
    }
  }
};

/** Validate a partial parameter value object with the same pinned SDK/profile used for producer defaults. @public */
export const admitParameterValues = (manifest: ParameterManifest, values: Readonly<Record<string, unknown>>): void => {
  const defaults = cloneBoundedJson(values, limits);
  const admittedDefaults = isRecord(defaults)
    ? defaults
    : fail(diagnostic('INVALID_SCHEMA', 'parameter values must be an object', rootResource, ''));
  validateDefaults({
    schema: manifest.schema,
    resources: manifest.resources,
    defaults: admittedDefaults,
    bindings: manifest.bindingDeclarations,
  });
};

type Visit = Readonly<{
  node: unknown;
  resource: string;
  schemaPointer: string;
  instancePointer: string;
  optional: boolean;
  nullable: boolean;
}>;

const resolvePointer = (schema: JsonStructureSchema, pointer: string): unknown => {
  let value: unknown = schema;
  if (pointer === '') {
    return value;
  }
  if (!pointer.startsWith('/') || /~(?![01])/u.test(pointer)) {
    return undefined;
  }
  for (const encoded of pointer.slice(1).split('/')) {
    const segment = encoded.replaceAll('~1', '/').replaceAll('~0', '~');
    if (Array.isArray(value)) {
      if (!/^(?:0|[1-9]\d*)$/u.test(segment) || Number(segment) >= value.length) {
        return undefined;
      }
      value = value[Number(segment)];
      continue;
    }
    if (!isRecord(value) || !Object.hasOwn(value, segment)) {
      return undefined;
    }
    value = value[segment];
  }
  return value;
};

const parseReference = (
  reference: string,
  currentResource: string,
): Readonly<{ resource: string; pointer: string }> => {
  const hash = reference.indexOf('#');
  if (reference.startsWith('#')) {
    return { resource: currentResource, pointer: reference.slice(1) };
  }
  return hash === -1
    ? { resource: reference, pointer: '' }
    : {
        resource: reference.slice(0, hash),
        pointer: reference.slice(hash + 1),
      };
};

const representation = (types: readonly string[]): ParameterBinding['representation'] =>
  types.includes('decimal') ? 'decimal' : types.some((type) => integerTypes.has(type)) ? 'safe-integer' : 'binary64';

const validateSemanticBinding = (
  binding: NonNullable<ParameterDeclaration['bindings']>[string],
  resource: string,
  pointer: string,
): void => {
  if (
    binding.sourceUnitCapability !== undefined &&
    (typeof binding.sourceUnitCapability !== 'string' || binding.sourceUnitCapability.trim().length === 0)
  ) {
    fail(
      diagnostic(
        'INVALID_ANNOTATION',
        'sourceUnitCapability must be a non-empty producer capability',
        resource,
        pointer,
      ),
    );
  }
  if (
    binding.quantityKind !== undefined &&
    (!binding.quantityKind.startsWith('http://qudt.org/vocab/quantitykind/') || !knownKinds.has(binding.quantityKind))
  ) {
    fail(
      diagnostic('INVALID_ANNOTATION', 'quantityKind is not in the reviewed exact QUDT table', resource, pointer, {
        actual: binding.quantityKind,
      }),
    );
  }
  if (binding.reference !== undefined && !knownReferences.has(binding.reference)) {
    fail(
      diagnostic('INVALID_ANNOTATION', 'reference is not in the supported reference profile', resource, pointer, {
        actual: binding.reference,
      }),
    );
  }
  if ((binding.space === 'point') !== (binding.reference !== undefined)) {
    fail(
      diagnostic(
        'METADATA_CONFLICT',
        'point space requires a supported reference and other spaces forbid one',
        resource,
        pointer,
      ),
    );
  }
};

const resolveBindingUnit = (
  binding: NonNullable<ParameterDeclaration['bindings']>[string],
  schemaUnit: Readonly<{ code?: string; derived: boolean }>,
  context: Readonly<{
    types: readonly string[];
    resource: string;
    pointer: string;
  }>,
): string | undefined => {
  const { types, resource, pointer } = context;
  const suppliedUnit = binding.unit;
  const suppliedProvenance = binding.provenance?.unit;
  if (suppliedUnit === undefined) {
    if (suppliedProvenance !== undefined) {
      fail(diagnostic('INVALID_ANNOTATION', 'unit provenance requires a binding unit', resource, pointer));
    }
    return schemaUnit.code;
  }
  if (typeof suppliedUnit !== 'string') {
    fail(diagnostic('INVALID_ANNOTATION', 'binding unit must be a UCUM string', resource, pointer));
  }
  const valueTypes = types.filter((type) => type !== 'null');
  if (valueTypes.length === 0) {
    return undefined;
  }
  const admitted = admitUnit(suppliedUnit);
  if (admitted.status !== 'success') {
    fail(diagnostic('INVALID_ANNOTATION', admitted.diagnostic.message, resource, pointer, { actual: suppliedUnit }));
  }
  if (valueTypes.some((type) => !numericTypes.has(type))) {
    fail(
      diagnostic('INVALID_ANNOTATION', 'binding units require a numeric or nullable numeric type', resource, pointer),
    );
  }
  if (schemaUnit.code !== undefined && suppliedUnit !== schemaUnit.code) {
    fail(
      diagnostic('METADATA_CONFLICT', 'binding unit conflicts with the producer schema unit', resource, pointer, {
        expected: schemaUnit.code,
        actual: suppliedUnit,
      }),
    );
  }
  if (schemaUnit.code !== undefined && suppliedProvenance !== undefined) {
    fail(
      diagnostic('METADATA_CONFLICT', 'binding provenance cannot relabel a producer schema unit', resource, pointer),
    );
  }
  return schemaUnit.code ?? suppliedUnit;
};

const deriveManifestTables = (
  declaration: ParameterDeclaration,
  source: ParameterSource,
): Readonly<{
  bindings: Record<string, ParameterBinding>;
  provenance: Record<string, ParameterProvenance>;
  diagnostics: ParameterDiagnostic[];
}> => {
  const resources: Readonly<Record<string, JsonStructureSchema>> = {
    [rootResource]: declaration.schema,
    ...declaration.resources,
  };
  const bindings: Record<string, ParameterBinding> = {};
  const provenance: Record<string, ParameterProvenance> = {};
  const diagnostics: ParameterDiagnostic[] = [];
  const pending: Visit[] = [
    {
      node: declaration.schema,
      resource: rootResource,
      schemaPointer: '',
      instancePointer: '',
      optional: false,
      nullable: false,
    },
  ];
  const traversedReferences = new Set<string>();
  let referenceCount = 0;
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (!isRecord(current.node)) {
      continue;
    }
    const { node } = current;
    if (Object.keys(node).some((key) => /requiredsemantics/iu.test(key))) {
      fail(
        diagnostic(
          'INVALID_SCHEMA',
          'unsupported required semantic capability',
          current.resource,
          current.schemaPointer,
        ),
      );
    }
    const reference = node['$ref'];
    if (typeof reference === 'string') {
      referenceCount += 1;
      if (referenceCount > 256) {
        fail(
          diagnostic('RESOURCE_LIMIT', 'reference traversal limit exceeded', current.resource, current.schemaPointer),
        );
      }
      const target = parseReference(reference, current.resource);
      const targetSchema = resources[target.resource];
      const targetNode = targetSchema && resolvePointer(targetSchema, target.pointer);
      if (!targetSchema || !isRecord(targetNode)) {
        fail(
          diagnostic(
            'INVALID_REFERENCE',
            'reference target was not supplied or is not a schema object',
            current.resource,
            `${current.schemaPointer}/$ref`,
            { actual: reference },
          ),
        );
      }
      const key = `${qualify(target.resource, target.pointer)}\0${current.instancePointer}`;
      if (traversedReferences.has(key)) {
        fail(
          diagnostic('INVALID_REFERENCE', 'cyclic reference', current.resource, `${current.schemaPointer}/$ref`, {
            actual: reference,
          }),
        );
      }
      traversedReferences.add(key);
      pending.push({
        ...current,
        node: targetNode,
        resource: target.resource,
        schemaPointer: target.pointer,
      });
      continue;
    }
    const unionTypes = node['type'];
    if (isRecord(unionTypes) && typeof unionTypes['$ref'] === 'string') {
      const target = parseReference(unionTypes['$ref'], current.resource);
      const targetSchema = resources[target.resource];
      const targetNode = targetSchema && resolvePointer(targetSchema, target.pointer);
      referenceCount += 1;
      if (referenceCount > 256) {
        fail(
          diagnostic('RESOURCE_LIMIT', 'reference traversal limit exceeded', current.resource, current.schemaPointer),
        );
      }
      if (!targetSchema || !isRecord(targetNode)) {
        fail(
          diagnostic(
            'INVALID_REFERENCE',
            'reference target was not supplied or is not a schema object',
            current.resource,
            `${current.schemaPointer}/type`,
            { actual: unionTypes['$ref'] },
          ),
        );
      }
      const key = `${qualify(target.resource, target.pointer)}\0${current.instancePointer}`;
      if (traversedReferences.has(key)) {
        fail(
          diagnostic('INVALID_REFERENCE', 'cyclic reference', current.resource, `${current.schemaPointer}/type`, {
            actual: unionTypes['$ref'],
          }),
        );
      }
      traversedReferences.add(key);
      pending.push({
        ...current,
        node: targetNode,
        resource: target.resource,
        schemaPointer: target.pointer,
      });
    }
    if (Array.isArray(unionTypes)) {
      for (const entry of unionTypes) {
        if (isRecord(entry) && typeof entry['$ref'] === 'string') {
          const target = parseReference(entry['$ref'], current.resource);
          const targetSchema = resources[target.resource];
          const targetNode = targetSchema && resolvePointer(targetSchema, target.pointer);
          referenceCount += 1;
          if (referenceCount > 256) {
            fail(
              diagnostic(
                'RESOURCE_LIMIT',
                'reference traversal limit exceeded',
                current.resource,
                current.schemaPointer,
              ),
            );
          }
          if (!targetSchema || !isRecord(targetNode)) {
            fail(
              diagnostic(
                'INVALID_REFERENCE',
                'reference target was not supplied or is not a schema object',
                current.resource,
                `${current.schemaPointer}/type`,
                { actual: entry['$ref'] },
              ),
            );
          }
          const key = `${qualify(target.resource, target.pointer)}\0${current.instancePointer}`;
          if (traversedReferences.has(key)) {
            fail(
              diagnostic('INVALID_REFERENCE', 'cyclic reference', current.resource, `${current.schemaPointer}/type`, {
                actual: entry['$ref'],
              }),
            );
          }
          traversedReferences.add(key);
          pending.push({
            ...current,
            node: targetNode,
            resource: target.resource,
            schemaPointer: target.pointer,
            nullable: current.nullable || nodeTypes(node).includes('null'),
          });
        }
      }
    }
    const schemaUnit = validateUnit(node, current.resource, current.schemaPointer);
    const types = nodeTypes(node);
    const declared = declaration.bindings?.[current.instancePointer] ?? {};
    validateSemanticBinding(declared, current.resource, current.schemaPointer);
    const unit = resolveBindingUnit(declared, schemaUnit, {
      types,
      resource: current.resource,
      pointer: current.schemaPointer,
    });
    const numeric =
      types.some((type) => numericTypes.has(type)) && types.every((type) => type === 'null' || numericTypes.has(type));
    if (numeric) {
      const parameter: ParameterIdentity = declared.parameterId
        ? { value: declared.parameterId, stability: 'stable' }
        : {
            value: `${source.revision}:${current.instancePointer}`,
            stability: 'revision-scoped',
          };
      const constraints = Object.fromEntries(constraintKeys.flatMap((key) => (key in node ? [[key, node[key]]] : [])));
      const binding: ParameterBinding = {
        parameter,
        schema: { resource: current.resource, pointer: current.schemaPointer },
        representation: representation(types),
        optional: current.optional,
        nullable: current.nullable || types.includes('null'),
        ...(unit === undefined ? {} : { unit }),
        ...(declared.quantityKind === undefined ? {} : { quantityKind: declared.quantityKind }),
        ...(declared.space === undefined ? {} : { space: declared.space }),
        ...(declared.reference === undefined ? {} : { reference: declared.reference }),
        ...(typeof node['symbol'] === 'string' ? { symbol: node['symbol'] } : {}),
        ...(isRecord(node['symbols'])
          ? { symbols: Object.fromEntries(Object.entries(node['symbols']).map(([key, value]) => [key, String(value)])) }
          : {}),
        ...(declared.sourceUnitCapability === undefined ? {} : { sourceUnitCapability: declared.sourceUnitCapability }),
        constraints,
      };
      const existing = bindings[current.instancePointer];
      if (existing === undefined) {
        bindings[current.instancePointer] = binding;
      } else {
        const { schema: _existingSchema, ...existingClaims } = existing;
        const { schema: _bindingSchema, ...bindingClaims } = binding;
        if (canonical(existingClaims) !== canonical(bindingClaims)) {
          fail(
            diagnostic(
              'METADATA_CONFLICT',
              'union branches define incompatible parameter semantics or constraints',
              current.resource,
              current.schemaPointer,
              { instancePointer: current.instancePointer },
            ),
          );
        }
      }
      if (unit !== undefined) {
        if (schemaUnit.code === undefined) {
          const supplied = declared.provenance?.unit;
          provenance[qualifyBindingClaim(current, 'unit')] = {
            field: 'unit',
            origin: supplied?.origin ?? 'declared',
            producer: supplied?.producer ?? source.id,
            sourceRevision: supplied?.sourceRevision ?? source.revision,
            ...(supplied?.profile === undefined ? {} : { profile: supplied.profile }),
            ...(supplied?.rule === undefined ? {} : { rule: supplied.rule }),
            ...(supplied?.evidence === undefined ? {} : { evidence: supplied.evidence }),
          };
        } else {
          provenance[qualify(current.resource, `${current.schemaPointer}/ucumUnit`)] = {
            field: 'unit',
            origin: schemaUnit.derived ? 'derived' : 'declared',
            producer: source.id,
            sourceRevision: source.revision,
            ...(schemaUnit.derived ? { profile, rule: 'bipm-symbol-to-ucum' } : {}),
          };
        }
      }
      if (types.includes('decimal')) {
        diagnostics.push({
          ...diagnostic(
            'REPRESENTATION_UNSUPPORTED',
            'decimal data is preserved but execution is unsupported',
            current.resource,
            current.schemaPointer,
            {
              instancePointer: current.instancePointer,
              parameterId: parameter.value,
            },
          ),
          severity: 'warning',
        });
      }
      for (const field of ['quantityKind', 'space', 'reference'] as const) {
        if (declared[field] === undefined) {
          continue;
        }
        const supplied = declared.provenance?.[field];
        provenance[qualifyBindingClaim(current, field)] = {
          field: field === 'quantityKind' ? 'quantity-kind' : field,
          origin: supplied?.origin ?? 'declared',
          producer: supplied?.producer ?? source.id,
          sourceRevision: supplied?.sourceRevision ?? source.revision,
          ...(supplied?.profile === undefined ? {} : { profile: supplied.profile }),
          ...(supplied?.rule === undefined ? {} : { rule: supplied.rule }),
          ...(supplied?.evidence === undefined ? {} : { evidence: supplied.evidence }),
        };
      }
    }
    const { properties } = node;
    if (isRecord(properties)) {
      const required = new Set(Array.isArray(node['required']) ? node['required'] : []);
      for (const [key, child] of Object.entries(properties)) {
        pending.push({
          node: child,
          resource: current.resource,
          schemaPointer: `${current.schemaPointer}/properties/${escapePointer(key)}`,
          instancePointer: `${current.instancePointer}/${escapePointer(key)}`,
          optional: !required.has(key),
          nullable: isRecord(child) && nodeTypes(child).includes('null'),
        });
      }
    }
    const { items } = node;
    if (isRecord(items)) {
      pending.push({
        node: items,
        resource: current.resource,
        schemaPointer: `${current.schemaPointer}/items`,
        instancePointer: `${current.instancePointer}/*`,
        optional: false,
        nullable: nodeTypes(items).includes('null'),
      });
    } else if (Array.isArray(items)) {
      for (const [index, child] of items.entries()) {
        pending.push({
          node: child,
          resource: current.resource,
          schemaPointer: `${current.schemaPointer}/items/${index}`,
          instancePointer: `${current.instancePointer}/${index}`,
          optional: false,
          nullable: isRecord(child) && nodeTypes(child).includes('null'),
        });
      }
    }
    for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
      const branches = node[keyword];
      if (!Array.isArray(branches)) {
        continue;
      }
      for (const [index, child] of branches.entries()) {
        pending.push({
          ...current,
          node: child,
          schemaPointer: `${current.schemaPointer}/${keyword}/${index}`,
        });
      }
    }
  }
  for (const pointer of Object.keys(declaration.bindings ?? {})) {
    if (!isPointer(pointer) || !Object.hasOwn(bindings, pointer)) {
      fail(
        diagnostic('INVALID_ANNOTATION', 'binding must address a unit-bearing instance pointer', rootResource, '', {
          instancePointer: pointer,
        }),
      );
    }
  }
  provenance[qualify(rootResource, '/@producer')] = {
    field: 'producer',
    origin: 'declared',
    producer: source.id,
    sourceRevision: source.revision,
  };
  provenance[qualify(rootResource, '/@sourceRevision')] = {
    field: 'source-revision',
    origin: 'declared',
    producer: source.id,
    sourceRevision: source.revision,
  };
  return { bindings, provenance, diagnostics };
};

const pointerSegments = (pointer: string): readonly string[] | undefined =>
  pointer === ''
    ? []
    : isPointer(pointer)
      ? pointer
          .slice(1)
          .split('/')
          .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
      : undefined;

/**
 * Resolve a concrete instance pointer to its admitted binding or wildcard template pointer.
 * @public
 */
export const resolveParameterBindingPointer = (
  manifest: ParameterManifest,
  instancePointer: string,
): string | undefined => {
  if (Object.hasOwn(manifest.bindings, instancePointer)) {
    return instancePointer;
  }
  const actual = pointerSegments(instancePointer);
  if (actual === undefined) {
    return undefined;
  }
  return Object.keys(manifest.bindings).find((candidate) => {
    const template = pointerSegments(candidate);
    return (
      template !== undefined &&
      template.length === actual.length &&
      template.every(
        (segment, index) => segment === actual[index] || (segment === '*' && /^(?:0|[1-9]\d*)$/u.test(actual[index]!)),
      )
    );
  });
};

/** Resolve an exact or homogeneous-array binding for one concrete instance pointer. @public */
export const resolveParameterBinding = (
  manifest: ParameterManifest,
  instancePointer: string,
): ParameterBinding | undefined => {
  const pointer = resolveParameterBindingPointer(manifest, instancePointer);
  const binding = pointer === undefined ? undefined : manifest.bindings[pointer];
  if (binding === undefined || pointer === instancePointer) {
    return binding;
  }
  return {
    ...binding,
    parameter: {
      value: `${binding.parameter.value}:${instancePointer}`,
      stability: 'revision-scoped',
    },
  };
};

const projectPrimitiveType = (value: unknown): unknown => {
  if (isRecord(value) && typeof value['$ref'] === 'string') {
    return { $ref: value['$ref'] };
  }
  if (typeof value !== 'string') {
    return value;
  }
  if (value === 'decimal') {
    return 'string';
  }
  if (integerTypes.has(value)) {
    return 'integer';
  }
  return numericTypes.has(value) ? 'number' : value;
};

const fixedIntegerBounds = new Map<string, readonly [number, number]>([
  ['integer', [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]],
  ['int8', [-128, 127]],
  ['uint8', [0, 255]],
  ['int16', [-32_768, 32_767]],
  ['uint16', [0, 65_535]],
  ['int32', [-2_147_483_648, 2_147_483_647]],
  ['uint32', [0, 4_294_967_295]],
]);
const wideIntegerTypes = new Set(['int64', 'uint64', 'int128', 'uint128']);

/** Derive the temporary Draft-7/OGC view used by still-migrating runtime consumers. @public */
export const projectParameterSchemaToDraft7 = (schema: JsonStructureSchema): ParameterLegacyProjection => {
  const diagnostics: ParameterDiagnostic[] = [];
  let usable = true;
  const visit = (value: unknown, pointer: string): unknown => {
    if (Array.isArray(value)) {
      return value.map((item, index) => visit(item, `${pointer}/${String(index)}`));
    }
    if (!isRecord(value)) {
      return value;
    }
    const projected: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (key === 'symbol' || key === 'symbols') {
        diagnostics.push({
          ...diagnostic(
            'LEGACY_PROJECTION_LOSS',
            `display annotation ${key} has no Draft-7/OGC projection`,
            rootResource,
            `${pointer}/${escapePointer(key)}`,
          ),
          severity: 'warning',
        });
        continue;
      }
      if (key === '$schema' || key === '$uses' || key === 'name' || key === 'unit' || key === 'ucumUnit') {
        continue;
      }
      if (key === 'type') {
        if (Array.isArray(child) && child.some((item) => isRecord(item))) {
          projected['anyOf'] = child.map((item) =>
            isRecord(item) ? projectPrimitiveType(item) : { type: projectPrimitiveType(item) },
          );
        } else if (Array.isArray(child)) {
          projected['type'] = child.map((item) => projectPrimitiveType(item));
        } else if (isRecord(child)) {
          Object.assign(projected, projectPrimitiveType(child));
        } else {
          projected['type'] = projectPrimitiveType(child);
        }
        continue;
      }
      if ((key === 'properties' || key === 'definitions') && isRecord(child)) {
        projected[key] = Object.fromEntries(
          Object.entries(child).map(([name, property]) => [
            name,
            visit(property, `${pointer}/${escapePointer(key)}/${escapePointer(name)}`),
          ]),
        );
        continue;
      }
      if (projectionKeywords.has(key)) {
        projected[key] = visit(child, `${pointer}/${escapePointer(key)}`);
        continue;
      }
      diagnostics.push({
        ...diagnostic(
          'LEGACY_PROJECTION_LOSS',
          `JSON Structure keyword ${key} has no qualified Draft-7 projection`,
          rootResource,
          `${pointer}/${escapePointer(key)}`,
        ),
        severity: 'warning',
      });
    }
    const declaredUnit =
      typeof value['ucumUnit'] === 'string'
        ? value['ucumUnit']
        : typeof value['unit'] === 'string'
          ? symbolToUcum.get(value['unit'])
          : undefined;
    if (declaredUnit !== undefined) {
      projected['x-ogc-unit'] = declaredUnit;
      projected['x-ogc-unitLang'] = 'UCUM';
    }
    const types = nodeTypes(value);
    for (const type of types) {
      const bounds = fixedIntegerBounds.get(type);
      if (bounds !== undefined) {
        projected['minimum'] = Math.max(
          bounds[0],
          typeof projected['minimum'] === 'number' ? projected['minimum'] : bounds[0],
        );
        projected['maximum'] = Math.min(
          bounds[1],
          typeof projected['maximum'] === 'number' ? projected['maximum'] : bounds[1],
        );
      }
      if (wideIntegerTypes.has(type)) {
        usable = false;
        diagnostics.push({
          ...diagnostic(
            'LEGACY_PROJECTION_LOSS',
            `${type} cannot be represented exactly by the current Draft-7 JSON-number consumer`,
            rootResource,
            `${pointer}/type`,
          ),
          severity: 'warning',
        });
      }
      if (type === 'decimal') {
        usable = false;
        projected['pattern'] = decimalLexicalPattern.source;
        diagnostics.push({
          ...diagnostic(
            'REPRESENTATION_UNSUPPORTED',
            'decimal lexical values are preserved but numeric Draft-7 execution is unsupported',
            rootResource,
            `${pointer}/type`,
          ),
          severity: 'warning',
        });
      }
    }
    return projected;
  };
  const projected: unknown = visit(schema, '');
  if (!isRecord(projected)) {
    fail(diagnostic('INVALID_SCHEMA', 'legacy projection root must be an object', rootResource, ''));
  }
  const projectedSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    ...(projected as Record<string, unknown>),
  };
  try {
    admitJsonSchema(projectedSchema);
  } catch (error) {
    usable = false;
    diagnostics.push({
      ...diagnostic(
        'LEGACY_PROJECTION_LOSS',
        `Draft-7/OGC projection is invalid: ${error instanceof Error ? error.message : String(error)}`,
        rootResource,
        '',
      ),
      severity: 'warning',
    });
  }
  return deepFreeze(
    usable
      ? {
          status: 'usable',
          dialect: 'draft-07',
          schema: projectedSchema as JSONSchema7,
          diagnostics,
        }
      : { status: 'unsupported', dialect: 'draft-07', diagnostics },
  );
};

// Keywords whose values are data or names, never schemas, and keywords whose values map names to schemas.
const carrierDataKeywords = new Set([
  '$uses',
  'altenums',
  'altnames',
  'const',
  'default',
  'dependentRequired',
  'enum',
  'examples',
  'required',
  'symbols',
]);
const carrierNameMapKeywords = new Set(['choices', 'definitions', 'properties']);

/* Authored JSON Schema claims never ride inside the carrier: native producers declare semantics in `bindings`,
 * and authored documents enter through the JSON Schema adapter, which lifts them. Refusing here keeps one
 * admission owner and never drops a claim silently. */
const assertNoAuthoredClaims = (schema: unknown, resource: string): void => {
  const pending: Array<Readonly<{ node: unknown; pointer: string; names: boolean }>> = [
    { node: schema, pointer: '', names: false },
  ];
  while (pending.length > 0) {
    const { node, pointer, names } = pending.pop()!;
    if (Array.isArray(node)) {
      for (const [index, child] of node.entries()) {
        pending.push({ node: child, pointer: `${pointer}/${String(index)}`, names: false });
      }
      continue;
    }
    if (!isRecord(node)) {
      continue;
    }
    for (const [key, child] of Object.entries(node)) {
      const childPointer = `${pointer}/${escapePointer(key)}`;
      if (!names && (key.startsWith('x-tau-') || key.startsWith('x-ogc-'))) {
        fail(
          diagnostic(
            'INVALID_ANNOTATION',
            `${key} is an authored JSON Schema claim; declare it in bindings or admit the authored schema through the JSON Schema adapter`,
            resource,
            childPointer,
          ),
        );
      }
      if (names || !carrierDataKeywords.has(key)) {
        pending.push({ node: child, pointer: childPointer, names: !names && carrierNameMapKeywords.has(key) });
      }
    }
  }
};

const cloneDeclaration = (value: unknown): ParameterDeclaration => {
  const candidate: unknown = cloneBoundedJson(value, limits);
  if (!isRecord(candidate)) {
    fail(diagnostic('INVALID_SCHEMA', 'parameter declaration requires a record', rootResource, ''));
  }
  const candidateRecord = candidate as Record<string, unknown>;
  if (!isRecord(candidateRecord['schema']) || !isRecord(candidateRecord['defaults'])) {
    fail(diagnostic('INVALID_SCHEMA', 'parameter declaration requires schema and record defaults', rootResource, ''));
  }
  assertOnlyKeys(candidateRecord, new Set(['schema', 'resources', 'defaults', 'bindings']), '');
  if (candidateRecord['resources'] !== undefined && !isRecord(candidateRecord['resources'])) {
    fail(diagnostic('INVALID_SCHEMA', 'parameter resources must be a record', rootResource, '/resources'));
  }
  const { bindings: bindingDeclarations } = candidateRecord;
  if (bindingDeclarations !== undefined) {
    if (!isRecord(bindingDeclarations)) {
      fail(diagnostic('INVALID_SCHEMA', 'parameter bindings must be a record', rootResource, '/bindings'));
    }
    const bindingsRecord = bindingDeclarations as Record<string, unknown>;
    for (const pointer of Object.keys(bindingsRecord)) {
      const { [pointer]: binding } = bindingsRecord;
      if (!isRecord(binding)) {
        fail(
          diagnostic(
            'INVALID_SCHEMA',
            'parameter binding declaration must be a record',
            rootResource,
            `/bindings/${escapePointer(pointer)}`,
          ),
        );
      }
      const bindingRecord = binding as Record<string, unknown>;
      assertOnlyKeys(
        bindingRecord,
        new Set(['parameterId', 'unit', 'quantityKind', 'space', 'reference', 'sourceUnitCapability', 'provenance']),
        `/bindings/${escapePointer(pointer)}`,
      );
      const { provenance: provenanceDeclarations } = bindingRecord;
      if (provenanceDeclarations === undefined) {
        continue;
      }
      if (!isRecord(provenanceDeclarations)) {
        fail(
          diagnostic(
            'INVALID_SCHEMA',
            'parameter provenance declarations must be a record',
            rootResource,
            `/bindings/${escapePointer(pointer)}/provenance`,
          ),
        );
      }
      const provenanceRecords = provenanceDeclarations as Record<string, unknown>;
      for (const field of Object.keys(provenanceRecords)) {
        const { [field]: provenance } = provenanceRecords;
        if (!['unit', 'quantityKind', 'space', 'reference'].includes(field) || !isRecord(provenance)) {
          fail(
            diagnostic(
              'INVALID_SCHEMA',
              'invalid parameter provenance declaration',
              rootResource,
              `/bindings/${escapePointer(pointer)}/provenance/${escapePointer(field)}`,
            ),
          );
        }
        const provenanceRecord = provenance as Record<string, unknown>;
        assertOnlyKeys(
          provenanceRecord,
          new Set(['origin', 'producer', 'sourceRevision', 'profile', 'rule', 'evidence']),
          `/bindings/${escapePointer(pointer)}/provenance/${escapePointer(field)}`,
        );
        assertProvenanceRecord(
          provenanceRecord,
          `/bindings/${escapePointer(pointer)}/provenance/${escapePointer(field)}`,
        );
      }
    }
  }
  return candidate as ParameterDeclaration;
};

/**
 * Admit a producer declaration using the pinned JSON Structure profile. Authored JSON Schema claims (`x-tau-*`,
 * `x-ogc-*`) inside the carrier are refused with `INVALID_ANNOTATION`; declare them in `bindings` instead.
 * @public
 */
export const admitParameterDeclaration = (value: unknown): ParameterDeclaration => {
  const declaration = cloneDeclaration(value);
  const resources = declaration.resources ?? {};
  assertNoAuthoredClaims(declaration.schema, rootResource);
  for (const [uri, schema] of Object.entries(resources)) {
    assertNoAuthoredClaims(schema, uri);
  }
  deriveManifestTables(declaration, {
    id: 'parameter-admission',
    version: profile,
    revision: 'admission',
    capability: 'json-structure',
  });
  for (const [uri, schema] of Object.entries(resources)) {
    if (!URL.canParse(uri) || !isRecord(schema)) {
      fail(diagnostic('INVALID_REFERENCE', 'resource requires an absolute URI and object schema', uri, ''));
    }
    validateSchema(schema, resources, uri);
  }
  validateSchema(declaration.schema, resources, rootResource);
  validateDefaults(declaration);
  return deepFreeze(declaration);
};

const requireDigest = (value: unknown, field: string): ContentDigest => {
  if (typeof value !== 'string' || !contentDigestPattern.test(value)) {
    fail(diagnostic('INVALID_SCHEMA', `${field} must be a SHA-256 content digest`, rootResource, ''));
  }
  return value as ContentDigest;
};

const admitSourceFiles = (value: unknown): Readonly<Record<string, ContentDigest | 'missing'>> => {
  if (!isRecord(value)) {
    fail(diagnostic('INVALID_SCHEMA', 'source file identity must be a record', rootResource, '/identity/sourceFiles'));
  }
  const files = value as Record<string, unknown>;
  for (const [path, digest] of Object.entries(files)) {
    if (!isNonEmptyString(path) || (digest !== 'missing' && !contentDigestPattern.test(String(digest)))) {
      fail(
        diagnostic(
          'INVALID_SCHEMA',
          'source file identity requires non-empty paths and SHA-256 digests or missing markers',
          rootResource,
          `/identity/sourceFiles/${escapePointer(path)}`,
        ),
      );
    }
  }
  return files as Readonly<Record<string, ContentDigest | 'missing'>>;
};

// `mode: 'default'` is the absent mode; normalising it keeps one identity for one semantics.
const withoutDefaultMode = (resolution: ParameterResolutionOptions = {}): ParameterResolutionOptions => {
  const { mode, ...rest } = resolution;
  return mode === 'declared-only' ? { ...rest, mode } : rest;
};

const admitResolution = (value: unknown): ParameterResolutionOptions => {
  if (!isRecord(value)) {
    fail(diagnostic('INVALID_SCHEMA', 'invalid parameter resolution identity', rootResource, '/identity/resolution'));
  }
  const resolution = value as Record<string, unknown>;
  assertOnlyKeys(
    resolution,
    new Set(['mode', 'profile', 'inferenceLanguage', 'projectBindingDigest', 'sourceUnitDigest']),
    '/identity/resolution',
  );
  if (
    (resolution['profile'] !== undefined && resolution['profile'] !== profile) ||
    (resolution['mode'] !== undefined && resolution['mode'] !== 'default' && resolution['mode'] !== 'declared-only') ||
    (resolution['inferenceLanguage'] !== undefined && typeof resolution['inferenceLanguage'] !== 'string')
  ) {
    fail(diagnostic('INVALID_SCHEMA', 'invalid parameter resolution identity', rootResource, '/identity/resolution'));
  }
  if (resolution['projectBindingDigest'] !== undefined) {
    requireDigest(resolution['projectBindingDigest'], 'identity.resolution.projectBindingDigest');
  }
  if (resolution['sourceUnitDigest'] !== undefined) {
    requireDigest(resolution['sourceUnitDigest'], 'identity.resolution.sourceUnitDigest');
  }
  return resolution as ParameterResolutionOptions;
};

const admitSource = (value: unknown): ParameterSource => {
  if (!isRecord(value)) {
    fail(diagnostic('INVALID_SCHEMA', 'parameter source identity must be a record', rootResource, '/source'));
  }
  const source = value as Record<string, unknown>;
  if (
    !isNonEmptyString(source['id']) ||
    typeof source['version'] !== 'string' ||
    !isNonEmptyString(source['revision']) ||
    !['json-structure', 'none'].includes(String(source['capability']))
  ) {
    fail(diagnostic('INVALID_SCHEMA', 'invalid parameter source identity', rootResource, '/source'));
  }
  assertOnlyKeys(source, new Set(['id', 'version', 'revision', 'capability']), '/source');
  return source as ParameterSource;
};

const admitScope = (value: unknown): ParameterScope => {
  if (!isRecord(value)) {
    fail(diagnostic('INVALID_SCHEMA', 'parameter scope identity must be a record', rootResource, '/scope'));
  }
  const scope = value as Record<string, unknown>;
  if (
    (scope['kind'] === 'source' &&
      (typeof scope['authority'] !== 'string' ||
        typeof scope['root'] !== 'string' ||
        typeof scope['entry'] !== 'string' ||
        (scope['checkout'] !== undefined && typeof scope['checkout'] !== 'string'))) ||
    (scope['kind'] === 'provider' &&
      (typeof scope['provider'] !== 'string' || typeof scope['configuration'] !== 'string')) ||
    !['source', 'provider'].includes(String(scope['kind']))
  ) {
    fail(diagnostic('INVALID_SCHEMA', 'invalid parameter scope identity', rootResource, '/scope'));
  }
  assertOnlyKeys(
    scope,
    scope['kind'] === 'source'
      ? new Set(['kind', 'authority', 'root', 'checkout', 'entry'])
      : new Set(['kind', 'provider', 'configuration']),
    '/scope',
  );
  return scope as ParameterScope;
};

const canonical = (value: unknown): string => canonicalizeCacheValue({ value: asCacheValue(value) });

const assertProducerValuePreserved = (producer: unknown, effective: unknown, pointer: string): void => {
  if (Array.isArray(producer)) {
    if (!Array.isArray(effective) || canonical(producer) !== canonical(effective)) {
      fail(
        diagnostic(
          'METADATA_CONFLICT',
          'effective declaration replaced producer-authored semantics',
          rootResource,
          pointer,
        ),
      );
    }
    return;
  }
  if (!isRecord(producer)) {
    if (!Object.is(producer, effective)) {
      fail(
        diagnostic(
          'METADATA_CONFLICT',
          'effective declaration replaced producer-authored semantics',
          rootResource,
          pointer,
        ),
      );
    }
    return;
  }
  const effectiveRecord = isRecord(effective)
    ? effective
    : fail(
        diagnostic(
          'METADATA_CONFLICT',
          'effective declaration replaced producer-authored semantics',
          rootResource,
          pointer,
        ),
      );
  for (const [key, value] of Object.entries(producer)) {
    assertProducerValuePreserved(value, effectiveRecord[key], `${pointer}/${escapePointer(key)}`);
  }
};

const assertProducerDeclarationPreserved = async (
  candidate: ParameterManifest,
  producerDeclaration: ParameterDeclaration,
): Promise<void> => {
  const producer = await compileParameterManifest({
    declaration: producerDeclaration,
    scope: candidate.scope,
    source: candidate.source,
    dependency: candidate.identity.dependency,
    middleware: candidate.identity.middleware,
    resolution: candidate.identity.resolution,
    sourceFiles: candidate.identity.sourceFiles,
  });
  if (canonical(producer.schema) !== canonical(candidate.schema)) {
    fail(
      diagnostic(
        'METADATA_CONFLICT',
        'effective declaration changed producer schema structure',
        rootResource,
        '/schema',
      ),
    );
  }
  if (canonical(producer.resources) !== canonical(candidate.resources)) {
    fail(
      diagnostic(
        'METADATA_CONFLICT',
        'effective declaration changed producer resource structure',
        rootResource,
        '/resources',
      ),
    );
  }
  assertProducerValuePreserved(producer.bindingDeclarations, candidate.bindingDeclarations, '/bindingDeclarations');
  for (const [pointer, binding] of Object.entries(candidate.bindingDeclarations)) {
    const producerBinding = producer.bindingDeclarations[pointer];
    if (
      binding.sourceUnitCapability !== undefined &&
      binding.sourceUnitCapability !== producerBinding?.sourceUnitCapability
    ) {
      fail(
        diagnostic(
          'METADATA_CONFLICT',
          'source-unit capability must come from the declaration owner',
          rootResource,
          `/bindingDeclarations/${escapePointer(pointer)}/sourceUnitCapability`,
        ),
      );
    }
    for (const field of ['unit', 'quantityKind', 'space', 'reference'] as const) {
      if (binding[field] === undefined || producerBinding?.[field] !== undefined) {
        continue;
      }
      const provenance = binding.provenance?.[field];
      if (
        provenance === undefined ||
        provenance.origin === 'declared' ||
        (field === 'unit' && provenance.origin !== 'project' && provenance.origin !== 'inferred')
      ) {
        fail(
          diagnostic(
            'METADATA_CONFLICT',
            'binding enrichment requires independent provenance',
            rootResource,
            `/bindingDeclarations/${escapePointer(pointer)}/${field}`,
          ),
        );
      }
    }
  }
  if (canonical(producer.defaults) !== canonical(candidate.defaults)) {
    fail(
      diagnostic(
        'METADATA_CONFLICT',
        'effective declaration replaced producer-authored defaults',
        rootResource,
        '/defaults',
      ),
    );
  }
  for (const [pointer, binding] of Object.entries(candidate.bindings)) {
    const producerBinding = producer.bindings[pointer];
    if (
      (producerBinding !== undefined && canonical(producerBinding.parameter) !== canonical(binding.parameter)) ||
      (producerBinding === undefined && binding.parameter.stability === 'stable')
    ) {
      fail(
        diagnostic(
          'METADATA_CONFLICT',
          'effective declaration replaced producer-owned parameter identity',
          rootResource,
          `/bindings/${escapePointer(pointer)}/parameter`,
        ),
      );
    }
  }
  for (const [key, provenance] of Object.entries(candidate.provenance)) {
    const producerProvenance = producer.provenance[key];
    if (producerProvenance !== undefined && canonical(producerProvenance) !== canonical(provenance)) {
      fail(
        diagnostic(
          'METADATA_CONFLICT',
          'effective declaration relabeled producer provenance',
          rootResource,
          `/provenance/${escapePointer(key)}`,
        ),
      );
    }
    if (producerProvenance === undefined && provenance.origin === 'declared') {
      fail(
        diagnostic(
          'METADATA_CONFLICT',
          'effective enrichment cannot claim producer-declared provenance',
          rootResource,
          `/provenance/${escapePointer(key)}`,
        ),
      );
    }
    if (
      producerProvenance === undefined &&
      provenance.field === 'unit' &&
      provenance.origin !== 'project' &&
      provenance.origin !== 'inferred'
    ) {
      fail(
        diagnostic(
          'METADATA_CONFLICT',
          'unit enrichment requires project or inferred provenance',
          rootResource,
          `/provenance/${escapePointer(key)}`,
        ),
      );
    }
  }
};

/** Build the immutable effective manifest and semantic revision from all semantic inputs. @public */
export const compileParameterManifest = async (input: CompileParameterManifestInput): Promise<ParameterManifest> => {
  const declaration = admitParameterDeclaration(input.declaration);
  requireDigest(input.dependency, 'dependency');
  requireDigest(input.middleware, 'middleware');
  const resolution = admitResolution(deepFreeze(cloneBoundedJson(withoutDefaultMode(input.resolution), limits)));
  const scope = admitScope(cloneBoundedJson(input.scope, limits));
  const source = admitSource(cloneBoundedJson(input.source, limits));
  const sourceFiles = admitSourceFiles(cloneBoundedJson(input.sourceFiles ?? {}, limits));
  const tables = deriveManifestTables(declaration, source);
  const legacyProjection = projectParameterSchemaToDraft7(declaration.schema);
  const withoutRevision = {
    version: 1,
    profile,
    dialect: { core: '-04', units: '-03', activation: 'JSONSchemaUnits' },
    schema: declaration.schema,
    resources: declaration.resources ?? {},
    defaults: declaration.defaults,
    bindingDeclarations: declaration.bindings ?? {},
    bindings: tables.bindings,
    provenance: tables.provenance,
    diagnostics: tables.diagnostics,
    legacyProjection,
    scope,
    source,
    identity: {
      dependency: input.dependency,
      middleware: input.middleware,
      resolution,
      sourceFiles,
    },
  } as const;
  const revision = await digestContent({
    bytes: new TextEncoder().encode(canonicalizeCacheValue({ value: asCacheValue(withoutRevision) })),
  });
  return deepFreeze({ ...withoutRevision, revision });
};

const inspectParameterManifest = (value: unknown): ParameterManifest => {
  const cloned: unknown = cloneBoundedJson(value, limits);
  if (!isRecord(cloned)) {
    fail(diagnostic('INVALID_SCHEMA', 'parameter manifest must be an object', rootResource, ''));
  }
  const candidate = cloned as Record<string, unknown>;
  if (candidate['version'] !== 1 || candidate['profile'] !== profile) {
    fail(diagnostic('INVALID_SCHEMA', 'unsupported parameter manifest version or profile', rootResource, ''));
  }
  const declaration = admitParameterDeclaration({
    schema: candidate['schema'],
    resources: candidate['resources'],
    defaults: candidate['defaults'],
    bindings: candidate['bindingDeclarations'],
  });
  const { dialect } = candidate;
  if (
    !isRecord(dialect) ||
    dialect['core'] !== '-04' ||
    dialect['units'] !== '-03' ||
    dialect['activation'] !== 'JSONSchemaUnits'
  ) {
    fail(diagnostic('INVALID_SCHEMA', 'unsupported JSON Structure dialect', rootResource, '/dialect'));
  }
  if (
    !isRecord(candidate['bindingDeclarations']) ||
    !isRecord(candidate['bindings']) ||
    !isRecord(candidate['provenance']) ||
    !Array.isArray(candidate['diagnostics']) ||
    !isRecord(candidate['legacyProjection']) ||
    !isRecord(candidate['identity']) ||
    !isRecord(candidate['source']) ||
    !isRecord(candidate['scope'])
  ) {
    fail(diagnostic('INVALID_SCHEMA', 'manifest tables and identity must be structured records', rootResource, ''));
  }
  const identity = candidate['identity'] as Record<string, unknown>;
  requireDigest(candidate['revision'], 'revision');
  requireDigest(identity['dependency'], 'identity.dependency');
  requireDigest(identity['middleware'], 'identity.middleware');
  admitResolution(identity['resolution']);
  admitSourceFiles(identity['sourceFiles']);
  const source = admitSource(candidate['source']);
  admitScope(candidate['scope']);
  const expectedProjection = projectParameterSchemaToDraft7(declaration.schema);
  if (
    canonicalizeCacheValue({
      value: asCacheValue(candidate['legacyProjection']),
    }) !== canonicalizeCacheValue({ value: asCacheValue(expectedProjection) })
  ) {
    fail(
      diagnostic(
        'METADATA_CONFLICT',
        'legacy projection must be derived from the native schema',
        rootResource,
        '/legacyProjection',
      ),
    );
  }
  const expectedTables = deriveManifestTables(declaration, source);
  const bindings = candidate['bindings'] as Record<string, unknown>;
  for (const pointer of Object.keys(expectedTables.bindings)) {
    if (!Object.hasOwn(bindings, pointer)) {
      fail(
        diagnostic(
          'METADATA_CONFLICT',
          'effective bindings cannot hide declared unit semantics',
          rootResource,
          `/bindings/${escapePointer(pointer)}`,
        ),
      );
    }
  }
  for (const [pointer, binding] of Object.entries(bindings)) {
    if (
      !isPointer(pointer) ||
      !isRecord(binding) ||
      !isRecord(binding['parameter']) ||
      !isRecord(binding['schema']) ||
      !isRecord(binding['constraints']) ||
      (binding['representation'] !== 'binary64' &&
        binding['representation'] !== 'safe-integer' &&
        binding['representation'] !== 'decimal') ||
      typeof binding['optional'] !== 'boolean' ||
      typeof binding['nullable'] !== 'boolean'
    ) {
      fail(
        diagnostic(
          'INVALID_SCHEMA',
          'invalid effective parameter binding',
          rootResource,
          `/bindings/${escapePointer(pointer)}`,
        ),
      );
    }
    const bindingRecord = binding as Record<string, unknown>;
    const parameter = bindingRecord['parameter'] as Record<string, unknown>;
    if (
      typeof parameter['value'] !== 'string' ||
      (parameter['stability'] !== 'stable' && parameter['stability'] !== 'revision-scoped')
    ) {
      fail(
        diagnostic(
          'INVALID_SCHEMA',
          'invalid parameter identity',
          rootResource,
          `/bindings/${escapePointer(pointer)}/parameter`,
        ),
      );
    }
    const schemaLocation = bindingRecord['schema'] as Record<string, unknown>;
    const { resource, pointer: pointerValue } = schemaLocation;
    const resourceSchema =
      resource === rootResource
        ? declaration.schema
        : typeof resource === 'string'
          ? declaration.resources?.[resource]
          : undefined;
    const resolvedNode =
      resourceSchema === undefined || typeof pointerValue !== 'string'
        ? undefined
        : resolvePointer(resourceSchema, pointerValue);
    if (
      typeof resource !== 'string' ||
      typeof pointerValue !== 'string' ||
      !isPointer(pointerValue) ||
      resourceSchema === undefined ||
      !isRecord(resolvedNode)
    ) {
      fail(
        diagnostic(
          'INVALID_REFERENCE',
          'binding schema location is unresolved',
          rootResource,
          `/bindings/${escapePointer(pointer)}/schema`,
        ),
      );
    }
    const bindingResource = resource as string;
    const bindingPointer = pointerValue as string;
    const bindingNode = resolvedNode as Record<string, unknown>;
    const declaredUnit = validateUnit(bindingNode, bindingResource, bindingPointer).code;
    if (bindingRecord['unit'] !== undefined) {
      if (typeof bindingRecord['unit'] !== 'string') {
        fail(diagnostic('INVALID_ANNOTATION', 'binding unit must be a UCUM string', bindingResource, bindingPointer));
      }
      const admitted = admitUnit(bindingRecord['unit'] as string);
      if (admitted.status !== 'success') {
        fail(diagnostic('INVALID_ANNOTATION', admitted.diagnostic.message, bindingResource, bindingPointer));
      }
      if (declaredUnit !== undefined && bindingRecord['unit'] !== declaredUnit) {
        fail(
          diagnostic(
            'METADATA_CONFLICT',
            'effective unit conflicts with the native declaration',
            bindingResource,
            bindingPointer,
            {
              expected: declaredUnit,
              actual: bindingRecord['unit'],
            },
          ),
        );
      }
    }
    if (
      (bindingRecord['quantityKind'] !== undefined && typeof bindingRecord['quantityKind'] !== 'string') ||
      (bindingRecord['space'] !== undefined &&
        bindingRecord['space'] !== 'linear' &&
        bindingRecord['space'] !== 'difference' &&
        bindingRecord['space'] !== 'point') ||
      (bindingRecord['reference'] !== undefined && typeof bindingRecord['reference'] !== 'string')
    ) {
      fail(diagnostic('INVALID_ANNOTATION', 'invalid effective quantity semantics', bindingResource, bindingPointer));
    }
    validateSemanticBinding(
      bindingRecord as NonNullable<ParameterDeclaration['bindings']>[string],
      bindingResource,
      bindingPointer,
    );
    const expected = expectedTables.bindings[pointer];
    if (
      expected !== undefined &&
      (bindingRecord['representation'] !== expected.representation ||
        bindingRecord['optional'] !== expected.optional ||
        bindingRecord['nullable'] !== expected.nullable ||
        canonicalizeCacheValue({
          value: asCacheValue(bindingRecord['constraints']),
        }) !== canonicalizeCacheValue({ value: asCacheValue(expected.constraints) }))
    ) {
      fail(
        diagnostic(
          'METADATA_CONFLICT',
          'effective binding changed native representation or constraints',
          bindingResource,
          bindingPointer,
        ),
      );
    }
  }
  for (const [key, provenance] of Object.entries(candidate['provenance'] as Record<string, unknown>)) {
    const field = isRecord(provenance) ? String(provenance['field']) : '';
    if (
      !isRecord(provenance) ||
      !['unit', 'quantity-kind', 'space', 'reference', 'producer', 'source-revision'].includes(field)
    ) {
      fail(
        diagnostic('INVALID_SCHEMA', 'invalid provenance record', rootResource, `/provenance/${escapePointer(key)}`),
      );
    }
    const provenanceRecord = provenance as Record<string, unknown>;
    assertProvenanceRecord(provenanceRecord, `/provenance/${escapePointer(key)}`);
  }
  for (const [index, item] of (candidate['diagnostics'] as unknown[]).entries()) {
    if (
      !isRecord(item) ||
      ![
        'INVALID_SCHEMA',
        'INVALID_ANNOTATION',
        'INVALID_REFERENCE',
        'RESOURCE_LIMIT',
        'METADATA_CONFLICT',
        'SEMANTICS_UNRESOLVED',
        'REPRESENTATION_UNSUPPORTED',
        'LEGACY_PROJECTION_LOSS',
      ].includes(String(item['code'])) ||
      typeof item['message'] !== 'string' ||
      !['error', 'warning'].includes(String(item['severity'])) ||
      typeof item['resource'] !== 'string' ||
      typeof item['schemaPointer'] !== 'string'
    ) {
      fail(diagnostic('INVALID_SCHEMA', 'invalid manifest diagnostic', rootResource, `/diagnostics/${String(index)}`));
    }
  }
  return deepFreeze(candidate as ParameterManifest);
};

/** Synchronous structural guard for the wire codec; it does not grant semantic admission. @internal * @public
 */
export const isParameterManifestShape = (value: unknown): value is ParameterManifest => {
  try {
    const candidate = cloneBoundedJson(value, limits);
    if (
      !isRecord(candidate) ||
      candidate['version'] !== 1 ||
      candidate['profile'] !== profile ||
      !isRecord(candidate['schema']) ||
      !isRecord(candidate['resources']) ||
      !isRecord(candidate['defaults']) ||
      !isRecord(candidate['bindingDeclarations']) ||
      !isRecord(candidate['bindings']) ||
      !isRecord(candidate['provenance']) ||
      !Array.isArray(candidate['diagnostics']) ||
      !isRecord(candidate['legacyProjection']) ||
      !isRecord(candidate['scope']) ||
      !isRecord(candidate['source']) ||
      !isRecord(candidate['identity']) ||
      typeof candidate['revision'] !== 'string'
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

/**
 * Canonically re-admit an effective manifest received from middleware, cache, or transport.
 * @param value - Untrusted effective manifest bytes.
 * @param expectation - Trusted execution identity when the caller owns that context.
 * @returns The canonical immutable manifest reconstructed from its complete declaration.
 * @public
 */
export const admitParameterManifest = async (
  value: unknown,
  expectation?: ParameterAdmissionExpectation,
): Promise<ParameterManifest> => {
  const candidate = inspectParameterManifest(value);
  if (
    expectation !== undefined &&
    (canonical(candidate.scope) !== canonical(expectation.scope) ||
      canonical(candidate.source) !== canonical(expectation.source) ||
      canonical(candidate.identity) !==
        canonical({ ...expectation.identity, resolution: withoutDefaultMode(expectation.identity.resolution) }))
  ) {
    fail(
      diagnostic(
        'METADATA_CONFLICT',
        'manifest identity does not match the trusted execution context',
        rootResource,
        '/identity',
      ),
    );
  }
  if (expectation !== undefined) {
    await assertProducerDeclarationPreserved(candidate, expectation.producerDeclaration);
  }
  const reconstructed = await compileParameterManifest({
    declaration: {
      schema: candidate.schema,
      resources: candidate.resources,
      defaults: candidate.defaults,
      bindings: candidate.bindingDeclarations,
    },
    scope: candidate.scope,
    source: candidate.source,
    dependency: candidate.identity.dependency,
    middleware: candidate.identity.middleware,
    resolution: candidate.identity.resolution,
    sourceFiles: candidate.identity.sourceFiles,
  });
  if (candidate.revision !== reconstructed.revision) {
    fail(
      diagnostic(
        'METADATA_CONFLICT',
        'manifest revision does not match canonical semantic content',
        rootResource,
        '/revision',
        {
          expected: reconstructed.revision,
          actual: candidate.revision,
        },
      ),
    );
  }
  if (canonical(candidate) !== canonical(reconstructed)) {
    fail(
      diagnostic(
        'METADATA_CONFLICT',
        'manifest derived tables do not match the complete declaration',
        rootResource,
        '',
      ),
    );
  }
  return reconstructed;
};

/** Return whether an unknown value is a canonically admitted effective parameter manifest. @public */
export const isParameterManifest = async (value: unknown): Promise<boolean> => {
  try {
    await admitParameterManifest(value);
    return true;
  } catch {
    return false;
  }
};
