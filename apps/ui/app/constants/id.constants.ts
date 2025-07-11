export const idPrefix = {
  /**
   * An LLM chat message ID.
   */
  message: 'msg',
  /**
   * An LLM chat ID.
   */
  chat: 'chat',
  /**
   * An LLM chat tool call ID.
   */
  toolCall: 'tool',
  /**
   * An LLM chat source ID.
   */
  source: 'src',
  /**
   * An LLM chat run ID.
   */
  run: 'run',
  /**
   * A log ID.
   */
  log: 'log',
  /**
   * A build ID.
   */
  build: 'bld',
} as const satisfies Record<string, string>;

export type IdPrefix = (typeof idPrefix)[keyof typeof idPrefix];
