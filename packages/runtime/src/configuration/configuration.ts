import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec';
import { canonicalizeCacheValue, digestContent } from '@taucad/cache-core';
import type { CacheValue, ContentDigest } from '@taucad/cache-core';
import { admitJsonSchema, resolveLocalSchema, validateJsonSchemaValue } from '@taucad/parameters/schema';
import type { JsonSchema } from '@taucad/parameters/schema';
import { assertBoundedJson, cloneBoundedJson } from '@taucad/parameters/json';
import { configurationIconIds } from '#configuration/configuration-icons.generated.js';
import { admitParameterDeclaration, projectDraft7SchemaToParameterDeclaration } from '@taucad/parameters';
import type { ParameterDeclaration } from '@taucad/parameters';

/** Widgets admitted by configuration manifest version one. @public */
export type RestrictedUiWidgetV1 = 'color' | 'radio' | 'segmented' | 'select' | 'slider' | 'textarea' | 'toggle';
/** Closed JSON-only RJSF node admitted by configuration manifest version one. @public */
export type RestrictedUiNodeV1 = Readonly<{
  [property: string]: unknown;
  'ui:order'?: readonly string[];
  'ui:widget'?: RestrictedUiWidgetV1;
  'ui:options'?: Readonly<{
    icon?: string;
    importance?: 'advanced' | 'normal' | 'primary';
    help?: string;
    placeholder?: string;
    presentation?: 'auto' | 'disclosure' | 'inline';
    rows?: number;
  }>;
}>;
/** Restricted RJSF metadata envelope. @public */
export type RestrictedRjsfUiSchemaV1 = Readonly<{
  version: 1;
  rjsf: RestrictedUiNodeV1;
}>;

/** Serializable configuration manifest version one. @public */
export type ConfigurationNativeProjectionDiagnostic = Readonly<{
  code: 'NATIVE_PROJECTION_UNSUPPORTED';
  reason: string;
}>;

/** Result of deriving a native parameter declaration from Standard Schema metadata. @public */
export type ConfigurationNativeProjection =
  | Readonly<{ status: 'usable'; declaration: ParameterDeclaration }>
  | Readonly<{
      status: 'unsupported';
      defaults: Readonly<Record<string, unknown>>;
      diagnostics: readonly ConfigurationNativeProjectionDiagnostic[];
    }>;

/** Serializable configuration manifest version one. @public */
export type ConfigurationManifestV1 = Readonly<{
  version: 1;
  source: Readonly<{ id: string; version: string }>;
  parameters: Readonly<{
    input: ConfigurationNativeProjection;
    output: ConfigurationNativeProjection;
  }>;
  legacyProjection: Readonly<{
    dialect: 'draft-07';
    inputSchema: JsonSchema;
    outputSchema: JsonSchema;
  }>;
  ui: RestrictedRjsfUiSchemaV1;
}>;

/** A non-fatal compatibility diagnostic produced during manifest admission. @public */
export type ConfigurationAdmissionDiagnostic = Readonly<{ code: 'UNSUPPORTED_UI_ICON'; pointer: string; id: string }>;

/** An admitted manifest and its frozen cosmetic compatibility diagnostics. @public */
export type ConfigurationAdmissionResult = Readonly<{
  manifest: ConfigurationManifestV1;
  diagnostics: readonly ConfigurationAdmissionDiagnostic[];
}>;

type JsonSchemaProvider<Input, Output> = StandardJSONSchemaV1<Input, Output>;
type SchemaSource<Schema extends StandardSchemaV1> = Schema extends StandardJSONSchemaV1
  ? {
      readonly schema: Schema;
      readonly jsonSchema?: JsonSchemaProvider<
        StandardSchemaV1.InferInput<Schema>,
        StandardSchemaV1.InferOutput<Schema>
      >;
    }
  : {
      readonly schema: Schema;
      readonly jsonSchema: JsonSchemaProvider<
        StandardSchemaV1.InferInput<Schema>,
        StandardSchemaV1.InferOutput<Schema>
      >;
    };

/** Input accepted by {@link defineConfiguration}. @public */
export type ConfigurationSource<Schema extends StandardSchemaV1> = SchemaSource<Schema> & {
  readonly id: string;
  readonly version: string;
  readonly defaults?: StandardSchemaV1.InferInput<Schema>;
  readonly ui: RestrictedRjsfUiSchemaV1;
};

/** A materialized manifest paired with its trusted Standard Schema authority. @public */
export type ConfigurationDefinition<Schema extends StandardSchemaV1> = Readonly<{
  manifest: ConfigurationManifestV1;
  diagnostics: readonly ConfigurationAdmissionDiagnostic[];
  canonicalManifest: string;
  schema: Schema;
  manifestDigest: () => Promise<ContentDigest>;
}>;

/** Input for authoritative configuration validation. @public */
export type ValidateConfigurationInput<Schema extends StandardSchemaV1> = Readonly<{
  definition: ConfigurationDefinition<Schema>;
  manifestDigest: string;
  formRevision: number;
  value: unknown;
  explicitPointers: readonly string[];
  signal?: AbortSignal;
}>;

/** Stable issue form shared by authoring authorities and UI consumers. @public */
export type ConfigurationIssue = Readonly<{
  code: string;
  message: string;
  pointer: string;
}>;

/** Result from authoritative configuration validation. @public */
export type ValidateConfigurationResult<Output> =
  | Readonly<{
      type: 'invalid';
      manifestDigest: string;
      formRevision: number;
      issues: readonly ConfigurationIssue[];
    }>
  | Readonly<{
      type: 'valid';
      manifestDigest: string;
      formRevision: number;
      value: Output;
      effectiveDigest: ContentDigest;
    }>;

const asCacheValue = (value: unknown): CacheValue => {
  // SAFETY: canonicalizeCacheValue is the strict runtime proof for this exact value.
  canonicalizeCacheValue({ value: value as CacheValue });
  return value as CacheValue;
};

const configurationLimits = {
  code: 'CONFIGURATION',
  maximumDepth: 20,
  maximumNodes: 2048,
  maximumCharacters: 65_536,
} as const;

const manifestLimits = {
  code: 'MANIFEST',
  maximumDepth: 24,
  maximumNodes: 8192,
  maximumCharacters: 262_144,
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isJsonSchemaProvider = (value: unknown): value is StandardJSONSchemaV1 => {
  if (!isRecord(value)) {
    return false;
  }
  const standard = value['~standard'];
  if (!isRecord(standard)) {
    return false;
  }
  const converter = standard['jsonSchema'];
  return isRecord(converter) && typeof converter['input'] === 'function' && typeof converter['output'] === 'function';
};

const escapePointer = (value: string): string => value.replaceAll('~', '~0').replaceAll('/', '~1');

const assertOnlyKeys = (value: Record<string, unknown>, allowed: ReadonlySet<string>, pointer: string): void => {
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected !== undefined) {
    throw new TypeError(`UNSUPPORTED_MANIFEST_KEY at ${pointer}/${unexpected}`);
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

const projectConverterJson = (value: unknown, seen = new Set<unknown>()): unknown => {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (seen.has(value)) {
    throw new TypeError('JSON Schema capability returned aliased or cyclic data');
  }
  seen.add(value);
  if (Array.isArray(value)) {
    const projected: unknown[] = [];
    const allowedKeys = new Set<PropertyKey>(['length']);
    for (let index = 0; index < value.length; index += 1) {
      allowedKeys.add(String(index));
      const descriptor = Object.getOwnPropertyDescriptor(value, index);
      if (!descriptor?.enumerable || !('value' in descriptor)) {
        throw new TypeError('JSON Schema capability returned a sparse or accessor-backed array');
      }
      projected.push(projectConverterJson(descriptor.value, seen));
    }
    const unexpected = Reflect.ownKeys(value).find((key) => !allowedKeys.has(key));
    if (unexpected !== undefined) {
      throw new TypeError('JSON Schema capability returned a non-JSON array property');
    }
    return projected;
  }
  const projected: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined) {
      throw new TypeError('JSON Schema capability returned an unstable property');
    }
    if (key === '~standard' && !descriptor.enumerable) {
      continue;
    }
    if (typeof key !== 'string' || !descriptor.enumerable || !('value' in descriptor)) {
      throw new TypeError('JSON Schema capability returned a non-JSON property');
    }
    Object.defineProperty(projected, key, {
      value: projectConverterJson(descriptor.value, seen),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return projected;
};

/** Materialize bounded JSON Schema data returned by a trusted converter without executing returned accessors. @internal */
export const materializeConfigurationJsonSchema = (schema: unknown): JsonSchema => {
  assertBoundedJson(schema, configurationLimits);
  const materialized: unknown = cloneBoundedJson(projectConverterJson(schema), configurationLimits);
  if (materialized === null || typeof materialized !== 'object' || Array.isArray(materialized)) {
    throw new TypeError('JSON Schema capability returned a non-object schema');
  }
  return materialized as JsonSchema;
};

const assertIdentity = (value: string, name: string): void => {
  if (value.length === 0 || value.length > 128 || !value.isWellFormed()) {
    throw new TypeError(`${name} is invalid`);
  }
};

const configurationIconIdSet = new Set<string>(configurationIconIds);

type PossibleProperties = ReadonlyMap<string, readonly JsonSchema[]>;

const collectPossibleProperties = (root: JsonSchema, inputs: readonly JsonSchema[]): PossibleProperties => {
  const properties = new Map<string, JsonSchema[]>();
  const pending = [...inputs];
  const seen = new Set<JsonSchema>();
  let nodes = 0;
  while (pending.length > 0) {
    const resolved = resolveLocalSchema(root, pending.pop()!);
    if (seen.has(resolved)) {
      continue;
    }
    seen.add(resolved);
    nodes += 1;
    if (nodes > 2048) {
      throw new TypeError('UI_SCHEMA_LIMIT');
    }
    const direct = resolved['properties'];
    if (isRecord(direct)) {
      for (const [name, value] of Object.entries(direct)) {
        if (isRecord(value)) {
          const existing = properties.get(name) ?? [];
          properties.set(name, [...existing, value]);
        }
      }
    }
    for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
      const branches = resolved[keyword];
      if (Array.isArray(branches)) {
        pending.push(...branches.filter((branch) => isRecord(branch)));
      }
    }
    for (const keyword of ['if', 'then', 'else'] as const) {
      const branch = resolved[keyword];
      if (isRecord(branch)) {
        pending.push(branch);
      }
    }
    const { dependencies } = resolved;
    if (isRecord(dependencies)) {
      pending.push(...Object.values(dependencies).filter((dependency) => isRecord(dependency)));
    }
  }
  return properties;
};

const possibleValueTypes = (root: JsonSchema, schemas: readonly JsonSchema[]): ReadonlySet<string> => {
  const types = new Set<string>();
  const pending = [...schemas];
  const seen = new Set<JsonSchema>();
  while (pending.length > 0) {
    const schema = resolveLocalSchema(root, pending.pop()!);
    if (seen.has(schema)) {
      continue;
    }
    seen.add(schema);
    const declared = Array.isArray(schema['type']) ? schema['type'] : [schema['type']];
    for (const type of declared) {
      if (typeof type === 'string' && type !== 'null') {
        types.add(type);
      }
    }
    for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
      const branches = schema[keyword];
      if (Array.isArray(branches)) {
        pending.push(...branches.filter((branch) => isRecord(branch)));
      }
    }
  }
  return types;
};

const assertCompatibleSchemas = (root: JsonSchema, schemas: readonly JsonSchema[], pointer: string): void => {
  const signatures = new Set(
    schemas
      .map((schema) => [...possibleValueTypes(root, [schema])].sort().join('|'))
      .filter((signature) => signature.length > 0),
  );
  if (signatures.size > 1) {
    throw new TypeError(`AMBIGUOUS_UI_SCHEMA at ${pointer}`);
  }
};

const assertWidgetTypes = (input: {
  readonly root: JsonSchema;
  readonly schemas: readonly JsonSchema[];
  readonly widget: RestrictedUiWidgetV1 | undefined;
  readonly pointer: string;
}): void => {
  const { pointer, root, schemas, widget } = input;
  if (widget === undefined) {
    return;
  }
  const actual = possibleValueTypes(root, schemas);
  const allowed =
    widget === 'slider'
      ? new Set(['integer', 'number'])
      : widget === 'toggle'
        ? new Set(['boolean'])
        : widget === 'color' || widget === 'textarea'
          ? new Set(['string'])
          : new Set(['boolean', 'integer', 'number', 'string']);
  if (actual.size > 0 && [...actual].some((type) => !allowed.has(type))) {
    throw new TypeError(`INCOMPATIBLE_UI_WIDGET at ${pointer}`);
  }
};

const admitUiOptions = (input: {
  readonly options: RestrictedUiNodeV1['ui:options'];
  readonly widget: RestrictedUiWidgetV1 | undefined;
  readonly nodeSchemas: readonly JsonSchema[];
  readonly rootSchema: JsonSchema;
  readonly pointer: string;
  readonly diagnostics: ConfigurationAdmissionDiagnostic[];
}): void => {
  const { diagnostics, options, widget, nodeSchemas, pointer, rootSchema } = input;
  assertCompatibleSchemas(rootSchema, nodeSchemas, pointer);
  assertWidgetTypes({ root: rootSchema, schemas: nodeSchemas, widget, pointer });
  if (!options) {
    return;
  }
  const stringKeys = ['help', 'icon', 'placeholder'] as const;
  if (stringKeys.some((key) => options[key] !== undefined && typeof options[key] !== 'string')) {
    throw new TypeError(`INVALID_UI_OPTION at ${pointer}`);
  }
  if (options.icon !== undefined && !configurationIconIdSet.has(options.icon)) {
    diagnostics.push({
      code: 'UNSUPPORTED_UI_ICON',
      pointer: `${pointer}/ui:options/icon`,
      id: options.icon,
    });
  }
  if (options.importance !== undefined && !['advanced', 'normal', 'primary'].includes(options.importance)) {
    throw new TypeError(`INVALID_UI_IMPORTANCE at ${pointer}`);
  }
  if (
    options.presentation !== undefined &&
    (!['auto', 'disclosure', 'inline'].includes(options.presentation) ||
      nodeSchemas.some((nodeSchema) => !possibleValueTypes(rootSchema, [nodeSchema]).has('object')))
  ) {
    throw new TypeError(`INVALID_UI_PRESENTATION at ${pointer}`);
  }
  if (
    options.rows !== undefined &&
    (widget !== 'textarea' || !Number.isInteger(options.rows) || options.rows < 1 || options.rows > 100)
  ) {
    throw new TypeError(`INVALID_UI_ROWS at ${pointer}`);
  }
};

const admitUi = (
  ui: RestrictedRjsfUiSchemaV1,
  schema: JsonSchema,
  diagnostics: ConfigurationAdmissionDiagnostic[],
): void => {
  // oxlint-disable-next-line typescript/no-unnecessary-condition -- Runtime manifests are untrusted despite the public literal type.
  if (ui.version !== 1) {
    throw new TypeError('Unsupported UI schema version');
  }
  assertBoundedJson(ui, {
    code: 'UI',
    maximumDepth: 20,
    maximumNodes: 2048,
    maximumCharacters: 65_536,
  });
  if (!isRecord(ui.rjsf)) {
    throw new TypeError('INVALID_UI_ROOT');
  }
  let nodes = 0;
  // oxlint-disable-next-line complexity -- Closed UI-node admission validates each allowlisted key in one bounded walk.
  const visit = (node: RestrictedUiNodeV1, nodeSchemas: readonly JsonSchema[], pointer: string): void => {
    nodes += 1;
    if (nodes > 2048) {
      throw new TypeError(`UI_LIMIT at ${pointer}`);
    }
    const properties = collectPossibleProperties(schema, nodeSchemas);
    const options = node['ui:options'];
    const widget = node['ui:widget'];
    for (const [key, value] of Object.entries(node)) {
      switch (key) {
        case 'ui:widget': {
          if (!['color', 'radio', 'segmented', 'select', 'slider', 'textarea', 'toggle'].includes(String(value))) {
            throw new TypeError(`UNSUPPORTED_WIDGET at ${pointer}`);
          }

          break;
        }
        case 'ui:order': {
          if (
            !Array.isArray(value) ||
            value.some((item) => typeof item !== 'string') ||
            new Set(value).size !== value.length ||
            value.filter((item) => item === '*').length > 1
          ) {
            throw new TypeError(`INVALID_UI_ORDER at ${pointer}`);
          }
          const order = value as readonly string[];
          if (order.some((item) => item !== '*' && !properties.has(item))) {
            throw new TypeError(`UNKNOWN_UI_ORDER_KEY at ${pointer}`);
          }

          break;
        }
        case 'ui:options': {
          if (value === null || typeof value !== 'object' || Array.isArray(value)) {
            throw new TypeError(`INVALID_UI_OPTIONS at ${pointer}`);
          }
          const allowed = new Set(['help', 'icon', 'importance', 'placeholder', 'presentation', 'rows']);
          if (Object.keys(value).some((option) => !allowed.has(option))) {
            throw new TypeError(`UNSUPPORTED_UI_OPTION at ${pointer}`);
          }

          break;
        }
        default: {
          const possibleSchemas = properties.get(key);
          if (key.startsWith('ui:') || possibleSchemas === undefined) {
            throw new TypeError(`UNSUPPORTED_UI_KEY at ${pointer}/${escapePointer(key)}`);
          } else {
            if (value === null || typeof value !== 'object' || Array.isArray(value)) {
              throw new TypeError(`INVALID_UI_NODE at ${pointer}/${escapePointer(key)}`);
            }
            visit(value as RestrictedUiNodeV1, possibleSchemas, `${pointer}/${escapePointer(key)}`);
          }
        }
      }
    }
    admitUiOptions({
      options,
      widget,
      nodeSchemas,
      rootSchema: schema,
      pointer,
      diagnostics,
    });
  };
  visit(ui.rjsf, [schema], '/ui/rjsf');
};

const assertPointers = (value: unknown, pointers: readonly string[]): void => {
  if (pointers.length > 128 || new Set(pointers).size !== pointers.length) {
    throw new TypeError('INVALID_POINTERS');
  }
  for (const pointer of pointers) {
    if (pointer === '') {
      continue;
    }
    if (!pointer.startsWith('/') || /~(?![01])/u.test(pointer)) {
      throw new TypeError('INVALID_POINTER');
    }
    let current = value;
    for (const encoded of pointer.slice(1).split('/')) {
      const segment = encoded.replaceAll('~1', '/').replaceAll('~0', '~');
      if (
        ['__proto__', 'constructor', 'prototype'].includes(segment) ||
        current === null ||
        typeof current !== 'object' ||
        !Object.hasOwn(current, segment)
      ) {
        throw new TypeError('ABSENT_POINTER');
      }
      current = (current as Record<string, unknown>)[segment];
    }
  }
};

const issuePointer = (path: StandardSchemaV1.Issue['path']): string =>
  path
    ?.map((part) => {
      const key = typeof part === 'object' ? part.key : part;
      return `/${String(key).replaceAll('~', '~0').replaceAll('/', '~1')}`;
    })
    .join('') ?? '';

const createNativeConfigurationDeclaration = (
  input: Readonly<{
    schema: JsonSchema;
    source: Readonly<{ id: string; version: string }>;
    direction: 'input' | 'output';
    defaults: Readonly<Record<string, unknown>>;
  }>,
): ConfigurationNativeProjection => {
  const { defaults, direction, schema, source } = input;
  try {
    return {
      status: 'usable',
      declaration: projectDraft7SchemaToParameterDeclaration({
        schema,
        defaults,
        schemaId: `urn:taucad:configuration:${encodeURIComponent(source.id)}:${encodeURIComponent(source.version)}:${direction}`,
        schemaName: direction === 'input' ? 'ConfigurationInput' : 'ConfigurationOutput',
      }),
    };
  } catch (error) {
    return deepFreeze({
      status: 'unsupported',
      defaults,
      diagnostics: [
        {
          code: 'NATIVE_PROJECTION_UNSUPPORTED',
          reason: error instanceof Error ? error.message : String(error),
        },
      ],
    });
  }
};

const admitNativeConfigurationProjection = (value: unknown): ConfigurationNativeProjection => {
  if (!isRecord(value)) {
    throw new TypeError('INVALID_NATIVE_PROJECTION');
  }
  if (value['status'] === 'usable') {
    assertOnlyKeys(value, new Set(['status', 'declaration']), '/parameters');
    return { status: 'usable', declaration: admitParameterDeclaration(value['declaration']) };
  }
  if (value['status'] !== 'unsupported' || !isRecord(value['defaults']) || !Array.isArray(value['diagnostics'])) {
    throw new TypeError('INVALID_NATIVE_PROJECTION');
  }
  assertOnlyKeys(value, new Set(['status', 'defaults', 'diagnostics']), '/parameters');
  for (const item of value['diagnostics']) {
    if (!isRecord(item) || item['code'] !== 'NATIVE_PROJECTION_UNSUPPORTED' || typeof item['reason'] !== 'string') {
      throw new TypeError('INVALID_NATIVE_PROJECTION');
    }
  }
  return value as ConfigurationNativeProjection;
};

const projectionDefaults = (projection: ConfigurationNativeProjection): Readonly<Record<string, unknown>> =>
  projection.status === 'usable' ? projection.declaration.defaults : projection.defaults;

/**
 * Admit an untrusted JSON value as the closed configuration manifest format.
 * @param value - Untrusted manifest candidate.
 * @returns A cloned and deeply frozen manifest.
 * @public
 */
export const admitConfigurationManifest = (value: unknown): ConfigurationAdmissionResult => {
  const candidate: unknown = cloneBoundedJson(value, manifestLimits);
  if (!isRecord(candidate)) {
    throw new TypeError('INVALID_MANIFEST');
  }
  assertOnlyKeys(candidate, new Set(['version', 'source', 'parameters', 'legacyProjection', 'ui']), '');
  const { parameters, legacyProjection, source, ui, version } = candidate;
  if (version !== 1) {
    throw new TypeError('UNSUPPORTED_MANIFEST_VERSION');
  }
  if (!isRecord(source)) {
    throw new TypeError('INVALID_MANIFEST_SOURCE');
  }
  assertOnlyKeys(source, new Set(['id', 'version']), '/source');
  if (typeof source['id'] !== 'string' || typeof source['version'] !== 'string') {
    throw new TypeError('INVALID_MANIFEST_SOURCE');
  }
  assertIdentity(source['id'], 'source.id');
  assertIdentity(source['version'], 'source.version');
  if (!isRecord(parameters) || !isRecord(legacyProjection)) {
    throw new TypeError('INVALID_MANIFEST_SCHEMA');
  }
  assertOnlyKeys(parameters, new Set(['input', 'output']), '/parameters');
  assertOnlyKeys(legacyProjection, new Set(['dialect', 'inputSchema', 'outputSchema']), '/legacyProjection');
  if (legacyProjection['dialect'] !== 'draft-07') {
    throw new TypeError('INVALID_MANIFEST_SCHEMA');
  }
  const { inputSchema, outputSchema } = legacyProjection;
  if (!isRecord(inputSchema) || !isRecord(outputSchema)) {
    throw new TypeError('INVALID_MANIFEST_SCHEMA');
  }
  const input = admitNativeConfigurationProjection(parameters['input']);
  const output = admitNativeConfigurationProjection(parameters['output']);
  admitJsonSchema(inputSchema);
  admitJsonSchema(outputSchema);
  const configurationSource = { id: source['id'], version: source['version'] };
  const expectedInput = createNativeConfigurationDeclaration({
    schema: inputSchema,
    source: configurationSource,
    direction: 'input',
    defaults: projectionDefaults(input),
  });
  const expectedOutput = createNativeConfigurationDeclaration({
    schema: outputSchema,
    source: configurationSource,
    direction: 'output',
    defaults: {},
  });
  if (
    canonicalizeCacheValue({ value: asCacheValue(input) }) !==
      canonicalizeCacheValue({ value: asCacheValue(expectedInput) }) ||
    canonicalizeCacheValue({ value: asCacheValue(output) }) !==
      canonicalizeCacheValue({ value: asCacheValue(expectedOutput) })
  ) {
    throw new TypeError('NATIVE_PROJECTION_MISMATCH');
  }
  if (!isRecord(ui)) {
    throw new TypeError('INVALID_MANIFEST_UI');
  }
  assertOnlyKeys(ui, new Set(['version', 'rjsf']), '/ui');
  const diagnostics: ConfigurationAdmissionDiagnostic[] = [];
  admitUi(ui as RestrictedRjsfUiSchemaV1, inputSchema, diagnostics);
  const inputDefaults = projectionDefaults(input);
  if (Object.keys(inputDefaults).length > 0 && !validateJsonSchemaValue(inputSchema, inputDefaults)) {
    throw new TypeError('Defaults do not satisfy the input schema');
  }
  return deepFreeze({
    manifest: candidate as ConfigurationManifestV1,
    diagnostics,
  });
};

/**
 * Materialize and admit a Standard Schema configuration definition.
 * @param source - Validator, JSON Schema capability, defaults, and restricted UI metadata.
 * @returns A frozen serializable manifest paired with its trusted validator.
 * @public
 */
export const defineConfiguration = <Schema extends StandardSchemaV1>(
  source: ConfigurationSource<Schema> & Readonly<{ schema: Schema }>,
): ConfigurationDefinition<Schema> => {
  assertIdentity(source.id, 'source.id');
  assertIdentity(source.version, 'source.version');
  const trustedSchema: Schema = source.schema;
  const sourceRecord: Record<string, unknown> = source;
  const providerCandidate = sourceRecord['jsonSchema'] ?? trustedSchema;
  if (!isJsonSchemaProvider(providerCandidate)) {
    throw new TypeError('Standard JSON Schema capability is required');
  }
  const provider = providerCandidate;
  const capability = provider['~standard'].jsonSchema;
  const inputSchema = materializeConfigurationJsonSchema(capability.input({ target: 'draft-07' }));
  const outputSchema = materializeConfigurationJsonSchema(capability.output({ target: 'draft-07' }));
  const defaults = source.defaults === undefined ? undefined : cloneBoundedJson(source.defaults, configurationLimits);
  const nativeDefaults = isRecord(defaults) ? defaults : {};
  const admission = admitConfigurationManifest({
    version: 1,
    source: { id: source.id, version: source.version },
    parameters: {
      input: createNativeConfigurationDeclaration({
        schema: inputSchema,
        source,
        direction: 'input',
        defaults: nativeDefaults,
      }),
      output: createNativeConfigurationDeclaration({ schema: outputSchema, source, direction: 'output', defaults: {} }),
    },
    legacyProjection: { dialect: 'draft-07', inputSchema, outputSchema },
    ui: source.ui,
  } satisfies ConfigurationManifestV1);
  const { manifest } = admission;
  const canonicalManifest = canonicalizeCacheValue({
    value: asCacheValue(manifest),
  });
  return Object.freeze({
    manifest,
    diagnostics: admission.diagnostics,
    canonicalManifest,
    schema: trustedSchema,
    manifestDigest: async () => digestContent({ bytes: new TextEncoder().encode(canonicalManifest) }),
  });
};

/**
 * Run authoritative async validation, transformation, and output admission.
 * @param input - Definition identity, form revision, explicit pointers, submitted value, and cancellation signal.
 * @returns The revision-fenced validation result.
 * @public
 */
export const validateConfiguration = async <Schema extends StandardSchemaV1>(
  input: ValidateConfigurationInput<Schema>,
): Promise<ValidateConfigurationResult<StandardSchemaV1.InferOutput<Schema>>> => {
  const { definition, manifestDigest, formRevision, signal } = input;
  const value = cloneBoundedJson(input.value, configurationLimits);
  const pointerValue = cloneBoundedJson(input.explicitPointers, configurationLimits);
  if (!Array.isArray(pointerValue)) {
    throw new TypeError('INVALID_POINTERS');
  }
  const explicitPointers = pointerValue as readonly string[];
  signal?.throwIfAborted();
  const expectedDigest = await definition.manifestDigest();
  if (manifestDigest !== expectedDigest) {
    throw new TypeError('MANIFEST_CHANGED');
  }
  if (!Number.isSafeInteger(formRevision) || formRevision < 0) {
    throw new TypeError('INVALID_REVISION');
  }
  assertPointers(value, explicitPointers);
  const result = await definition.schema['~standard'].validate(value);
  signal?.throwIfAborted();
  if (result.issues) {
    return {
      type: 'invalid',
      manifestDigest,
      formRevision,
      issues: result.issues.map((issue) => ({
        code: 'STANDARD_SCHEMA',
        message: issue.message,
        pointer: issuePointer(issue.path),
      })),
    };
  }
  const output = deepFreeze(cloneBoundedJson(result.value, configurationLimits));
  const effectiveDigest = await digestContent({
    bytes: new TextEncoder().encode(canonicalizeCacheValue({ value: output })),
  });
  return {
    type: 'valid',
    manifestDigest,
    formRevision,
    value: output as StandardSchemaV1.InferOutput<Schema>,
    effectiveDigest,
  };
};
