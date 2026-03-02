export const chatMode = {
  agent: 'agent',
  plan: 'plan',
} as const;

export type ChatMode = (typeof chatMode)[keyof typeof chatMode];

export const chatModes = Object.values(chatMode);
