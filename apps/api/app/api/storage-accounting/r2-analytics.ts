import type { AccountingFigures, AccountingObservation } from '#api/storage-accounting/accounting-figures.js';

/**
 * R2 usage from Cloudflare's GraphQL Analytics API (W14 OB3, catalogue N50–N53, source X1).
 *
 * R2 reports per bucket only, so Tau's buckets are named by role: the environment's public and private
 * buckets, and `other` for every other bucket in the account (another environment's included). A bucket
 * name never becomes a label value.
 */

const graphqlEndpoint = 'https://api.cloudflare.com/client/v4/graphql';

/** How far back the storage dataset is read for each bucket's newest sample; Cloudflare samples it sparsely. */
const storageLookbackMilliseconds = 48 * 60 * 60 * 1000;

const hourMilliseconds = 60 * 60 * 1000;

/** One response page per dataset; Tau's account has a handful of buckets, so this is never reached. */
const rowLimit = 10_000;

type R2Role = 'public' | 'private' | 'other';
type R2Window = 'hour' | 'month';

/** The environment's two buckets (`TAU_S3_BUCKET`, `TAU_S3_PRIVATE_BUCKET`). */
export type R2BucketRoles = {
  readonly public: string;
  readonly private: string;
};

type OperationsRow = {
  readonly sum: { readonly requests: number };
  readonly dimensions: {
    readonly bucketName: string;
    readonly actionType: string;
    readonly actionStatus: string;
  };
};

type StorageRow = {
  readonly max: {
    readonly objectCount: number;
    readonly payloadSize: number;
    readonly metadataSize: number;
  };
  readonly dimensions: {
    readonly bucketName: string;
    readonly datetime: string;
  };
};

type BandwidthRow = {
  readonly sum: {
    readonly bytesUpload: number;
    readonly bytesDownload: number;
  };
  readonly dimensions: { readonly bucketName: string };
};

/** The answer to {@link r2AnalyticsQuery}: five aliased datasets for one account. */
export type R2AnalyticsResponse = {
  /* GraphQL sends `null` here on error; optional chaining reads it as absent. */
  readonly data?: {
    readonly viewer: {
      readonly accounts: ReadonlyArray<{
        readonly hour: readonly OperationsRow[];
        readonly month: readonly OperationsRow[];
        readonly storage: readonly StorageRow[];
        readonly bandwidthHour: readonly BandwidthRow[];
        readonly bandwidthMonth: readonly BandwidthRow[];
      }>;
    };
  };
  readonly errors?: ReadonlyArray<{ readonly message: string }>;
};

/** One query for the whole account: R2's limit is 300 queries per five minutes (X3), and this runs hourly. */
export const r2AnalyticsQuery = `query TauR2Usage($accountTag: string!, $hourStart: Time!, $hourEnd: Time!, $monthStart: Time!, $storageSince: Time!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      hour: r2OperationsAdaptiveGroups(limit: ${String(rowLimit)}, filter: { datetime_geq: $hourStart, datetime_lt: $hourEnd }) {
        sum { requests }
        dimensions { bucketName actionType actionStatus }
      }
      month: r2OperationsAdaptiveGroups(limit: ${String(rowLimit)}, filter: { datetime_geq: $monthStart, datetime_lt: $hourEnd }) {
        sum { requests }
        dimensions { bucketName actionType actionStatus }
      }
      storage: r2StorageAdaptiveGroups(limit: ${String(rowLimit)}, filter: { datetime_geq: $storageSince, datetime_lt: $hourEnd }, orderBy: [datetime_DESC]) {
        max { objectCount payloadSize metadataSize }
        dimensions { bucketName datetime }
      }
      bandwidthHour: r2BandwidthUsageAdaptiveGroups(limit: ${String(rowLimit)}, filter: { datetime_geq: $hourStart, datetime_lt: $hourEnd }) {
        sum { bytesUpload bytesDownload }
        dimensions { bucketName }
      }
      bandwidthMonth: r2BandwidthUsageAdaptiveGroups(limit: ${String(rowLimit)}, filter: { datetime_geq: $monthStart, datetime_lt: $hourEnd }) {
        sum { bytesUpload bytesDownload }
        dimensions { bucketName }
      }
    }
  }
}`;

/** R2's price list (R2 pricing): Class A mutates or lists, Class B reads, and these three are free. */
const mutatingActions = new Set([
  'ListBuckets',
  'PutBucket',
  'ListObjects',
  'PutObject',
  'CopyObject',
  'CompleteMultipartUpload',
  'CreateMultipartUpload',
  'LifecycleStorageTierTransition',
  'ListMultipartUploads',
  'UploadPart',
  'UploadPartCopy',
  'ListParts',
  'PutBucketEncryption',
  'PutBucketCors',
  'PutBucketLifecycleConfiguration',
]);
const readingActions = new Set([
  'HeadBucket',
  'HeadObject',
  'GetObject',
  'UsageSummary',
  'GetBucketEncryption',
  'GetBucketLocation',
  'GetBucketCors',
  'GetBucketLifecycleConfiguration',
]);
const freeActions = new Set(['DeleteObject', 'DeleteBucket', 'AbortMultipartUpload']);

type R2RequestAttributes = AccountingObservation<'r2Requests'>['attributes'];

/** An action R2 adds later is counted as Class A, the dearer class, until the registry names it. */
const classOf = (action: string): R2RequestAttributes['tau.r2.class'] =>
  readingActions.has(action) ? 'B' : freeActions.has(action) ? 'free' : 'A';

const actionOf = (action: string): R2RequestAttributes['tau.r2.action'] =>
  mutatingActions.has(action) || readingActions.has(action) || freeActions.has(action)
    ? (action as R2RequestAttributes['tau.r2.action'])
    : 'other';

const statusOf = (status: string): R2RequestAttributes['tau.r2.status'] =>
  status === 'success' || status === 'userError' || status === 'internalError' ? status : 'other';

const roleOf = (bucketName: string, buckets: R2BucketRoles): R2Role =>
  bucketName === buckets.public ? 'public' : bucketName === buckets.private ? 'private' : 'other';

const roles: readonly R2Role[] = ['public', 'private', 'other'];

/** Sums values under equal attributes, so every non-allow-listed bucket folds into one `other` series. */
const summed = <Attributes extends Readonly<Record<string, string>>>(
  entries: ReadonlyArray<{
    readonly value: number;
    readonly attributes: Attributes;
  }>,
): Array<{ value: number; attributes: Attributes }> => {
  const totals = new Map<string, { value: number; attributes: Attributes }>();
  for (const entry of entries) {
    const key = JSON.stringify(entry.attributes);
    const total = totals.get(key);
    if (total === undefined) {
      totals.set(key, { value: entry.value, attributes: entry.attributes });
    } else {
      total.value += entry.value;
    }
  }
  return [...totals.values()];
};

/**
 * Maps one GraphQL answer to the `tau.r2.*` gauges.
 *
 * @param response - Cloudflare's answer to {@link r2AnalyticsQuery}.
 * @param buckets - The environment's public and private bucket names.
 * @returns The four R2 gauges' figures.
 * @throws When the answer holds no account.
 */
export const mapR2Analytics = (response: R2AnalyticsResponse, buckets: R2BucketRoles): AccountingFigures => {
  const account = response.data?.viewer.accounts[0];
  if (account === undefined) {
    /* No account is a wrong id or a token without access, not an empty account: fail the pass. */
    throw new Error('Cloudflare GraphQL Analytics returned no account for the R2 query');
  }

  const requests = (rows: readonly OperationsRow[], window: R2Window): Array<AccountingObservation<'r2Requests'>> =>
    rows.map((row) => ({
      value: row.sum.requests,
      attributes: {
        'tau.r2.bucket': roleOf(row.dimensions.bucketName, buckets),
        'tau.r2.class': classOf(row.dimensions.actionType),
        'tau.r2.action': actionOf(row.dimensions.actionType),
        'tau.r2.status': statusOf(row.dimensions.actionStatus),
        'tau.r2.window': window,
      },
    }));

  /* Each bucket's newest sample, then summed by role. */
  const newest = new Map<string, StorageRow>();
  for (const row of account.storage) {
    const seen = newest.get(row.dimensions.bucketName);
    if (seen === undefined || Date.parse(row.dimensions.datetime) > Date.parse(seen.dimensions.datetime)) {
      newest.set(row.dimensions.bucketName, row);
    }
  }
  const storedBytes = new Map<R2Role, number>();
  const objects = new Map<R2Role, number>();
  for (const [bucketName, row] of newest) {
    const role = roleOf(bucketName, buckets);
    storedBytes.set(role, (storedBytes.get(role) ?? 0) + row.max.payloadSize + row.max.metadataSize);
    objects.set(role, (objects.get(role) ?? 0) + row.max.objectCount);
  }
  const perRole = (
    totals: ReadonlyMap<R2Role, number>,
  ): Array<{ value: number; attributes: { 'tau.r2.bucket': R2Role } }> =>
    roles.flatMap((role) => {
      const value = totals.get(role);
      return value === undefined ? [] : [{ value, attributes: { 'tau.r2.bucket': role } }];
    });

  const bandwidth = (
    rows: readonly BandwidthRow[],
    window: R2Window,
  ): Array<AccountingObservation<'r2BandwidthBytes'>> =>
    rows.flatMap((row) => {
      const bucket = roleOf(row.dimensions.bucketName, buckets);
      return [
        {
          value: row.sum.bytesUpload,
          attributes: {
            'tau.r2.bucket': bucket,
            direction: 'upload',
            'tau.r2.window': window,
          },
        },
        {
          value: row.sum.bytesDownload,
          attributes: {
            'tau.r2.bucket': bucket,
            direction: 'download',
            'tau.r2.window': window,
          },
        },
      ] as const;
    });

  return {
    r2Requests: summed([...requests(account.hour, 'hour'), ...requests(account.month, 'month')]),
    r2StoredBytes: perRole(storedBytes),
    r2Objects: perRole(objects),
    r2BandwidthBytes: summed([
      ...bandwidth(account.bandwidthHour, 'hour'),
      ...bandwidth(account.bandwidthMonth, 'month'),
    ]),
  };
};

/**
 * The windows one pass reads: the last full UTC hour, the month to the end of that hour (the month the
 * hour falls in, so the first hour of a month still reads the month just closed), and the storage
 * dataset's lookback.
 *
 * @param now - Epoch milliseconds.
 * @returns ISO timestamps for the query's variables.
 */
export const r2AnalyticsWindows = (
  now: number,
): {
  hourStart: string;
  hourEnd: string;
  monthStart: string;
  storageSince: string;
} => {
  const hourEnd = Math.floor(now / hourMilliseconds) * hourMilliseconds;
  const hourStart = hourEnd - hourMilliseconds;
  const start = new Date(hourStart);
  const monthStart = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1);
  return {
    hourStart: new Date(hourStart).toISOString(),
    hourEnd: new Date(hourEnd).toISOString(),
    monthStart: new Date(monthStart).toISOString(),
    storageSince: new Date(hourEnd - storageLookbackMilliseconds).toISOString(),
  };
};

/** What the R2 task needs: the account, its Account Analytics read token, and Tau's bucket names. */
export type R2AnalyticsSource = {
  readonly accountId: string;
  readonly token: string;
  readonly buckets: R2BucketRoles;
  /** Injected by tests; the global `fetch` otherwise. */
  readonly fetch?: typeof fetch;
};

/**
 * Runs one GraphQL pull and maps it. Throws on an HTTP or GraphQL error so the pass is counted as
 * `error`; the message carries Cloudflare's own error text and never the token.
 *
 * @param source - The account, token and bucket names.
 * @param now - Epoch milliseconds the windows are cut from.
 * @param signal - The pass's deadline and shutdown; the request also times out after 30 s.
 * @returns The four R2 gauges' figures.
 */
export const readR2Analytics = async (
  source: R2AnalyticsSource,
  now: number = Date.now(),
  signal?: AbortSignal,
): Promise<AccountingFigures> => {
  const fetcher = source.fetch ?? fetch;
  const response = await fetcher(graphqlEndpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${source.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      query: r2AnalyticsQuery,
      variables: { accountTag: source.accountId, ...r2AnalyticsWindows(now) },
    }),
    signal: signal === undefined ? AbortSignal.timeout(30_000) : AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
  });
  if (!response.ok) {
    throw new Error(`Cloudflare GraphQL Analytics answered HTTP ${String(response.status)}`);
  }
  const body = (await response.json()) as R2AnalyticsResponse;
  if (body.errors !== undefined && body.errors.length > 0) {
    throw new Error(
      `Cloudflare GraphQL Analytics refused the R2 query: ${body.errors.map((error) => error.message).join('; ')}`,
    );
  }
  return mapR2Analytics(body, source.buckets);
};
