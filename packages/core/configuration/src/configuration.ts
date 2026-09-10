import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec';
import { canonicalizeCacheValue, digestContent } from '@taucad/cache-core';
import type { CacheValue, ContentDigest } from '@taucad/cache-core';
import { admitJsonSchema, validateJsonSchemaValue } from '#admission.js';
import type { JsonSchema } from '#admission.js';

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
export type ConfigurationManifestV1 = Readonly<{
  version: 1;
  source: Readonly<{ id: string; version: string }>;
  dialect: 'draft-07';
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  defaults?: unknown;
  ui: RestrictedRjsfUiSchemaV1;
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

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
};

const materializeSchema = (schema: Record<string, unknown>): JsonSchema => structuredClone(schema);

const assertIdentity = (value: string, name: string): void => {
  if (value.length === 0 || value.length > 128 || !value.isWellFormed()) {
    throw new TypeError(`${name} is invalid`);
  }
};

const schemaProperties = (schema: JsonSchema): Readonly<Record<string, unknown>> => {
  const { properties } = schema;
  return properties !== null && typeof properties === 'object' && !Array.isArray(properties)
    ? (properties as Readonly<Record<string, unknown>>)
    : {};
};

const admitUiOptions = (input: {
  readonly options: RestrictedUiNodeV1['ui:options'];
  readonly widget: RestrictedUiWidgetV1 | undefined;
  readonly nodeSchema: JsonSchema;
  readonly pointer: string;
}): void => {
  const { options, widget, nodeSchema, pointer } = input;
  if (!options) {
    return;
  }
  const stringKeys = ['help', 'icon', 'placeholder'] as const;
  if (stringKeys.some((key) => options[key] !== undefined && typeof options[key] !== 'string')) {
    throw new TypeError(`INVALID_UI_OPTION at ${pointer}`);
  }
  if (options.importance !== undefined && !['advanced', 'normal', 'primary'].includes(options.importance)) {
    throw new TypeError(`INVALID_UI_IMPORTANCE at ${pointer}`);
  }
  if (options.presentation !== undefined) {
    if (!['auto', 'disclosure', 'inline'].includes(options.presentation) || nodeSchema['type'] !== 'object') {
      throw new TypeError(`INVALID_UI_PRESENTATION at ${pointer}`);
    }
  }
  if (
    options.rows !== undefined &&
    (widget !== 'textarea' || !Number.isInteger(options.rows) || options.rows < 1 || options.rows > 100)
  ) {
    throw new TypeError(`INVALID_UI_ROWS at ${pointer}`);
  }
};

const admitUi = (ui: RestrictedRjsfUiSchemaV1, schema: JsonSchema): void => {
  // oxlint-disable-next-line typescript/no-unnecessary-condition -- Runtime manifests are untrusted despite the public literal type.
  if (ui.version !== 1) {
    throw new TypeError('Unsupported UI schema version');
  }
  asCacheValue(ui);
  let nodes = 0;
  let strings = 0;
  // oxlint-disable-next-line complexity -- Closed UI-node admission validates each allowlisted key in one bounded walk.
  const visit = (node: RestrictedUiNodeV1, nodeSchema: JsonSchema, pointer: string): void => {
    nodes += 1;
    if (nodes > 2048) {
      throw new TypeError(`UI_LIMIT at ${pointer}`);
    }
    const properties = schemaProperties(nodeSchema);
    const options = node['ui:options'];
    const widget = node['ui:widget'];
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string') {
        strings += value.length;
      }
      if (strings > 65_536) {
        throw new TypeError(`UI_STRING_LIMIT at ${pointer}`);
      }
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
          if (value.some((item) => item !== '*' && !Object.hasOwn(properties, item))) {
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
          if (key.startsWith('ui:') || !Object.hasOwn(properties, key)) {
            throw new TypeError(`UNSUPPORTED_UI_KEY at ${pointer}/${key}`);
          } else {
            if (value === null || typeof value !== 'object' || Array.isArray(value)) {
              throw new TypeError(`INVALID_UI_NODE at ${pointer}/${key}`);
            }
            visit(value as RestrictedUiNodeV1, properties[key] as JsonSchema, `${pointer}/${key}`);
          }
        }
      }
    }
    admitUiOptions({ options, widget, nodeSchema, pointer });
  };
  visit(ui.rjsf, schema, '/rjsf');
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

/**
 * Materialize and admit a Standard Schema configuration definition.
 * @param source - Validator, JSON Schema capability, defaults, and restricted UI metadata.
 * @returns A frozen serializable manifest paired with its trusted validator.
 * @public
 */
export const defineConfiguration = <Schema extends StandardSchemaV1>(
  source: ConfigurationSource<Schema>,
): ConfigurationDefinition<Schema> => {
  assertIdentity(source.id, 'source.id');
  assertIdentity(source.version, 'source.version');
  const provider = source.jsonSchema ?? (source.schema as Schema & StandardJSONSchemaV1);
  if (provider['~standard']?.jsonSchema === undefined) {
    throw new TypeError('Standard JSON Schema capability is required');
  }
  const inputSchema = materializeSchema(provider['~standard'].jsonSchema.input({ target: 'draft-07' }));
  const outputSchema = materializeSchema(provider['~standard'].jsonSchema.output({ target: 'draft-07' }));
  const ui = structuredClone(source.ui);
  admitJsonSchema(inputSchema);
  admitJsonSchema(outputSchema);
  admitUi(ui, inputSchema);
  const defaults = source.defaults === undefined ? undefined : structuredClone(asCacheValue(source.defaults));
  if (defaults !== undefined) {
    if (!validateJsonSchemaValue(inputSchema, defaults)) {
      throw new TypeError('Defaults do not satisfy the input schema');
    }
  }
  const manifest = deepFreeze({
    version: 1,
    source: { id: source.id, version: source.version },
    dialect: 'draft-07',
    inputSchema,
    outputSchema,
    ...(defaults === undefined ? {} : { defaults }),
    ui,
  } satisfies ConfigurationManifestV1);
  const canonicalManifest = canonicalizeCacheValue({
    value: asCacheValue(manifest),
  });
  return Object.freeze({
    manifest,
    canonicalManifest,
    schema: source.schema,
    manifestDigest: () => digestContent({ bytes: new TextEncoder().encode(canonicalManifest) }),
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
  input.signal?.throwIfAborted();
  const expectedDigest = await input.definition.manifestDigest();
  if (input.manifestDigest !== expectedDigest) {
    throw new TypeError('MANIFEST_CHANGED');
  }
  if (!Number.isSafeInteger(input.formRevision) || input.formRevision < 0) {
    throw new TypeError('INVALID_REVISION');
  }
  asCacheValue(input.value);
  assertPointers(input.value, input.explicitPointers);
  if (!validateJsonSchemaValue(input.definition.manifest.inputSchema, input.value)) {
    throw new TypeError('INPUT_INVALID');
  }
  const result = await input.definition.schema['~standard'].validate(input.value);
  input.signal?.throwIfAborted();
  if (result.issues) {
    return {
      type: 'invalid',
      manifestDigest: input.manifestDigest,
      formRevision: input.formRevision,
      issues: result.issues.map((issue) => ({
        code: 'STANDARD_SCHEMA',
        message: issue.message,
        pointer: issuePointer(issue.path),
      })),
    };
  }
  const output = asCacheValue(result.value);
  if (!validateJsonSchemaValue(input.definition.manifest.outputSchema, output)) {
    throw new TypeError('OUTPUT_INVALID');
  }
  const effectiveDigest = await digestContent({
    bytes: new TextEncoder().encode(canonicalizeCacheValue({ value: output })),
  });
  return {
    type: 'valid',
    manifestDigest: input.manifestDigest,
    formRevision: input.formRevision,
    value: result.value,
    effectiveDigest,
  };
};
