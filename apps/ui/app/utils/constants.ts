export const PREFIX_TYPES = {
  BUILD: 'bld',
  MESSAGE: 'msg',
  CHAT: 'cht',
} as const;

export type PrefixType = (typeof PREFIX_TYPES)[keyof typeof PREFIX_TYPES];

// RxDB Collection Names
export const COLLECTIONS = {
  MESSAGES: 'messages',
  BUILDS: 'builds',
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];
