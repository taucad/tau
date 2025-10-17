/**
 * A prefix for an ID.
 *
 * Prefixes are used to quickly identify the type of ID.
 *
 * They are ideally 3 characters long, but can be longer or shorter when needed to:
 * - Preserve acronyms
 * - Distinguish between similar IDs
 */
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
   * A build ID.
   */
  build: 'bld',
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
   * A request ID.
   */
  request: 'req',
  /**
   * An account ID.
   */
  account: 'acct',
  /**
   * An organization ID.
   */
  organization: 'org',
  /**
   * A user ID.
   */
  user: 'user',
  /**
   * A session ID.
   */
  session: 'sess',
  /**
   * A verification ID.
   */
  verification: 'ver',
  /**
   * A rate limit ID.
   */
  rateLimit: 'rl',
  /**
   * A member ID.
   */
  member: 'mem',
  /**
   * An organization invitation ID.
   */
  invitation: 'invt',
  /**
   * A two factor ID.
   */
  twoFactor: 'totp',
  /**
   * A JWKS ID.
   */
  jwks: 'jwks',
  /**
   * A passkey ID.
   */
  passkey: 'pk',
  /**
   * A secret key ID (for API keys).
   */
  secretKey: 'sk',
  /**
   * A public key ID (for API keys).
   */
  publicKey: 'pk',
} as const satisfies Record<string, string>;
