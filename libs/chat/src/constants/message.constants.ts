/** @public */
export const messageRole = {
  user: 'user',
  assistant: 'assistant',
  system: 'system',
} as const;

/** @public */
export const messageRoles = Object.values(messageRole);

/** @public */
export const messageStatus = {
  pending: 'pending',
  success: 'success',
  error: 'error',
  cancelled: 'cancelled',
} as const;

/** @public */
export const messageStatuses = Object.values(messageStatus);

/** The one reason the snapshot gives for a kernel it does not offer: never the account's plan (blueprint D4). @public */
export const snapshotKernelUnavailableReason = 'not available here';
