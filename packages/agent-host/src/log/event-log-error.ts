/** Stable failure codes emitted by the event-log core. @public */
export type EventLogErrorCode =
  | 'EVENT_INVALID'
  | 'LINE_INVALID'
  | 'EVENT_OUT_OF_ORDER'
  | 'EVENT_MUTATED'
  | 'HISTORY_INVALID'
  | 'LOG_CLOSED'
  | 'LOG_POISONED'
  | 'STORAGE_NOT_WRITABLE'
  | 'STORAGE_SHORT_READ'
  | 'STORAGE_SHORT_WRITE'
  | 'WRITER_LOCKED';

/** Error thrown when an event log violates its durable replay contract. @public */
export class EventLogError extends Error {
  public readonly code: EventLogErrorCode;

  public constructor(code: EventLogErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'EventLogError';
    this.code = code;
  }
}
