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
  it('should parse merged process env including TAU_S3_* defaults in development', () => {
    const merged = environmentSchema.safeParse(withRequiredCookieSecret(process.env));
    expect(merged.success).toBe(true);
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
    const base: Record<string, unknown> = { ...withRequiredCookieSecret(process.env), NODE_ENV: 'production' };
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
});
/* eslint-enable @typescript-eslint/naming-convention -- end process.env fixture scope */
