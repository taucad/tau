/**
 * The Worker's bindings, as tau-cloud's `modules/cloudflare-r2-audit` declares them.
 *
 * The names are the contract with that module's `main.tf` (`local.binding_*`); renaming one is a
 * coordinated change. The Worker holds no R2 binding: it only reads event notifications from its
 * queue and Data Access Logs from the telemetry query API.
 */

/** Options a KV write takes; only the time to live is used. */
export type AuditKvPutOptions = Readonly<{ expirationTtl?: number }>;

/** The face of the `AUDIT_KV` namespace the Worker uses. KV answers a missing key with `null`. */
/* oxlint-disable typescript/no-restricted-types -- `null` is the KV binding's own absence value. */
export type AuditKv = Readonly<{
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string, options?: AuditKvPutOptions) => Promise<void>;
}>;
/* oxlint-enable typescript/no-restricted-types -- end of the KV binding's shape */

/** The Worker's bindings. */
export type AuditEnvironment = Readonly<{
  /** `kv_namespace`: created key and eTag records, and the poll's de-duplication marks. */
  AUDIT_KV: AuditKv;
  /** `plain_text`: `staging` or `prod-us`, stamped on every line. */
  AUDIT_ENVIRONMENT: string;
  /** `plain_text`: the watched dependency bucket; `-` when the stack names none. */
  AUDIT_DEPENDENCY_BUCKET: string;
  /** `plain_text`: the Cloudflare account the telemetry query reads. */
  AUDIT_ACCOUNT_ID: string;
  /** `secret_text`: JSON `{"<bucket>": {"token_ids": [...], "scripts": [...]}}`. */
  AUDIT_EXPECTED_WRITERS?: string;
  /** `secret_text`, only behind tau-cloud's `query_token_enabled` gate: the Workers Observability Write token. */
  AUDIT_QUERY_TOKEN?: string;
  /**
   * `plain_text`, optional: JSON `["<bucket>", ...]`, the buckets another environment's audit Worker owns in
   * this shared account. The poll skips their events.
   */
  AUDIT_FOREIGN_BUCKETS?: string;
}>;

/** One bucket's expected writers: token ids (Data Access Logs' `actor.accessKeyId`) and Worker script names. */
export type ExpectedWriters = Readonly<{
  tokenIds: ReadonlySet<string>;
  scripts: ReadonlySet<string>;
}>;

/** The parsed `AUDIT_EXPECTED_WRITERS`; `valid` is false when the binding was missing or malformed. */
export type ExpectedWriterMap = Readonly<{
  valid: boolean;
  buckets: ReadonlyMap<string, ExpectedWriters>;
}>;

const stringList = (value: unknown): readonly string[] | undefined =>
  Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : undefined;

/**
 * Parse `AUDIT_EXPECTED_WRITERS`.
 *
 * A missing, unparseable or mistyped value yields no buckets, so every polled write reads as unexpected:
 * a broken binding alarms instead of silencing the check.
 *
 * @param raw - The binding's text.
 * @returns The expected writers per bucket, and whether the text was well formed.
 */
export const parseExpectedWriters = (raw: string | undefined): ExpectedWriterMap => {
  const invalid: ExpectedWriterMap = { valid: false, buckets: new Map() };
  if (raw === undefined || raw.trim() === '') {
    return invalid;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return invalid;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return invalid;
  }
  const buckets = new Map<string, ExpectedWriters>();
  for (const [bucket, entry] of Object.entries(parsed)) {
    const record = typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : {};
    const tokenIds = stringList(record['token_ids']);
    const scripts = stringList(record['scripts']);
    if (tokenIds === undefined || scripts === undefined) {
      return invalid;
    }
    buckets.set(bucket, {
      tokenIds: new Set(tokenIds),
      scripts: new Set(scripts),
    });
  }
  return { valid: true, buckets };
};

/** The parsed `AUDIT_FOREIGN_BUCKETS`; `valid` is false only when the binding is set but malformed. */
export type ForeignBuckets = Readonly<{
  valid: boolean;
  buckets: ReadonlySet<string>;
}>;

/**
 * Parse `AUDIT_FOREIGN_BUCKETS`.
 *
 * A missing or empty value names no buckets and is valid: the poll then checks every bucket, as it did
 * before the binding existed. An unparseable or mistyped value also names no buckets, so the other
 * environment's writes alarm instead of a broken binding silencing anything, and reads as invalid.
 *
 * @param raw - The binding's text.
 * @returns The foreign bucket names, and whether the text was well formed.
 */
export const parseForeignBuckets = (raw: string | undefined): ForeignBuckets => {
  if (raw === undefined || raw.trim() === '') {
    return { valid: true, buckets: new Set() };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { valid: false, buckets: new Set() };
  }
  const buckets = stringList(parsed);
  return buckets === undefined ? { valid: false, buckets: new Set() } : { valid: true, buckets: new Set(buckets) };
};

/**
 * The watched dependency bucket, or `undefined` when tau-cloud bound its `-` placeholder.
 *
 * @param environment - The bindings.
 * @returns The bucket name.
 */
export const dependencyBucket = (environment: AuditEnvironment): string | undefined => {
  const bucket = environment.AUDIT_DEPENDENCY_BUCKET.trim();
  return bucket === '' || bucket === '-' ? undefined : bucket;
};
