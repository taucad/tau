/**
 * The `tau-r2-audit-<env>` handlers: the queue consumer, the 5-minute poll and the heartbeat each
 * pass writes (R2 storage blast-radius blueprint, phase 9 "Write alarms").
 *
 * Both handlers only log. Every line leaves through the Worker's OTLP logs export to Grafana Cloud,
 * where `infra/grafana/alerts/tau-storage-integrity.json` turns alarms into pages and a missing
 * scheduled heartbeat into `storage-audit-silent`.
 */

import { dependencyBucket, parseExpectedWriters, parseForeignBuckets } from '#environment.js';
import type { AuditEnvironment } from '#environment.js';
import { auditEvents, consoleLogger, isAlarm } from '#log.js';
import type { AuditLogger, AuditRecordLine, HeartbeatLine } from '#log.js';
import { checkNotification, parseNotification } from '#notifications.js';
import { pollDataAccessLogs } from '#poll.js';

/** The face of a queue message the consumer uses. */
export type AuditQueueMessage = Readonly<{
  id: string;
  body: unknown;
  ack: () => void;
  retry: () => void;
}>;

/** The face of a message batch the consumer uses. */
export type AuditMessageBatch = Readonly<{
  queue: string;
  messages: readonly AuditQueueMessage[];
}>;

/** The face of a cron trigger's controller the poll uses. */
export type AuditScheduledController = Readonly<{
  scheduledTime: number;
  cron?: string;
}>;

/** Test seams: the clock, the log sink and fetch. */
export type AuditWorkerOptions = Readonly<{
  now?: () => number;
  log?: AuditLogger;
  fetch?: typeof fetch;
}>;

/** The two handlers. */
export type AuditWorkerHandlers = Readonly<{
  queue: (batch: AuditMessageBatch, environment: AuditEnvironment) => Promise<void>;
  scheduled: (controller: AuditScheduledController, environment: AuditEnvironment) => Promise<void>;
}>;

type PollSummary = Pick<
  HeartbeatLine,
  'poll' | 'pollDetail' | 'eventsSeen' | 'eventsNew' | 'eventsForeign' | 'truncated'
>;

/**
 * Build the Worker's handlers.
 *
 * @param options - The clock, the log sink and fetch; each defaults to the runtime's.
 * @returns The `queue` and `scheduled` handlers.
 */
export const createAuditWorker = (options: AuditWorkerOptions = {}): AuditWorkerHandlers => {
  const now = options.now ?? ((): number => Date.now());
  const log = options.log ?? consoleLogger;
  const fetcher = options.fetch ?? (async (input, init) => fetch(input, init));

  const queue = async (batch: AuditMessageBatch, environment: AuditEnvironment): Promise<void> => {
    const startedAt = now();
    let alarms = 0;
    let retried = 0;
    /* oxlint-disable no-await-in-loop -- In delivery order: a create must be recorded before the next message for its key is checked. */
    for (const message of batch.messages) {
      const notification = parseNotification(message.body);
      if (notification === undefined) {
        // Unreadable: retry until the dead-letter queue keeps it on record.
        message.retry();
        retried += 1;
        continue;
      }
      let lines: AuditRecordLine[];
      try {
        lines = await checkNotification(notification, environment.AUDIT_KV, environment.AUDIT_ENVIRONMENT);
      } catch {
        // KV failed (a delete never reads KV, so it is never lost here): retry, then the dead-letter queue.
        message.retry();
        retried += 1;
        continue;
      }
      for (const line of lines) {
        log(line);
        alarms += isAlarm(line) ? 1 : 0;
      }
      message.ack();
    }
    /* oxlint-enable no-await-in-loop -- end of the ordered batch */
    log({
      event: auditEvents.heartbeat,
      environment: environment.AUDIT_ENVIRONMENT,
      pass: 'queue',
      expectedWritersValid: parseExpectedWriters(environment.AUDIT_EXPECTED_WRITERS).valid,
      messages: batch.messages.length,
      retried,
      alarms,
      durationMilliseconds: Math.max(0, now() - startedAt),
    });
  };

  const scheduled = async (controller: AuditScheduledController, environment: AuditEnvironment): Promise<void> => {
    const startedAt = now();
    const expected = parseExpectedWriters(environment.AUDIT_EXPECTED_WRITERS);
    const foreign = parseForeignBuckets(environment.AUDIT_FOREIGN_BUCKETS);
    const foreignSet = (environment.AUDIT_FOREIGN_BUCKETS?.trim() ?? '') !== '';
    const token = environment.AUDIT_QUERY_TOKEN?.trim();
    let alarms = 0;
    let summary: PollSummary;
    if (token === undefined || token === '') {
      summary = { poll: 'skipped', pollDetail: 'no-query-token' };
    } else {
      const result = await pollDataAccessLogs({
        accountId: environment.AUDIT_ACCOUNT_ID,
        token,
        to: controller.scheduledTime,
        kv: environment.AUDIT_KV,
        expected,
        dependencyBucket: dependencyBucket(environment),
        foreignBuckets: foreign.buckets,
        environment: environment.AUDIT_ENVIRONMENT,
        fetch: fetcher,
      });
      if (result.ok) {
        for (const line of result.lines) {
          log(line);
          alarms += 1;
        }
        summary = {
          poll: 'ok',
          eventsSeen: result.eventsSeen,
          eventsNew: result.eventsNew,
          ...(foreignSet ? { eventsForeign: result.eventsForeign } : {}),
          truncated: result.truncated,
        };
      } else {
        summary = { poll: 'failed', pollDetail: result.detail };
      }
    }
    log({
      event: auditEvents.heartbeat,
      environment: environment.AUDIT_ENVIRONMENT,
      pass: 'scheduled',
      expectedWritersValid: expected.valid,
      ...(foreignSet ? { foreignBucketsValid: foreign.valid } : {}),
      ...summary,
      alarms,
      durationMilliseconds: Math.max(0, now() - startedAt),
    });
  };

  return { queue, scheduled };
};
