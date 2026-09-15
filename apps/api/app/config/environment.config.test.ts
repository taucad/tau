import { describe, it, expect } from 'vitest';
import { environmentSchema } from '#config/environment.config.js';

/* eslint-disable @typescript-eslint/naming-convention -- fixtures mirror process.env UPPER_SNAKE keys */

const validViewCookieSecret = 'test-view-cookie-secret-min-32-chars';

/** Ensures required `TAU_VIEW_COOKIE_SECRET` when tests run without apps/api/.env (CI agents, sandboxes). */
const withRequiredCookieSecret = (env: NodeJS.ProcessEnv): Record<string, unknown> => {
  const existing = env.TAU_VIEW_COOKIE_SECRET;
  return {
    ...env,
    TAU_VIEW_COOKIE_SECRET: existing.length > 0 ? existing : validViewCookieSecret,
  };
};

describe('environmentSchema', () => {
  it.each([
    [undefined, false],
    ['false', false],
    ['true', true],
  ])('parses TAU_CLOUD_ENABLED=%s strictly', (value, expected) => {
    const environment = Object.fromEntries(
      Object.entries(withRequiredCookieSecret(process.env)).filter(([key]) => key !== 'TAU_CLOUD_ENABLED'),
    );
    const result = environmentSchema.safeParse({
      ...environment,
      TAU_CLOUD_ENABLED: value,
      BILLING_ENVIRONMENT: 'development',
      BILLING_USAGE_CURSOR_SECRET: 'test-usage-cursor-secret-min-32-chars',
      BILLING_REQUEST_DIGEST_SECRET: 'test-request-digest-secret-min-32-chars',
      STRIPE_SECRET_KEY: 'rk_test_cloud_flag_create',
      STRIPE_READ_SECRET_KEY: 'rk_test_cloud_flag',
      STRIPE_ACCOUNT_ID: 'acct_cloud_flag',
      STRIPE_LIVEMODE: 'false',
      STRIPE_WEBHOOK_SECRET: 'whsec_cloud_flag',
      STRIPE_PRICE_ID_PRO_MONTHLY: 'price_cloud_flag',
      STRIPE_PRODUCT_ID_CREDIT_PACK: 'prod_cloud_flag',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.TAU_CLOUD_ENABLED).toBe(expected);
    }
  });

  it('rejects non-canonical TAU_CLOUD_ENABLED values', () => {
    const result = environmentSchema.safeParse({
      ...withRequiredCookieSecret(process.env),
      TAU_CLOUD_ENABLED: '1',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'TAU_CLOUD_ENABLED')).toBe(true);
    }
  });

  it('requires the complete financial configuration whenever Tau Cloud is enabled', () => {
    const result = environmentSchema.safeParse({
      ...withRequiredCookieSecret(process.env),
      NODE_ENV: 'development',
      TAU_CLOUD_ENABLED: 'true',
      BILLING_ENVIRONMENT: undefined,
      STRIPE_SECRET_KEY: '',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toEqual(
        expect.arrayContaining(['BILLING_ENVIRONMENT', 'STRIPE_SECRET_KEY']),
      );
    }
  });

  it('rejects Stripe credentials whose prefixes contradict the declared mode', () => {
    const result = environmentSchema.safeParse({
      ...withRequiredCookieSecret(process.env),
      TAU_CLOUD_ENABLED: 'true',
      BILLING_ENVIRONMENT: 'staging',
      BILLING_USAGE_CURSOR_SECRET: 'test-usage-cursor-secret-min-32-chars',
      BILLING_REQUEST_DIGEST_SECRET: 'test-request-digest-secret-min-32-chars',
      STRIPE_SECRET_KEY: 'sk_live_wrong_mode',
      STRIPE_READ_SECRET_KEY: 'rk_test_read',
      STRIPE_ACCOUNT_ID: 'acct_test',
      STRIPE_LIVEMODE: 'false',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
      STRIPE_PRICE_ID_PRO_MONTHLY: 'price_test',
      STRIPE_PRODUCT_ID_CREDIT_PACK: 'prod_test',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === 'STRIPE_SECRET_KEY')).toBe(true);
    }
  });

  it('accepts a test-mode restricted create key while retaining a separate restricted read key', () => {
    const result = environmentSchema.safeParse({
      ...withRequiredCookieSecret(process.env),
      TAU_CLOUD_ENABLED: 'true',
      BILLING_ENVIRONMENT: 'staging',
      BILLING_USAGE_CURSOR_SECRET: 'test-usage-cursor-secret-min-32-chars',
      BILLING_REQUEST_DIGEST_SECRET: 'test-request-digest-secret-min-32-chars',
      STRIPE_SECRET_KEY: 'rk_test_create_scope',
      STRIPE_READ_SECRET_KEY: 'rk_test_read_scope',
      STRIPE_ACCOUNT_ID: 'acct_test',
      STRIPE_LIVEMODE: 'false',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
      STRIPE_PRICE_ID_PRO_MONTHLY: 'price_test',
      STRIPE_PRODUCT_ID_CREDIT_PACK: 'prod_test',
    });

    expect(result.success).toBe(true);
  });

  it('rejects a full test-mode key when Tau Cloud is enabled', () => {
    const result = environmentSchema.safeParse({
      ...withRequiredCookieSecret(process.env),
      TAU_CLOUD_ENABLED: 'true',
      BILLING_ENVIRONMENT: 'staging',
      BILLING_USAGE_CURSOR_SECRET: 'test-usage-cursor-secret-min-32-chars',
      BILLING_REQUEST_DIGEST_SECRET: 'test-request-digest-secret-min-32-chars',
      STRIPE_SECRET_KEY: 'sk_test_full_account_scope',
      STRIPE_READ_SECRET_KEY: 'rk_test_read_scope',
      STRIPE_ACCOUNT_ID: 'acct_test',
      STRIPE_LIVEMODE: 'false',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
      STRIPE_PRICE_ID_PRO_MONTHLY: 'price_test',
      STRIPE_PRODUCT_ID_CREDIT_PACK: 'prod_test',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === 'STRIPE_SECRET_KEY')).toBe(true);
    }
  });

  it('should parse merged process env including TAU_S3_* defaults in development', () => {
    const merged = environmentSchema.safeParse(withRequiredCookieSecret(process.env));
    expect(merged.success).toBe(true);
  });

  it('should accept Moonshot credentials while keeping them optional', () => {
    const withoutMoonshot = Object.fromEntries(
      Object.entries(withRequiredCookieSecret(process.env)).filter(([key]) => key !== 'MOONSHOT_API_KEY'),
    );
    const optionalResult = environmentSchema.safeParse(withoutMoonshot);
    const configuredResult = environmentSchema.safeParse({
      ...withoutMoonshot,
      MOONSHOT_API_KEY: 'sk-test-moonshot',
    });

    expect(optionalResult.success).toBe(true);
    expect(configuredResult.success).toBe(true);
    if (configuredResult.success) {
      expect(configuredResult.data.MOONSHOT_API_KEY).toBe('sk-test-moonshot');
    }
  });

  it('should accept an optional GitHub API token', () => {
    const environment = withRequiredCookieSecret(process.env);
    const absent = environmentSchema.safeParse(
      Object.fromEntries(Object.entries(environment).filter(([key]) => key !== 'GITHUB_API_TOKEN')),
    );
    const configured = environmentSchema.safeParse({
      ...environment,
      GITHUB_API_TOKEN: 'github-token',
    });

    expect(absent.success).toBe(true);
    expect(configured.success).toBe(true);
    if (configured.success) {
      expect(configured.data.GITHUB_API_TOKEN).toBe('github-token');
    }
  });

  it('should default the database pool budget and per-connection deadlines', () => {
    const result = environmentSchema.safeParse(
      Object.fromEntries(
        Object.entries(withRequiredCookieSecret(process.env)).filter(
          ([key]) => key === 'DATABASE_URL' || !key.startsWith('DATABASE_'),
        ),
      ),
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.DATABASE_POOL_MAX).toBe(10);
      expect(result.data.DATABASE_CONNECT_TIMEOUT_SECONDS).toBe(10);
      expect(result.data.DATABASE_IDLE_TIMEOUT_SECONDS).toBe(60);
      expect(result.data.DATABASE_STATEMENT_TIMEOUT_MS).toBe(15_000);
      expect(result.data.DATABASE_LOCK_TIMEOUT_MS).toBe(5000);
      expect(result.data.DATABASE_IDLE_IN_TRANSACTION_TIMEOUT_MS).toBe(15_000);
      expect(result.data.DATABASE_RUNTIME_ROLE).toBe('');
    }
  });

  it.each([
    ['DATABASE_POOL_MAX', '0'],
    ['DATABASE_POOL_MAX', 'unbounded'],
    ['DATABASE_POOL_MAX', '101'],
    ['DATABASE_CONNECT_TIMEOUT_SECONDS', '0'],
    ['DATABASE_IDLE_TIMEOUT_SECONDS', '0'],
    ['DATABASE_STATEMENT_TIMEOUT_MS', '99'],
    ['DATABASE_STATEMENT_TIMEOUT_MS', '300001'],
    ['DATABASE_LOCK_TIMEOUT_MS', '0'],
    ['DATABASE_IDLE_IN_TRANSACTION_TIMEOUT_MS', '-1'],
    ['DATABASE_RUNTIME_ROLE', 'tau api runtime'],
  ])('should fail closed on an invalid %s value of %s', (key, value) => {
    const result = environmentSchema.safeParse({ ...withRequiredCookieSecret(process.env), [key]: value });

    expect(result.success).toBe(false);
  });

  it('should require a de-privileged runtime role in production', () => {
    const base = {
      ...withRequiredCookieSecret(process.env),
      NODE_ENV: 'production',
      DATABASE_RUNTIME_ROLE: '',
    };

    const absent = environmentSchema.safeParse(base);
    const configured = environmentSchema.safeParse({ ...base, DATABASE_RUNTIME_ROLE: 'tau_api_runtime' });

    expect(absent.success).toBe(false);
    if (!absent.success) {
      expect(absent.error.issues.some((issue) => issue.path[0] === 'DATABASE_RUNTIME_ROLE')).toBe(true);
    }
    expect(
      configured.success || !configured.error.issues.some((issue) => issue.path[0] === 'DATABASE_RUNTIME_ROLE'),
    ).toBe(true);
  });

  it('should reject localhost TAU_S3_ENDPOINT while in production mode', () => {
    const result = environmentSchema.safeParse({
      ...withRequiredCookieSecret(process.env),
      NODE_ENV: 'production',
      TAU_S3_ENDPOINT: 'http://localhost:9000',
      TAU_S3_PUBLIC_BASE_URL: 'https://cdn.example.com',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'TAU_S3_ENDPOINT')).toBe(true);
    }
  });

  it('should reject development default TAU_S3_ENDPOINT when NODE_ENV is production and endpoint is unset', () => {
    const base: Record<string, unknown> = {
      ...withRequiredCookieSecret(process.env),
      NODE_ENV: 'production',
    };
    const envWithoutEndpoint = Object.fromEntries(Object.entries(base).filter(([key]) => key !== 'TAU_S3_ENDPOINT'));
    const result = environmentSchema.safeParse(envWithoutEndpoint);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'TAU_S3_ENDPOINT')).toBe(true);
    }
  });

  it('should default TAU_S3_FORCE_PATH_STYLE=true when omitted', () => {
    const { TAU_S3_FORCE_PATH_STYLE: _omitForcePathStyle, ...envWithoutForcePathStyle } = {
      ...withRequiredCookieSecret(process.env),
    };
    void _omitForcePathStyle;
    const result = environmentSchema.safeParse(envWithoutForcePathStyle);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.TAU_S3_FORCE_PATH_STYLE).toBe(true);
    }
  });

  it('should default local email sender identity to taucad.dev', () => {
    const envWithoutEmailSender = Object.fromEntries(
      Object.entries(withRequiredCookieSecret(process.env)).filter(
        ([key]) => key !== 'TAU_EMAIL_FROM' && key !== 'TAU_EMAIL_REPLY_TO',
      ),
    );
    const result = environmentSchema.safeParse(envWithoutEmailSender);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.TAU_EMAIL_FROM).toBe('Tau <identity@taucad.dev>');
      expect(result.data.TAU_EMAIL_REPLY_TO).toBe('identity@taucad.dev');
    }
  });

  it('should reject TAU_VIEW_COOKIE_SECRET shorter than 32 characters', () => {
    const result = environmentSchema.safeParse({
      ...withRequiredCookieSecret(process.env),
      TAU_VIEW_COOKIE_SECRET: 'short',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'TAU_VIEW_COOKIE_SECRET')).toBe(true);
    }
  });

  it('should reject checked-in dev S3 credentials in production mode', () => {
    const result = environmentSchema.safeParse({
      ...withRequiredCookieSecret(process.env),
      NODE_ENV: 'production',
      TAU_S3_ENDPOINT: 'https://000000000000000000000000.r2.cloudflarestorage.com',
      TAU_S3_PUBLIC_BASE_URL: 'https://cdn.tau.new',
      TAU_S3_ACCESS_KEY_ID: 'tau-api',
      TAU_S3_SECRET_ACCESS_KEY: 'tau-api-dev-secret',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'TAU_S3_ACCESS_KEY_ID')).toBe(true);
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'TAU_S3_SECRET_ACCESS_KEY')).toBe(true);
    }
  });

  it('should parse TAU_S3_* with non-local URLs in production mode', () => {
    const { TAU_S3_FORCE_PATH_STYLE: _omitForcePathStyle, ...envBase } = withRequiredCookieSecret(process.env);
    void _omitForcePathStyle;
    const result = environmentSchema.safeParse({
      ...envBase,
      NODE_ENV: 'production',
      TAU_S3_ENDPOINT: 'https://000000000000000000000000.r2.cloudflarestorage.com',
      TAU_S3_PUBLIC_BASE_URL: 'https://cdn.tau.new',
      TAU_S3_REGION: 'auto',
      TAU_S3_ACCESS_KEY_ID: 'key',
      TAU_S3_SECRET_ACCESS_KEY: 'secret',
      TAU_S3_FORCE_PATH_STYLE: false,
      TAU_API_URL: 'https://api.tau.new',
      DATABASE_RUNTIME_ROLE: 'tau_api_runtime',
      BILLING_ENVIRONMENT: 'prod-us',
      STRIPE_SECRET_KEY: 'rk_live_create_test',
      STRIPE_READ_SECRET_KEY: 'rk_live_read_test',
      STRIPE_ACCOUNT_ID: 'acct_test',
      STRIPE_LIVEMODE: 'true',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
      STRIPE_PRICE_ID_PRO_MONTHLY: 'price_test',
      STRIPE_PRODUCT_ID_CREDIT_PACK: 'prod_test',
      GITHUB_REPOSITORY_APP_CLIENT_ID: 'Iv1.production',
      GITHUB_REPOSITORY_APP_CLIENT_SECRET: 'github-app-secret',
      GITHUB_REPOSITORY_APP_SLUG: 'tau-production',
      GITHUB_REPOSITORY_APP_CALLBACK_URL: 'https://api.tau.new/v1/github/callback',
      GITHUB_REPOSITORY_CONNECTION_KEY: Buffer.alloc(32, 7).toString('base64url'),
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.TAU_S3_PUBLIC_BASE_URL).toBe('https://cdn.tau.new');
      expect(result.data.TAU_S3_FORCE_PATH_STYLE).toBe(false);
    }
  });

  it('should default TAU_S3_PRIVATE_BUCKET to tau-content-private when omitted', () => {
    const envWithoutPrivateBucket = Object.fromEntries(
      Object.entries(withRequiredCookieSecret(process.env)).filter(([key]) => key !== 'TAU_S3_PRIVATE_BUCKET'),
    );
    const result = environmentSchema.safeParse(envWithoutPrivateBucket);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.TAU_S3_PRIVATE_BUCKET).toBe('tau-content-private');
    }
  });

  it('should reject a partially configured GitHub repository App in development', () => {
    const result = environmentSchema.safeParse({
      ...withRequiredCookieSecret(process.env),
      NODE_ENV: 'development',
      GITHUB_REPOSITORY_APP_CLIENT_ID: 'Iv1.partial',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'GITHUB_REPOSITORY_APP_CLIENT_SECRET')).toBe(
        true,
      );
    }
  });

  it('should allow production without the optional GitHub repository App', () => {
    const result = environmentSchema.safeParse({
      ...withRequiredCookieSecret(process.env),
      NODE_ENV: 'production',
      TAU_S3_ENDPOINT: 'https://000000000000000000000000.r2.cloudflarestorage.com',
      TAU_S3_PUBLIC_BASE_URL: 'https://cdn.tau.new',
      TAU_S3_ACCESS_KEY_ID: 'key',
      TAU_S3_SECRET_ACCESS_KEY: 'secret',
      TAU_API_URL: 'https://api.tau.new',
      DATABASE_RUNTIME_ROLE: 'tau_api_runtime',
      GITHUB_REPOSITORY_APP_CLIENT_ID: undefined,
      GITHUB_REPOSITORY_APP_CLIENT_SECRET: undefined,
      GITHUB_REPOSITORY_APP_SLUG: undefined,
      GITHUB_REPOSITORY_APP_CALLBACK_URL: undefined,
      GITHUB_REPOSITORY_CONNECTION_KEY: undefined,
    });

    expect(result.success).toBe(true);
  });

  it('should reject TAU_S3_PRIVATE_BUCKET equal to TAU_S3_BUCKET in production mode', () => {
    const result = environmentSchema.safeParse({
      ...withRequiredCookieSecret(process.env),
      NODE_ENV: 'production',
      TAU_S3_ENDPOINT: 'https://000000000000000000000000.r2.cloudflarestorage.com',
      TAU_S3_PUBLIC_BASE_URL: 'https://cdn.tau.new',
      TAU_S3_ACCESS_KEY_ID: 'key',
      TAU_S3_SECRET_ACCESS_KEY: 'secret',
      TAU_API_URL: 'https://api.tau.new',
      TAU_S3_BUCKET: 'tau-prod-content',
      TAU_S3_PRIVATE_BUCKET: 'tau-prod-content',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'TAU_S3_PRIVATE_BUCKET')).toBe(true);
    }
  });

  it.each(['BILLING_ENVIRONMENT', 'STRIPE_READ_SECRET_KEY', 'STRIPE_ACCOUNT_ID', 'STRIPE_LIVEMODE'])(
    'requires explicit %s in production',
    (key) => {
      const result = environmentSchema.safeParse({
        ...withRequiredCookieSecret(process.env),
        NODE_ENV: 'production',
        TAU_CLOUD_ENABLED: 'true',
        STRIPE_READ_SECRET_KEY: 'rk_test_read',
        STRIPE_ACCOUNT_ID: 'acct_test',
        STRIPE_LIVEMODE: 'false',
        [key]: undefined,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.path[0] === key)).toBe(true);
      }
    },
  );

  /* Ruling P50: the local-address relaxation is a development posture only. */
  it('should reject TAU_GIT_REMOTE_ALLOW_PRIVATE in production mode', () => {
    const result = environmentSchema.safeParse({
      ...withRequiredCookieSecret(process.env),
      NODE_ENV: 'production',
      TAU_S3_ENDPOINT: 'https://000000000000000000000000.r2.cloudflarestorage.com',
      TAU_S3_PUBLIC_BASE_URL: 'https://cdn.tau.new',
      TAU_S3_ACCESS_KEY_ID: 'key',
      TAU_S3_SECRET_ACCESS_KEY: 'secret',
      TAU_API_URL: 'https://api.tau.new',
      TAU_GIT_REMOTE_ALLOW_PRIVATE: '1',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'TAU_GIT_REMOTE_ALLOW_PRIVATE')).toBe(true);
    }
  });

  it('should default TAU_GIT_REMOTE_ALLOW_PRIVATE to refusing private addresses', () => {
    const result = environmentSchema.safeParse(withRequiredCookieSecret(process.env));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.TAU_GIT_REMOTE_ALLOW_PRIVATE).toBe('0');
    }
  });

  it('should reject localhost TAU_API_URL in production mode', () => {
    const result = environmentSchema.safeParse({
      ...withRequiredCookieSecret(process.env),
      NODE_ENV: 'production',
      TAU_S3_ENDPOINT: 'https://000000000000000000000000.r2.cloudflarestorage.com',
      TAU_S3_PUBLIC_BASE_URL: 'https://cdn.tau.new',
      TAU_S3_ACCESS_KEY_ID: 'key',
      TAU_S3_SECRET_ACCESS_KEY: 'secret',
      TAU_API_URL: 'http://localhost:3000',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'TAU_API_URL')).toBe(true);
    }
  });

  it('should reject a missing TAU_API_URL because it has no default', () => {
    const envWithoutApiUrl = Object.fromEntries(
      Object.entries(withRequiredCookieSecret(process.env)).filter(([key]) => key !== 'TAU_API_URL'),
    );
    const result = environmentSchema.safeParse(envWithoutApiUrl);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'TAU_API_URL')).toBe(true);
    }
  });

  it('should accept TAU_LLM_PROVIDER_UPSTREAM_URL only in the development billing environment', () => {
    const environment = {
      ...withRequiredCookieSecret(process.env),
      TAU_LLM_PROVIDER_UPSTREAM_URL: 'http://127.0.0.1:4015',
    };
    const development = environmentSchema.safeParse({ ...environment, BILLING_ENVIRONMENT: 'development' });
    const production = environmentSchema.safeParse({ ...environment, BILLING_ENVIRONMENT: 'prod-us' });

    expect(development.success).toBe(true);
    expect(production.success).toBe(false);
    if (!production.success) {
      expect(production.error.issues.some((issue) => issue.path.join('.') === 'TAU_LLM_PROVIDER_UPSTREAM_URL')).toBe(
        true,
      );
    }
  });
});
/* eslint-enable @typescript-eslint/naming-convention -- end process.env fixture scope */
