/**
 * The cron path: poll R2 Data Access Logs through the Workers Observability telemetry query API.
 *
 * Every 5 minutes the Worker reads the `r2` dataset over the last 10 minutes, so consecutive windows
 * overlap and an event delivered late is still read once. Each event's id is marked in KV, so the
 * overlap never reports an event twice. The poll keeps write and delete actions on every bucket that
 * has Data Access Logs on, and compares each one's actor with the bucket's expected writers. A bulk
 * delete on the dependency bucket also alarms: the lock refuses it per key inside a 200 response, so
 * unlike a refused single delete (409, not logged) it reaches the log.
 *
 * The telemetry is account-wide, and environments can share an account. Events on a bucket in
 * `AUDIT_FOREIGN_BUCKETS` belong to the other environment's Worker and are skipped before either check,
 * unless the bucket is also one of this Worker's own (an expected-writer or the dependency bucket).
 *
 * Request and response shapes follow Cloudflare's API reference for
 * `POST /accounts/{account_id}/workers/observability/telemetry/query` and the R2 Data Access Logs field
 * list. Where an event's fields sit is read defensively: nested under `source`, as dotted keys on
 * `source`, or on the event itself.
 */

import type { AuditKv, ExpectedWriterMap } from '#environment.js';
import { auditEvents } from '#log.js';
import type { AuditRecordLine } from '#log.js';
import { unexpectedWriter } from '#writers.js';

/** Data Access Log actions the poll keeps. */
export const polledActions: readonly string[] = [
  'PutObject',
  'CopyObject',
  'CompleteMultipartUpload',
  'DeleteObject',
  'DeleteObjects',
  'DeleteObjectsByPrefix',
];

/** Bulk deletes: an attempt on the dependency bucket alarms whatever its outcome. */
export const bulkDeleteActions: ReadonlySet<string> = new Set(['DeleteObjects', 'DeleteObjectsByPrefix']);

/** The window each pass reads: twice the 5-minute cron interval. */
export const pollWindowMilliseconds = 10 * 60 * 1000;

/**
 * Events per query. Each new event costs two KV operations and a Worker invocation may make 1,000, so
 * 400 keeps a pass well inside that. A full page is reported as `truncated` in the heartbeat.
 */
export const pollLimit = 400;

/** How long a seen mark lives: well past any window that could still contain the event. */
export const seenTtlSeconds = 60 * 60;

const apiBase = 'https://api.cloudflare.com/client/v4';

/** One polled event, reduced to the fields the checks read. */
export type DataAccessEvent = Readonly<{
  id: string;
  timestamp?: number;
  action: string;
  bucket: string;
  key?: string;
  interface?: string;
  accessKeyId?: string;
  scriptName?: string;
}>;

/** A poll's outcome before de-duplication. */
export type PollFetchResult =
  | Readonly<{
      ok: true;
      events: readonly DataAccessEvent[];
      truncated: boolean;
    }>
  | Readonly<{ ok: false; detail: string }>;

/** A whole poll's outcome. */
export type PollResult =
  | Readonly<{
      ok: true;
      lines: AuditRecordLine[];
      eventsSeen: number;
      eventsNew: number;
      eventsForeign: number;
      truncated: boolean;
    }>
  | Readonly<{ ok: false; detail: string }>;

/** What the poll needs. */
export type PollInput = Readonly<{
  accountId: string;
  token: string;
  /** End of the window, Unix milliseconds. */
  to: number;
  kv: AuditKv;
  expected: ExpectedWriterMap;
  dependencyBucket: string | undefined;
  /** The parsed `AUDIT_FOREIGN_BUCKETS`: another environment's buckets, skipped. Absent skips none. */
  foreignBuckets?: ReadonlySet<string>;
  environment: string;
  fetch: typeof fetch;
}>;

/**
 * The telemetry query request body for one window.
 *
 * @param to - The window's end, Unix milliseconds.
 * @returns The JSON body.
 */
export const pollQuery = (to: number): Record<string, unknown> => ({
  queryId: 'tau-r2-audit-poll',
  // Run the inline query without saving it.
  dry: true,
  view: 'events',
  limit: pollLimit,
  timeframe: { from: to - pollWindowMilliseconds, to },
  parameters: {
    datasets: ['r2'],
    filterCombination: 'or',
    filters: polledActions.map((action) => ({
      key: 'action',
      operation: 'eq',
      type: 'string',
      value: action,
    })),
  },
});

const objectOf = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

/** Read a dotted path nested (`a.b`), then as one dotted key (`"a.b"`). */
const pathIn = (record: Record<string, unknown> | undefined, path: string): unknown => {
  if (record === undefined) {
    return undefined;
  }
  if (path in record) {
    return record[path];
  }
  let current: unknown = record;
  for (const part of path.split('.')) {
    current = objectOf(current)?.[part];
  }
  return current;
};

const stringAt = (records: ReadonlyArray<Record<string, unknown> | undefined>, path: string): string | undefined => {
  for (const record of records) {
    const value = pathIn(record, path);
    if (typeof value === 'string' && value !== '') {
      return value;
    }
  }
  return undefined;
};

const hex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

/**
 * Reduce one telemetry event to the fields the checks read.
 *
 * @param raw - One `result.events.events[]` item.
 * @returns The event, or `undefined` when it names no action or bucket.
 */
export const readDataAccessEvent = async (raw: unknown): Promise<DataAccessEvent | undefined> => {
  const event = objectOf(raw);
  if (event === undefined) {
    return undefined;
  }
  const source = objectOf(event['source']);
  const records = [source, event];
  const action = stringAt(records, 'action');
  const bucket = stringAt(records, 'bucket');
  if (action === undefined || bucket === undefined) {
    return undefined;
  }
  const timestamp = typeof event['timestamp'] === 'number' ? event['timestamp'] : undefined;
  const metadataId = stringAt([objectOf(event['$metadata'])], 'id');
  // Without an id, the event's own content is its identity: the same record in two windows hashes alike.
  const id =
    metadataId ??
    `sha256-${hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([timestamp, event['source']]))))}`;
  const optional = {
    key: stringAt(records, 'resource.key'),
    interface: stringAt(records, 'interface'),
    accessKeyId: stringAt(records, 'actor.accessKeyId'),
    scriptName: stringAt(records, 'scriptName'),
  };
  return {
    id,
    action,
    bucket,
    ...(timestamp === undefined ? {} : { timestamp }),
    ...Object.fromEntries(Object.entries(optional).filter(([, value]) => value !== undefined)),
  };
};

/**
 * Query one window of the `r2` dataset.
 *
 * @param input - The account, token, window end and fetch.
 * @returns The polled write and delete events, or why the query failed. The detail never holds the
 *   response body or the token.
 */
export const fetchDataAccessEvents = async (
  input: Pick<PollInput, 'accountId' | 'token' | 'to' | 'fetch'>,
): Promise<PollFetchResult> => {
  let response: Response;
  try {
    response = await input.fetch(
      `${apiBase}/accounts/${encodeURIComponent(input.accountId)}/workers/observability/telemetry/query`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${input.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(pollQuery(input.to)),
      },
    );
  } catch {
    return { ok: false, detail: 'network' };
  }
  if (!response.ok) {
    return { ok: false, detail: `http-${String(response.status)}` };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, detail: 'api-error' };
  }
  const envelope = objectOf(body);
  const raw = pathIn(objectOf(envelope?.['result']), 'events.events');
  if (envelope?.['success'] !== true || (raw !== undefined && !Array.isArray(raw))) {
    return { ok: false, detail: 'api-error' };
  }
  const items: readonly unknown[] = Array.isArray(raw) ? raw : [];
  const read = await Promise.all(items.map(async (item) => readDataAccessEvent(item)));
  const events = read.filter(
    (event): event is DataAccessEvent => event !== undefined && polledActions.includes(event.action),
  );
  return { ok: true, events, truncated: items.length >= pollLimit };
};

/**
 * The lines one new event produces.
 *
 * @param event - The event.
 * @param context - The parsed `AUDIT_EXPECTED_WRITERS`, the watched dependency bucket and the environment label.
 * @returns A delete-attempt alarm, an unexpected-writer alarm, both, or none.
 */
export const checkDataAccessEvent = (
  event: DataAccessEvent,
  context: Readonly<{
    expected: ExpectedWriterMap;
    dependencyBucket: string | undefined;
    environment: string;
  }>,
): AuditRecordLine[] => {
  const { expected, dependencyBucket, environment } = context;
  const base: Omit<AuditRecordLine, 'event'> = {
    environment,
    source: 'data-access-log',
    bucket: event.bucket,
    action: event.action,
    ...(event.key === undefined ? {} : { key: event.key }),
    ...(event.timestamp === undefined ? {} : { eventTime: new Date(event.timestamp).toISOString() }),
    ...(event.accessKeyId === undefined ? {} : { accessKeyId: event.accessKeyId }),
    ...(event.interface === undefined ? {} : { interface: event.interface }),
    ...(event.scriptName === undefined ? {} : { scriptName: event.scriptName }),
  };
  const lines: AuditRecordLine[] = [];
  if (event.bucket === dependencyBucket && bulkDeleteActions.has(event.action)) {
    lines.push({ ...base, event: auditEvents.dependencyDeleteAttempt });
  }
  const reason = unexpectedWriter(expected, event);
  if (reason !== undefined) {
    lines.push({ ...base, event: auditEvents.unexpectedWriter, reason });
  }
  return lines;
};

/**
 * Whether an event belongs to another environment's Worker.
 *
 * A bucket this Worker watches itself is never foreign, so a misconfigured list cannot silence it.
 *
 * @param event - The event.
 * @param input - The foreign buckets, the expected writers and the dependency bucket.
 * @returns True when the event's bucket is foreign.
 */
export const isForeignEvent = (
  event: Pick<DataAccessEvent, 'bucket'>,
  input: Pick<PollInput, 'foreignBuckets' | 'expected' | 'dependencyBucket'>,
): boolean =>
  input.foreignBuckets?.has(event.bucket) === true &&
  !input.expected.buckets.has(event.bucket) &&
  event.bucket !== input.dependencyBucket;

/**
 * Keep the events no earlier pass has seen, and mark them seen.
 *
 * The mark is written before the event's lines are logged, so a pass that dies in between loses
 * those lines rather than repeating them; the notification path still covers the dependency bucket.
 *
 * @param events - The window's events.
 * @param kv - The `AUDIT_KV` namespace.
 * @returns The new events, in order.
 */
export const unseenEvents = async (events: readonly DataAccessEvent[], kv: AuditKv): Promise<DataAccessEvent[]> => {
  const fresh: DataAccessEvent[] = [];
  const thisPass = new Set<string>();
  /* oxlint-disable no-await-in-loop -- One mark at a time, in window order, so a repeat within the window is caught by `thisPass` before KV is asked. */
  for (const event of events) {
    const mark = `seen:${event.id}`;
    if (thisPass.has(mark) || (await kv.get(mark)) !== null) {
      continue;
    }
    thisPass.add(mark);
    await kv.put(mark, '1', { expirationTtl: seenTtlSeconds });
    fresh.push(event);
  }
  /* oxlint-enable no-await-in-loop -- end of the sequential marks */
  return fresh;
};

/**
 * Run one poll: query, skip foreign buckets, de-duplicate, check.
 *
 * @param input - Everything the poll needs.
 * @returns The alarm lines and counts, or why the poll failed.
 */
export const pollDataAccessLogs = async (input: PollInput): Promise<PollResult> => {
  const fetched = await fetchDataAccessEvents(input);
  if (!fetched.ok) {
    return fetched;
  }
  const own = fetched.events.filter((event) => !isForeignEvent(event, input));
  let fresh: DataAccessEvent[];
  try {
    fresh = await unseenEvents(own, input.kv);
  } catch {
    return { ok: false, detail: 'kv' };
  }
  return {
    ok: true,
    lines: fresh.flatMap((event) => checkDataAccessEvent(event, input)),
    eventsSeen: fetched.events.length,
    eventsNew: fresh.length,
    eventsForeign: fetched.events.length - own.length,
    truncated: fetched.truncated,
  };
};
