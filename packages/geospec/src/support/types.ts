/**
 * Structural types GeoSpec owns in place of Tau's runtime types, so that `geospec` depends on no Tau
 * package. Each one is structurally identical to (or wider than) Tau's, so Tau values stay assignable.
 */

/**
 * A JSON value can be a string, number, boolean, object, array, or null.
 *
 * @public
 */
// oxlint-disable-next-line @typescript-eslint/no-restricted-types -- JSON value type uses null
export type JSONValue = null | string | number | boolean | JSONObject | JSONArray; // eslint-disable-line @typescript-eslint/naming-convention -- JSON acronym is conventionally all-caps

/** A JSON object: string keys to JSON values. @public */
// eslint-disable-next-line @typescript-eslint/naming-convention -- JSON object type
export type JSONObject = {
  [key: string]: JSONValue;
};

/** A JSON array of JSON values. @public */
// eslint-disable-next-line @typescript-eslint/naming-convention -- JSON array type
export type JSONArray = JSONValue[];

/**
 * Runtime issue codes a kernel diagnostic may carry, as Tau's runtime registers them. A host may add codes; GeoSpec
 * diagnostics accept any string beside these.
 *
 * @public
 */
export type KernelIssueCode =
  | 'OPERATION_TIMEOUT'
  | 'KERNEL_BINDING_FAILED'
  | 'KERNEL_CAPABILITY_MISSING'
  | 'KERNEL_NOT_PREPARED'
  | 'LIBRARY_VERSION_MISMATCH'
  | 'KERNEL_REALM_CONFLICT'
  | 'TRANSCODER_CAPABILITY_MISSING'
  | 'TRANSCODER_OPTIONS_INVALID'
  | 'TRANSCODER_INITIALIZATION_FAILED'
  | 'TRANSCODER_EXECUTION_FAILED'
  | 'TRANSCODER_TIMEOUT'
  | 'BUNDLER_FAILED'
  | 'MIDDLEWARE_FAILED'
  | 'INVALID_SCHEMA'
  | 'INVALID_ANNOTATION'
  | 'INVALID_REFERENCE'
  | 'RESOURCE_LIMIT'
  | 'TESSELLATION_DOWNGRADED'
  | 'DISPLAY_SIMPLIFIED'
  | 'METADATA_CONFLICT'
  | 'SEMANTICS_UNRESOLVED'
  | 'REPRESENTATION_UNSUPPORTED'
  | 'LEGACY_PROJECTION_LOSS'
  | 'INVALID_RECORD'
  | 'RENDER_ARTIFACT_MISSING'
  | 'GLTF_BYTES_INVALID'
  | 'SVG_DOCUMENT_INVALID'
  | 'HANDLE_MISSING'
  | 'VIEW_UNKNOWN'
  | 'VIEW_UNAVAILABLE'
  | 'VIEW_OPTIONS_INVALID'
  | 'EXPORT_UNKNOWN'
  | 'EXPORT_AMBIGUOUS'
  | 'EXPORT_OPTIONS_INVALID'
  | 'EVALUATE_OPTIONS_INVALID'
  | 'EXPORT_ARTIFACT_SET_INVALID'
  | 'RUNTIME_CONTENT_UNSUPPORTED'
  | 'SOURCE_SNAPSHOT_CHANGED'
  | 'SOURCE_SNAPSHOT_INVALID'
  | 'GEOMETRY_INVALID'
  | 'AUTHENTICATION_ERROR'
  | 'RUNTIME'
  | 'UNKNOWN';

/**
 * The exact source a request-scoped kernel operation read: one entry per project source file in the entry's resolved
 * dependency closure, keyed by rooted path, valued with the SHA-256 digest of the bytes read, or `'missing'` for an
 * import that resolved to no file.
 *
 * @public
 */
export type SourceRevision = Readonly<{
  /** Rooted path of the entry file the operation evaluated. */
  entry: string;
  /** Content digest per rooted source path; `'missing'` where the import resolved to no file. */
  files: Readonly<Record<string, `sha256:${string}` | 'missing'>>;
}>;
