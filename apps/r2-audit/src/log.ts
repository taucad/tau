/**
 * The Worker's structured log lines: its only output.
 *
 * Each line is one JSON object written with `console.log`. Workers Observability exports it over OTLP
 * to Grafana Cloud Loki, where the stream carries `service_name="tau-r2-audit-<env>"` and the alert rules
 * in `infra/grafana/alerts/tau-storage-integrity.json` read it with `| json | event="…"`. The field
 * names are that contract: change one only together with those rules.
 *
 * No line carries a secret: never the query token, never the expected-writer list, never an actor's
 * e-mail address. Token ids (`accessKeyId`) and script names are identifiers, not credentials.
 */

/** Every `event` value. Alarms are every value except the heartbeat and `dependency_created`. */
export const auditEvents = {
  heartbeat: 'r2_audit.heartbeat',
  dependencyCreated: 'r2_audit.dependency_created',
  dependencyOverwritten: 'r2_audit.dependency_overwritten',
  dependencyLayoutBreach: 'r2_audit.dependency_layout_breach',
  dependencyDeleted: 'r2_audit.dependency_deleted',
  dependencyDeleteAttempt: 'r2_audit.dependency_delete_attempt',
  unexpectedWriter: 'r2_audit.unexpected_writer',
} as const;

/** An `event` value. */
export type AuditEvent = (typeof auditEvents)[keyof typeof auditEvents];

/** Where a record came from: the queue's event notification, or a polled Data Access Log event. */
export type AuditSource = 'notification' | 'data-access-log';

/** One object record: a created key, or an alarm about a key or a writer. */
export type AuditRecordLine = Readonly<{
  event: Exclude<AuditEvent, typeof auditEvents.heartbeat>;
  environment: string;
  source: AuditSource;
  bucket: string;
  /** The R2 action, e.g. `PutObject`, `DeleteObjects`. */
  action: string;
  /** The object key; absent for a bulk delete. */
  key?: string;
  eTag?: string;
  /** The eTag KV recorded at the key's first create (overwrite only). */
  previousEtag?: string;
  /** When the notification or the log event says the operation happened, ISO 8601. */
  eventTime?: string;
  /** Data Access Logs' `actor.accessKeyId`: a Cloudflare token id. */
  accessKeyId?: string;
  /** Data Access Logs' `interface`: `S3`, `API`, `Workers` or `Public`. */
  interface?: string;
  /** Data Access Logs' `scriptName`, for Workers binding writes. */
  scriptName?: string;
  /** Why a writer is unexpected. */
  reason?: UnexpectedWriterReason;
}>;

/** Why a polled write is unexpected. */
export type UnexpectedWriterReason = 'api-interface' | 'unknown-bucket' | 'unknown-actor';

/** How the Data Access Log poll ended. */
export type PollOutcome = 'ok' | 'skipped' | 'failed';

/** One pass's summary. */
export type HeartbeatLine = Readonly<{
  event: typeof auditEvents.heartbeat;
  environment: string;
  /** `scheduled` is the 5-minute cron (the silent alarm reads only these); `queue` is one notification batch. */
  pass: 'scheduled' | 'queue';
  /** Whether `AUDIT_EXPECTED_WRITERS` parsed. */
  expectedWritersValid: boolean;
  /** Notifications in the batch (queue passes). */
  messages?: number;
  /** Notifications that failed and were left for retry (queue passes). */
  retried?: number;
  poll?: PollOutcome;
  /** Why the poll was skipped or failed: `no-query-token`, `http-<status>`, `api-error`, `network`, `kv`. */
  pollDetail?: string;
  /** Polled write and delete events in the window, before de-duplication. */
  eventsSeen?: number;
  /** Polled events not seen by an earlier pass. */
  eventsNew?: number;
  /** True when the window returned the query limit, so some events may be missed. */
  truncated?: boolean;
  /** Alarm lines written in this pass. */
  alarms: number;
  durationMilliseconds: number;
}>;

/** Any line. */
export type AuditLogLine = AuditRecordLine | HeartbeatLine;

/** Where lines go; Workers Observability reads `console.log`. */
export type AuditLogger = (line: AuditLogLine) => void;

/**
 * The default sink: one JSON line on `console.log`.
 *
 * @param line - The line.
 */
export const consoleLogger: AuditLogger = (line) => {
  console.log(JSON.stringify(line));
};

/**
 * Whether a line is an alarm.
 *
 * @param line - The line.
 * @returns True for every record except `dependency_created`.
 */
export const isAlarm = (line: AuditLogLine): boolean =>
  line.event !== auditEvents.heartbeat && line.event !== auditEvents.dependencyCreated;
