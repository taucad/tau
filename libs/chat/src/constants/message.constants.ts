export const messageRole = {
  user: 'user',
  assistant: 'assistant',
  system: 'system',
} as const;

export const messageRoles = Object.values(messageRole);

export const messageStatus = {
  pending: 'pending',
  success: 'success',
  error: 'error',
  cancelled: 'cancelled',
} as const;

export const messageStatuses = Object.values(messageStatus);
