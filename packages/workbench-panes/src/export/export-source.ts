import type { ComponentType } from 'react';
import { compileParameterManifest, projectJsonSchemaToParameterDeclaration } from '@taucad/parameters';
import type { ParameterManifest } from '@taucad/parameters';
import type { RuntimeContentInput } from '@taucad/runtime';
import type { JSONSchema7 } from '@taucad/runtime/types';
import type { ExportFidelity, FileExtension, FileParameterEntry } from '@taucad/types';
import type { ParameterCommit } from '@taucad/viewer/parameters/rjsf-context';
import { getDiscriminatedUnionInfo } from '@taucad/viewer/parameters/rjsf-utils';
import { isJsonSchemaValid } from '@taucad/viewer/parameters/rjsf-validator';

/**
 * Where an export's files go: a browser download, or the project's `exports/` folder.
 *
 * @public
 */
export type ExportDestination = 'download' | 'project';

/**
 * One format the active kernel can export the entry to, reduced to its best route (BREP before mesh, direct before
 * transcoded).
 *
 * @public
 */
export type ExportFormatEntry = Readonly<{
  format: FileExtension;
  fidelity: ExportFidelity;
  /** Whether the kernel writes the format itself rather than through a transcoder. */
  direct: boolean;
  /** The route's provider, `kernel` or `kernel+transcoder`; it scopes the stored option values. */
  provider: string;
  /** Framework content flags the route accepts (edges, topology), when it accepts any. */
  content?: ExportSchema | undefined;
  /** The route's own options, when it declares any. */
  exportOptions?: ExportSchema | undefined;
}>;

/**
 * Why an entry's formats could not be listed.
 *
 * @public
 */
export type ExportUnavailable = Readonly<{
  /** Stable code, such as `UNKNOWN_TOOL` for a host whose server cannot list formats at all. */
  code: string;
  /** What the person reads: the cause and the next step. */
  message: string;
  /** Ask for the formats again, or `undefined` when asking again cannot help. */
  retry: (() => void) | undefined;
}>;

/**
 * What the pane can offer for one entry.
 *
 * @public
 */
export type ExportEntryState = Readonly<{
  /** Whether the entry has current geometry to export. */
  hasGeometry: boolean;
  /** The formats its kernel offers, or `undefined` while the kernel is not ready to say. */
  formats: readonly ExportFormatEntry[] | undefined;
  /** Why the formats could not be listed, when they could not; the pane shows it in their place. */
  unavailable?: ExportUnavailable | undefined;
}>;

/**
 * The person's export choices, kept between visits.
 *
 * @public
 */
export type ExportPreferences = {
  formatContent: Partial<Record<FileExtension, RuntimeContentInput>>;
  formatOptions: Partial<Record<FileExtension, Record<string, unknown>>>;
  selectedFormats: FileExtension[];
  shouldDownload: boolean;
  shouldSaveToProject: boolean;
  zipMultiple: boolean;
};

/**
 * The choices a first visit starts with.
 *
 * @public
 */
export const defaultExportPreferences: ExportPreferences = {
  formatContent: {},
  formatOptions: {},
  selectedFormats: [],
  shouldDownload: true,
  shouldSaveToProject: false,
  zipMultiple: false,
};

/**
 * Stored preferences, their writer, and whether loading or saving them failed.
 *
 * @public
 */
export type ExportPreferencesState = readonly [
  ExportPreferences,
  (next: ExportPreferences) => void,
  { readonly error?: string | undefined; retry(): void },
];

/**
 * One export the person asked for.
 *
 * @public
 */
export type ExportRequest = Readonly<{
  entryPath: string;
  formats: readonly FileExtension[];
  formatOptions: Partial<Record<FileExtension, Record<string, unknown>>>;
  formatContent: Partial<Record<FileExtension, RuntimeContentInput>>;
  /** Download the files. */
  download: boolean;
  /** Write the files under the project's `exports/` (`exports/<format>/` when several formats are exported). */
  saveToProject: boolean;
  /** Download several formats as one zip. */
  zipMultiple: boolean;
}>;

/**
 * Which formats of a request were exported.
 *
 * @public
 */
export type ExportOutcome = Readonly<{
  succeeded: readonly FileExtension[];
  failed: readonly FileExtension[];
}>;

/**
 * One option form's values held by an authoritative parameter record.
 *
 * @public
 */
export type ExportOptionBinding = Readonly<{
  manifest: ParameterManifest;
  /** The editor rows commit through; its `group` is replaced by the record's active group. */
  commit: ParameterCommit;
  subscribe(listener: () => void): () => void;
  /** The settled record, or `undefined` before it settles. Returns the same object until it changes. */
  getEntry(): FileParameterEntry | undefined;
  replaceValues(values: Record<string, unknown>): Promise<void>;
}>;

/**
 * Opens the authoritative record behind one option form.
 *
 * @public
 */
export type ExportOptionStore = Readonly<{
  open(
    input: Readonly<{
      provider: string;
      configuration: string;
      resolved: ExportSchema;
      /** Values from the preferences file, adopted when the record does not exist yet. */
      legacyValues: Record<string, unknown>;
      signal: AbortSignal;
    }>,
  ): Promise<ExportOptionBinding>;
}>;

/**
 * Transient notices the host shows (the app's toasts).
 *
 * @public
 */
export type ExportNotices = Readonly<{
  success(message: string): void;
  error(message: string): void;
}>;

/**
 * What the Export pane needs from its host beyond the shared units. Each host (the Tau app, the agent plugin viewer)
 * implements it over its own state.
 *
 * @public
 */
export type ExportSource = Readonly<{
  /** The destinations this host offers. With one, it is always chosen and the pane draws it fixed. */
  destinations: readonly ExportDestination[];
  /** Whether several downloaded formats can be zipped into one file. */
  canZip?: boolean | undefined;
  /** Kept preferences. A hook. Without it the pane keeps them for as long as it is mounted. */
  usePreferences?: (() => ExportPreferencesState) | undefined;
  /** Authoritative option records. Without it option values live in the preferences alone. */
  optionStore?: ExportOptionStore | undefined;
  /** Host notices. Without them the pane reports outcomes in a status line under the export button. */
  notices?: ExportNotices | undefined;
  /** The file icon the host draws for a file name. Without it the pane draws a plain file icon. */
  FileIcon?: ComponentType<Readonly<{ filename: string; className?: string }>> | undefined;
  /**
   * The entry's geometry and formats. A hook: it is called during render.
   *
   * @param entryPath - The entry the pane exports.
   * @returns What the entry offers.
   */
  useEntry(entryPath: string): ExportEntryState;
  /**
   * Export the entry. Rejects when nothing could be exported at all, such as when the render failed.
   *
   * @param request - Formats, their options and the chosen destinations.
   * @returns Which formats were exported.
   */
  export(request: ExportRequest): Promise<ExportOutcome>;
}>;

// =============================================================================
// Option schemas
// =============================================================================

/**
 * One export option schema and its defaults, as a route publishes them.
 *
 * @public
 */
export type ExportSchema = Readonly<{
  schema: JSONSchema7;
  defaults: Record<string, unknown>;
}>;

/**
 * Whether a value is a plain object record.
 *
 * @param value - Any value.
 * @returns Whether it is a non-array object.
 */
function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function schemaObject(schema: JSONSchema7 | boolean | undefined): JSONSchema7 | undefined {
  return schema && typeof schema === 'object' ? schema : undefined;
}

function schemaDefaults(schema: JSONSchema7): Record<string, unknown> {
  if (!schema.properties) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(schema.properties).flatMap(([key, property]) => {
      const object = schemaObject(property);
      return object?.default === undefined ? [] : [[key, object.default]];
    }),
  );
}

/**
 * Resolve a discriminated-union root schema to the branch the input selects.
 *
 * @param schema - The route schema.
 * @param input - The current values.
 * @param defaults - The route defaults.
 * @returns The active branch schema and its defaults.
 * @public
 */
export function resolveActiveSchema(
  schema: JSONSchema7,
  input: Record<string, unknown>,
  defaults: Record<string, unknown> = {},
): { schema: JSONSchema7; defaults: Record<string, unknown> } {
  const union = getDiscriminatedUnionInfo(schema);
  if (!union) {
    return { schema, defaults };
  }

  const requestedValue = Object.hasOwn(input, union.discriminator)
    ? input[union.discriminator]
    : Object.hasOwn(defaults, union.discriminator)
      ? defaults[union.discriminator]
      : union.values[0];
  const branchIndex = union.values.findIndex((value) => Object.is(value, requestedValue));
  if (branchIndex === -1) {
    return { schema, defaults };
  }
  const selectedValue = union.values[branchIndex]!;
  const branch = union.branches[branchIndex]!;
  const { anyOf: _anyOf, oneOf: _oneOf, properties: rootProperties, required: rootRequired, ...root } = schema;
  const discriminatorSchema = schemaObject(branch.properties?.[union.discriminator]);
  const properties = {
    ...rootProperties,
    ...branch.properties,
    [union.discriminator]: {
      ...discriminatorSchema,
      enum: [...union.values],
      default: selectedValue,
    },
  } satisfies JSONSchema7['properties'];
  const required = [...new Set([...(rootRequired ?? []), ...(branch.required ?? []), union.discriminator])];
  const activeSchema: JSONSchema7 = {
    ...root,
    ...branch,
    properties,
    required,
  };
  const activeDefaults = {
    ...defaults,
    ...schemaDefaults(branch),
    [union.discriminator]: selectedValue,
  };
  return {
    schema: activeSchema,
    defaults: sanitizeFormDelta(activeSchema, activeDefaults),
  };
}

/**
 * Keep only the top-level values the active schema admits.
 *
 * @param schema - The route schema.
 * @param input - Candidate values.
 * @returns The admitted values.
 * @public
 */
export function sanitizeFormDelta(schema: JSONSchema7, input: Record<string, unknown>): Record<string, unknown> {
  const activeSchema = resolveActiveSchema(schema, input).schema;
  if (!activeSchema.properties) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(input).filter(([key, value]) => {
      const propertySchema = activeSchema.properties?.[key];
      if (propertySchema === true) {
        return true;
      }
      if (!propertySchema) {
        return false;
      }
      return isJsonSchemaValid(propertySchema, value, activeSchema);
    }),
  );
}

/**
 * The top-level values that differ from their defaults.
 *
 * @param formData - Current values.
 * @param defaults - Route defaults.
 * @returns The modified values.
 * @public
 */
export function extractModifiedTopLevel(
  formData: Record<string, unknown>,
  defaults: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(formData).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(defaults[key])),
  );
}

/**
 * Narrow form values to the runtime content flags.
 *
 * @param input - Content form values.
 * @returns The content input the runtime accepts.
 * @public
 */
export function runtimeContentFromRecord(input: Record<string, unknown>): RuntimeContentInput {
  return {
    ...(typeof input['includeEdges'] === 'boolean' ? { includeEdges: input['includeEdges'] } : {}),
    ...(typeof input['includeTopology'] === 'boolean' ? { includeTopology: input['includeTopology'] } : {}),
  };
}

/**
 * Give every batch view without an id a fresh `view-N` id when the schema requires one.
 *
 * @param schema - The active schema.
 * @param input - Current values.
 * @returns The values with ids filled.
 * @public
 */
export function fillMissingBatchViewIds(schema: JSONSchema7, input: Record<string, unknown>): Record<string, unknown> {
  const viewsSchema = schemaObject(schema.properties?.['views']);
  const itemsSchema = viewsSchema?.items;
  const itemSchema = Array.isArray(itemsSchema) ? undefined : schemaObject(itemsSchema);
  const { mode, views } = input;
  if (mode !== 'batch' || !itemSchema?.required?.includes('id') || !Array.isArray(views)) {
    return input;
  }
  const batchViews = views as unknown[];

  const usedIds = new Set(
    batchViews.flatMap((view) =>
      isRecordObject(view) && typeof view['id'] === 'string' && view['id'] ? [view['id']] : [],
    ),
  );
  let nextId = 1;
  return {
    ...input,
    views: batchViews.map((view) => {
      if (!isRecordObject(view) || (typeof view['id'] === 'string' && view['id'])) {
        return view;
      }
      while (usedIds.has(`view-${nextId}`)) {
        nextId++;
      }
      const id = `view-${nextId++}`;
      usedIds.add(id);
      return { ...view, id };
    }),
  };
}

// =============================================================================
// Configuration manifests
// =============================================================================

const safePathSegment = (value: string): string => value.replaceAll(/[^a-z0-9._-]/giu, '_');

const sha256Hex = async (text: string): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');

/**
 * Compile one provider configuration (an export route's option or content schema) into the parameter manifest its
 * values are checked against, and the stable record path they are kept under.
 *
 * @param provider - The route's provider: its kernel id, or `kernel+transcoder`.
 * @param configuration - The configuration's name, such as `export/stl/options`.
 * @param resolved - The schema and defaults.
 * @returns The record path and manifest.
 * @public
 */
export async function compileExportConfigurationManifest(
  provider: string,
  configuration: string,
  resolved: ExportSchema,
): Promise<Readonly<{ entryPath: string; manifest: ParameterManifest }>> {
  const hash = await sha256Hex(JSON.stringify(resolved));
  const scopeHash = await sha256Hex(`${provider}\u0000${configuration}`);
  // SAFETY: Web Crypto produced the 32-byte lowercase SHA-256 payload above.
  const revision = `sha256:${hash}` as ParameterManifest['identity']['dependency'];
  const manifest = await compileParameterManifest({
    declaration: projectJsonSchemaToParameterDeclaration({
      schema: resolved.schema,
      defaults: resolved.defaults,
      schemaId: `urn:taucad:configuration:${encodeURIComponent(provider)}:${encodeURIComponent(configuration)}`,
      schemaName: 'ProviderConfiguration',
    }),
    scope: { kind: 'provider', provider, configuration },
    source: {
      id: `${provider}:${configuration}`,
      version: revision,
      revision,
      capability: 'json-structure',
    },
    dependency: revision,
    middleware: revision,
  });
  return {
    entryPath: `provider-configuration/${safePathSegment(provider)}-${scopeHash.slice(0, 8)}/${safePathSegment(configuration)}-${scopeHash.slice(8, 16)}`,
    manifest,
  };
}

// =============================================================================
// Format groups
// =============================================================================

/**
 * A titled group of export formats of one fidelity.
 *
 * @public
 */
export type ExportFormatGroup<Entry extends Readonly<{ fidelity: 'brep' | 'mesh' }>> = {
  readonly name: string;
  readonly items: Entry[];
};

const exportFormatFidelityGroups = [
  { fidelity: 'brep', name: 'BREP' },
  { fidelity: 'mesh', name: 'Mesh' },
] as const;

/**
 * Group export formats by fidelity in user-facing priority order.
 *
 * @param formats - Formats with their fidelity.
 * @returns The non-empty groups, BREP first.
 * @public
 */
export function groupExportFormatsByFidelity<Entry extends Readonly<{ fidelity: 'brep' | 'mesh' }>>(
  formats: readonly Entry[],
): Array<ExportFormatGroup<Entry>> {
  return exportFormatFidelityGroups.flatMap((group) => {
    const items = formats.filter((entry) => entry.fidelity === group.fidelity);
    return items.length > 0 ? [{ name: group.name, items }] : [];
  });
}
