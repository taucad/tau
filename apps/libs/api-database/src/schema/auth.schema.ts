import { boolean, index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/* oxlint-disable @typescript-eslint/no-unsafe-return -- Drizzle `references(() => …)` FK factories defer table symbols */

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  /** Whether the user allows their AI prompts and designs to be used for AI service improvement */
  allowsAiTraining: boolean('allows_ai_training').default(true).notNull(),
  /**
   * When the user last chose `allowsAiTraining` themselves. Paid plans count only a decided `true` as consent, so the
   * column default never opts a paying user in.
   */
  aiTrainingDecidedAt: timestamp('ai_training_decided_at'),
  /** Whether the user allows anonymous, content-free usage metrics about agent turns to be reported for product improvement */
  allowsUsageMetrics: boolean('allows_usage_metrics').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

/** Short-lived browser-approved CLI sign-in requests, owned by Better Auth. */
export const deviceCode = pgTable(
  'device_code',
  {
    id: text('id').primaryKey(),
    deviceCode: text('device_code').notNull().unique(),
    userCode: text('user_code').notNull().unique(),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at').notNull(),
    status: text('status').notNull(),
    lastPolledAt: timestamp('last_polled_at'),
    pollingInterval: integer('polling_interval'),
    clientId: text('client_id'),
    scope: text('scope'),
  },
  (table) => [index('device_code_expires_at_idx').on(table.expiresAt)],
);

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const apikey = pgTable(
  'apikey',
  {
    id: text('id').primaryKey(),
    configId: text('config_id').notNull().default('default'),
    name: text('name'),
    start: text('start'),
    referenceId: text('reference_id').notNull(),
    prefix: text('prefix'),
    key: text('key').notNull(),
    refillInterval: integer('refill_interval'),
    refillAmount: integer('refill_amount'),
    lastRefillAt: timestamp('last_refill_at'),
    enabled: boolean('enabled').default(true),
    rateLimitEnabled: boolean('rate_limit_enabled').default(true),
    rateLimitTimeWindow: integer('rate_limit_time_window').default(86_400_000),
    rateLimitMax: integer('rate_limit_max').default(10),
    requestCount: integer('request_count').default(0),
    remaining: integer('remaining'),
    lastRequest: timestamp('last_request'),
    expiresAt: timestamp('expires_at'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
    permissions: text('permissions'),
    metadata: text('metadata'),
  },
  (table) => [
    index('apikey_configId_idx').on(table.configId),
    index('apikey_referenceId_idx').on(table.referenceId),
    index('apikey_key_idx').on(table.key),
  ],
);

/*
 * `@better-auth/oauth-provider` (desktop sign-in, execution plan DSI-1). Better Auth owns these rows; the
 * columns follow the plugin's schema. Every user reference cascades so deleting an account is never blocked,
 * and token rows keep a browser session reference only as `set null`: a desktop grant outlives the browser
 * session that approved it. Token columns hold hashes, never the token.
 */

/** Registered OAuth clients. The public `tau-desktop` client is seeded by migration, one row per environment. */
export const oauthClient = pgTable(
  'oauth_client',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id').notNull().unique(),
    clientSecret: text('client_secret'),
    clientDiscoveryId: text('client_discovery_id'),
    disabled: boolean('disabled').default(false),
    skipConsent: boolean('skip_consent'),
    enableEndSession: boolean('enable_end_session'),
    subjectType: text('subject_type'),
    scopes: text('scopes').array(),
    clientCredentialsScopes: text('client_credentials_scopes').array(),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
    name: text('name'),
    uri: text('uri'),
    icon: text('icon'),
    contacts: text('contacts').array(),
    tos: text('tos'),
    policy: text('policy'),
    softwareId: text('software_id'),
    softwareVersion: text('software_version'),
    softwareStatement: text('software_statement'),
    redirectUris: text('redirect_uris').array().notNull(),
    postLogoutRedirectUris: text('post_logout_redirect_uris').array(),
    backchannelLogoutUri: text('backchannel_logout_uri'),
    backchannelLogoutSessionRequired: boolean('backchannel_logout_session_required'),
    tokenEndpointAuthMethod: text('token_endpoint_auth_method'),
    applicationType: text('application_type'),
    jwks: text('jwks'),
    jwksUri: text('jwks_uri'),
    grantTypes: text('grant_types').array(),
    responseTypes: text('response_types').array(),
    // eslint-disable-next-line @typescript-eslint/naming-convention -- the provider's field name, which the Drizzle adapter maps by key
    requirePKCE: boolean('require_pkce'),
    dpopBoundAccessTokens: boolean('dpop_bound_access_tokens').default(false),
    referenceId: text('reference_id'),
    metadata: jsonb('metadata'),
  },
  (table) => [index('oauth_client_user_id_idx').on(table.userId)],
);

/** Protected resources (RFC 8707). Tau names none; the table exists because the plugin declares it. */
export const oauthResource = pgTable('oauth_resource', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull().unique(),
  name: text('name').notNull(),
  accessTokenTtl: integer('access_token_ttl'),
  refreshTokenTtl: integer('refresh_token_ttl'),
  signingAlgorithm: text('signing_algorithm'),
  signingKeyId: text('signing_key_id'),
  allowedScopes: text('allowed_scopes').array(),
  customClaims: jsonb('custom_claims'),
  dpopBoundAccessTokensRequired: boolean('dpop_bound_access_tokens_required').default(false),
  disabled: boolean('disabled').default(false),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
  policyVersion: integer('policy_version').default(1),
  metadata: jsonb('metadata'),
});

/** Which client may request which resource. Unused by Tau; declared by the plugin. */
export const oauthClientResource = pgTable(
  'oauth_client_resource',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    resourceId: text('resource_id')
      .notNull()
      .references(() => oauthResource.identifier, { onDelete: 'cascade' }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at'),
  },
  (table) => [
    index('oauth_client_resource_client_id_idx').on(table.clientId),
    index('oauth_client_resource_resource_id_idx').on(table.resourceId),
  ],
);

/** Rotating refresh tokens. One family per desktop sign-in shares `authorization_code_id`. */
export const oauthRefreshToken = pgTable(
  'oauth_refresh_token',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    sessionId: text('session_id').references(() => session.id, { onDelete: 'set null' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    referenceId: text('reference_id'),
    authorizationCodeId: text('authorization_code_id'),
    resources: text('resources').array(),
    requestedUserInfoClaims: text('requested_user_info_claims').array(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull(),
    revoked: timestamp('revoked'),
    rotatedAt: timestamp('rotated_at'),
    rotationReplayResponse: text('rotation_replay_response'),
    rotationReplayExpiresAt: timestamp('rotation_replay_expires_at'),
    authTime: timestamp('auth_time'),
    confirmation: jsonb('confirmation'),
    scopes: text('scopes').array().notNull(),
  },
  (table) => [
    index('oauth_refresh_token_client_id_idx').on(table.clientId),
    index('oauth_refresh_token_session_id_idx').on(table.sessionId),
    index('oauth_refresh_token_user_id_idx').on(table.userId),
    index('oauth_refresh_token_authorization_code_id_idx').on(table.authorizationCodeId),
  ],
);

/** Opaque access tokens (one hour). Read by `SessionResolver`'s desktop branch. */
export const oauthAccessToken = pgTable(
  'oauth_access_token',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    sessionId: text('session_id').references(() => session.id, { onDelete: 'set null' }),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    referenceId: text('reference_id'),
    authorizationCodeId: text('authorization_code_id'),
    resources: text('resources').array(),
    requestedUserInfoClaims: text('requested_user_info_claims').array(),
    refreshId: text('refresh_id').references(() => oauthRefreshToken.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull(),
    revoked: timestamp('revoked'),
    confirmation: jsonb('confirmation'),
    scopes: text('scopes').array().notNull(),
  },
  (table) => [
    index('oauth_access_token_client_id_idx').on(table.clientId),
    index('oauth_access_token_session_id_idx').on(table.sessionId),
    index('oauth_access_token_user_id_idx').on(table.userId),
    index('oauth_access_token_authorization_code_id_idx').on(table.authorizationCodeId),
    index('oauth_access_token_refresh_id_idx').on(table.refreshId),
  ],
);

/** A user's consent to a client; one row per account and client, not per device. */
export const oauthConsent = pgTable(
  'oauth_consent',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    referenceId: text('reference_id'),
    resources: text('resources').array(),
    requestedUserInfoClaims: text('requested_user_info_claims').array(),
    scopes: text('scopes').array().notNull(),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    index('oauth_consent_client_id_idx').on(table.clientId),
    index('oauth_consent_user_id_idx').on(table.userId),
  ],
);

/** Replay tombstones for `private_key_jwt` assertions. Unused by the public desktop client; declared by the plugin. */
export const oauthClientAssertion = pgTable('oauth_client_assertion', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
});

/* oxlint-enable @typescript-eslint/no-unsafe-return -- see file-leading disable */
