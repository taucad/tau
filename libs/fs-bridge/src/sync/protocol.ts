/**
 * Int32 indices shared by every bounded synchronous request slot.
 *
 * @public
 */
export const syncSlotIndex = { state: 0, requestId: 1, errorCode: 2, payloadLength: 3 } as const;

/** Number of Int32 values required by one synchronous request slot. @public */
export const syncSlotInt32Length = 4;

/** Shared request-slot lifecycle states. @public */
export const syncSlotState = { idle: 0, pending: 1, ready: 2, claimed: 3 } as const;

/** Stable transport-level error codes. @public */
export const syncChannelError = {
  ok: 0,
  notFound: 1,
  isDirectory: 2,
  tooLarge: 3,
  ioError: 4,
  aborted: 5,
  invalidRequest: 6,
  absent: 7,
  busy: 8,
  timedOut: 9,
} as const;

/** Default synchronous response arena size in bytes. @public */
export const defaultSyncArenaBytes = 4 * 1024 * 1024;
