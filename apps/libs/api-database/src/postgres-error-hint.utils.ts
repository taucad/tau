/**
 * Maps a `postgres-js` / Node network error to a human-readable hint string.
 *
 * Drizzle's migrator surfaces every connection-level failure as the same
 * opaque `Failed query: CREATE SCHEMA …` message. Our error logging therefore
 * needs an out-of-band classification step that walks `error.code` and
 * `error.cause.code` to disambiguate paused-provider, DNS, TCP timeout, role
 * rotation, pooler exhaustion, and permission failures.
 *
 * Every row corresponds to a real failure mode the migrator otherwise hides.
 */

// Keys are Postgres SQLSTATE / Node network error codes — both ecosystems
// emit them in upper snake-case, so quoting the literal preserves the wire
// format. Using bracket-notation also sidesteps the camelCase naming rule.
const hintByCode: Record<string, string> = {
  /* eslint-disable @typescript-eslint/naming-convention -- Postgres SQLSTATE / Node network error codes */
  ECONNREFUSED: 'Postgres host refused connection — verify provider is not paused/maintenance',
  ENOTFOUND: 'DNS resolution failed — verify DATABASE_URL host',
  ETIMEDOUT: 'TCP timeout — verify VPC / firewall / provider region',
  EAI_AGAIN: 'Transient DNS failure — verify VPC DNS / provider DNS',
  ECONNRESET: 'Connection reset by peer — verify provider failover / pooler state',
  '28P01': 'Authentication failed — secret may be rotated',
  CONNECTION_ENDED: 'Pooler closed connection — verify Supavisor/PgBouncer state',
  CONNECTION_CLOSED: 'Connection closed before first query — verify provider is not paused',
  CONNECTION_DESTROYED: 'Connection destroyed — verify provider failover / maintenance window',
  '42501': 'Insufficient privilege — GRANT CREATE ON DATABASE … TO <role>',
  '42P06': 'Schema exists, owned by another role — ALTER SCHEMA … OWNER TO <role>',
  ERR_TLS_CERT_ALTNAME_INVALID: 'TLS certificate hostname mismatch — verify DATABASE_URL host or sslmode',
  /* eslint-enable @typescript-eslint/naming-convention -- restore rule for downstream code */
};

const fallbackHint = 'Unmapped Postgres error class — see err.code / err.cause for details';

const isObjectWithCode = (value: unknown): value is { code: unknown } =>
  typeof value === 'object' && value !== null && 'code' in value;

const isObjectWithCause = (value: unknown): value is { cause: unknown } =>
  typeof value === 'object' && value !== null && 'cause' in value;

/**
 * Extracts a string error code from an arbitrary thrown value, walking the
 * `cause` chain once. `postgres-js` typically sets `error.code` to a Postgres
 * SQLSTATE or its own connection-state token; underlying `node:net` errors
 * surface their `EXXXXX` codes on `error.cause.code`.
 */
const extractErrorCode = (error: unknown): string | undefined => {
  if (isObjectWithCode(error) && typeof error.code === 'string') {
    return error.code;
  }
  if (isObjectWithCause(error)) {
    const { cause } = error;
    if (isObjectWithCode(cause) && typeof cause.code === 'string') {
      return cause.code;
    }
  }
  return undefined;
};

/**
 * Returns a human-actionable hint for the given error, or a fallback when no
 * mapping matches. Pure function — no logging side effects.
 */
export const mapPostgresErrorToHint = (error: unknown): string => {
  const code = extractErrorCode(error);
  if (code !== undefined && code in hintByCode) {
    return hintByCode[code]!;
  }
  return fallbackHint;
};
