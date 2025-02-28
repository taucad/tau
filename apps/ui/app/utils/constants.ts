export const PREFIX_TYPES = {
  BUILD: 'bld',
  MESSAGE: 'msg',
  CHAT: 'cht',
  LOG: 'log',
} as const;

export type PrefixType = (typeof PREFIX_TYPES)[keyof typeof PREFIX_TYPES];
