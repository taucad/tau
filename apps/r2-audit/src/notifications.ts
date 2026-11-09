/**
 * The queue path: R2 event notifications from the locked dependency bucket.
 *
 * A notification carries the bucket, action, key, size, eTag and time, but no actor. So these checks
 * are about what happened, not who did it:
 *
 * - an `object-create` (`PutObject`, `CopyObject`, `CompleteMultipartUpload`) is recorded in KV by key
 *   with its eTag; a second create for a recorded key is an overwrite, which the bucket lock should
 *   have refused;
 * - a key outside `blobs/sha256/<64 lowercase hex>` is a layout breach;
 * - any `object-delete` (`DeleteObject`, `LifecycleDeletion`) is a lock failure.
 *
 * Queues deliver at least once. A redelivered create has the same eTag and event time as the record,
 * so it is recognised and writes nothing.
 */

import type { AuditKv } from '#environment.js';
import { auditEvents } from '#log.js';
import type { AuditRecordLine } from '#log.js';

/** The only key layout the dependency bucket admits. */
export const dependencyKeyPattern = /^blobs\/sha256\/[0-9a-f]{64}$/u;

/** Notification actions that create an object (overwrites included). */
export const createActions: ReadonlySet<string> = new Set(['PutObject', 'CopyObject', 'CompleteMultipartUpload']);

/** Notification actions that delete an object. */
export const deleteActions: ReadonlySet<string> = new Set(['DeleteObject', 'LifecycleDeletion']);

/** The R2 event notification message body, as documented. */
export type R2Notification = Readonly<{
  account?: string;
  action: string;
  bucket: string;
  object: Readonly<{ key: string; size?: number; eTag?: string }>;
  eventTime?: string;
}>;

/** What KV holds for a created key. */
export type CreatedRecord = Readonly<{ eTag: string; eventTime: string }>;

/** KV keys are at most 512 bytes; longer object keys are recorded by their SHA-256. */
const kvKeyLimitBytes = 480;

/**
 * Whether a key fits the dependency layout.
 *
 * @param key - The object key.
 * @returns True for `blobs/sha256/<64 lowercase hex>`.
 */
export const isDependencyKey = (key: string): boolean => dependencyKeyPattern.test(key);

const hex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

/**
 * The KV key that records an object key's first create.
 *
 * @param key - The object key.
 * @returns `object:<key>`, or `object-sha256:<hex>` for a key too long for KV.
 */
export const createdRecordKey = async (key: string): Promise<string> => {
  const encoded = new TextEncoder().encode(key);
  if (encoded.byteLength <= kvKeyLimitBytes) {
    return `object:${key}`;
  }
  return `object-sha256:${hex(await crypto.subtle.digest('SHA-256', encoded))}`;
};

/**
 * Read a notification body.
 *
 * @param body - The queue message body.
 * @returns The notification, or `undefined` when it lacks the action, bucket or key.
 */
export const parseNotification = (body: unknown): R2Notification | undefined => {
  const value = typeof body === 'string' ? safeJson(body) : body;
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const { object } = record;
  if (
    typeof record['action'] !== 'string' ||
    typeof record['bucket'] !== 'string' ||
    typeof object !== 'object' ||
    object === null ||
    typeof (object as Record<string, unknown>)['key'] !== 'string'
  ) {
    return undefined;
  }
  return value as R2Notification;
};

const safeJson = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
};

const parseRecord = (text: string): CreatedRecord | undefined => {
  const value = safeJson(text);
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  return typeof record['eTag'] === 'string' && typeof record['eventTime'] === 'string'
    ? { eTag: record['eTag'], eventTime: record['eventTime'] }
    : undefined;
};

/**
 * Check one notification and record a create.
 *
 * @param notification - The notification.
 * @param kv - The `AUDIT_KV` namespace.
 * @param environment - The environment label stamped on each line.
 * @returns The lines to write: a create record, or one or more alarms; none for a redelivery.
 */
export const checkNotification = async (
  notification: R2Notification,
  kv: AuditKv,
  environment: string,
): Promise<AuditRecordLine[]> => {
  const { action, bucket, object, eventTime } = notification;
  const base: Omit<AuditRecordLine, 'event'> = {
    environment,
    source: 'notification',
    bucket,
    action,
    key: object.key,
    ...(object.eTag === undefined ? {} : { eTag: object.eTag }),
    ...(eventTime === undefined ? {} : { eventTime }),
  };
  if (deleteActions.has(action)) {
    return [{ ...base, event: auditEvents.dependencyDeleted }];
  }
  // The tau-cloud rule asks only for creates and deletes, so any other action is checked as a create.
  const lines: AuditRecordLine[] = isDependencyKey(object.key)
    ? []
    : [{ ...base, event: auditEvents.dependencyLayoutBreach }];
  const recordKey = await createdRecordKey(object.key);
  const stored = await kv.get(recordKey);
  const current: CreatedRecord = {
    eTag: object.eTag ?? '',
    eventTime: eventTime ?? '',
  };
  if (stored === null) {
    await kv.put(recordKey, JSON.stringify(current));
    return [...lines, { ...base, event: auditEvents.dependencyCreated }];
  }
  const previous = parseRecord(stored);
  if (previous !== undefined && previous.eTag === current.eTag && previous.eventTime === current.eventTime) {
    return [];
  }
  return [
    ...lines,
    {
      ...base,
      event: auditEvents.dependencyOverwritten,
      ...(previous === undefined ? {} : { previousEtag: previous.eTag }),
    },
  ];
};
