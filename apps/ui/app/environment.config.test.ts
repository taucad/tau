// @vitest-environment node
import process from 'node:process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getEnvironment, resolveFrontendUrl } from '#environment.config.js';

const originalEnvironment = { ...process.env };

type EnvironmentEntries = ReadonlyArray<readonly [string, string | undefined]>;

const baseEnvironmentEntries = [
  ['TAU_API_URL', 'https://api.taucad.dev'],
  ['TAU_WEBSOCKET_URL', 'wss://api.taucad.dev'],
  ['NODE_ENV', 'production'],
] as const satisfies EnvironmentEntries;

const environmentFrom = (entries: EnvironmentEntries): Record<string, string | undefined> =>
  Object.fromEntries(entries);

const withBaseEnvironment = (entries: EnvironmentEntries): Record<string, string | undefined> =>
  environmentFrom([...baseEnvironmentEntries, ...entries]);

const setProcessEnvironment = (environment: Record<string, string | undefined>): void => {
  const nextEnvironment: NodeJS.ProcessEnv = {};

  for (const [key, value] of Object.entries(environment)) {
    if (value !== undefined) {
      nextEnvironment[key] = value;
    }
  }

  process.env = nextEnvironment;
};

const captureEnvironmentError = async (): Promise<Error> => {
  try {
    await getEnvironment();
  } catch (error) {
    expect(error).toBeInstanceOf(Error);

    if (error instanceof Error) {
      return error;
    }
  }

  throw new Error('Expected getEnvironment to throw.');
};

describe('resolveFrontendUrl', () => {
  it('should prefer explicit TAU_FRONTEND_URL over Netlify preview metadata', () => {
    expect(
      resolveFrontendUrl(
        environmentFrom([
          ['TAU_FRONTEND_URL', 'https://taucad.dev'],
          ['NETLIFY', 'true'],
          ['CONTEXT', 'deploy-preview'],
          ['DEPLOY_PRIME_URL', 'https://deploy-preview-42--taucad.netlify.app/path'],
        ]),
      ),
    ).toBe('https://taucad.dev');
  });

  it('should derive deploy-preview frontend origin from DEPLOY_PRIME_URL first', () => {
    expect(
      resolveFrontendUrl(
        environmentFrom([
          ['NETLIFY', 'true'],
          ['CONTEXT', 'deploy-preview'],
          ['DEPLOY_PRIME_URL', 'https://deploy-preview-42--taucad.netlify.app/path'],
          ['DEPLOY_URL', 'https://other-preview.netlify.app'],
        ]),
      ),
    ).toBe('https://deploy-preview-42--taucad.netlify.app');
  });

  it('should fall back to DEPLOY_URL for Netlify non-production contexts', () => {
    expect(
      resolveFrontendUrl(
        environmentFrom([
          ['NETLIFY', 'true'],
          ['CONTEXT', 'branch-deploy'],
          ['DEPLOY_URL', 'https://branch-deploy--taucad.netlify.app/path'],
        ]),
      ),
    ).toBe('https://branch-deploy--taucad.netlify.app');
  });

  it('should retain NETLIFY_AI_GATEWAY_URL only as a legacy fallback', () => {
    expect(
      resolveFrontendUrl(
        environmentFrom([
          ['NETLIFY', 'true'],
          ['CONTEXT', 'deploy-preview'],
          ['NETLIFY_AI_GATEWAY_URL', 'https://deploy-preview-42--taucad.netlify.app/.netlify/ai'],
        ]),
      ),
    ).toBe('https://deploy-preview-42--taucad.netlify.app');
  });

  it('should keep production strict when TAU_FRONTEND_URL is absent', () => {
    expect(
      resolveFrontendUrl(
        environmentFrom([
          ['NETLIFY', 'true'],
          ['CONTEXT', 'production'],
          ['DEPLOY_PRIME_URL', 'https://taucad.dev'],
        ]),
      ),
    ).toBeUndefined();
  });

  it('should pass malformed preview URLs through to schema validation', () => {
    expect(
      resolveFrontendUrl(
        environmentFrom([
          ['NETLIFY', 'true'],
          ['CONTEXT', 'deploy-preview'],
          ['DEPLOY_PRIME_URL', 'not-a-url'],
        ]),
      ),
    ).toBe('not-a-url');
  });
});

describe('getEnvironment', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = originalEnvironment;
  });

  it('should accept Netlify deploy-preview builds without explicit TAU_FRONTEND_URL', async () => {
    setProcessEnvironment(
      withBaseEnvironment([
        ['NETLIFY', 'true'],
        ['CONTEXT', 'deploy-preview'],
        ['DEPLOY_PRIME_URL', 'https://deploy-preview-42--taucad.netlify.app/path'],
      ]),
    );

    const environment = await getEnvironment();

    expect(environment.TAU_FRONTEND_URL).toBe('https://deploy-preview-42--taucad.netlify.app');
  });

  it('should reject production Netlify builds without explicit TAU_FRONTEND_URL', async () => {
    setProcessEnvironment(
      withBaseEnvironment([
        ['NETLIFY', 'true'],
        ['CONTEXT', 'production'],
        ['DEPLOY_PRIME_URL', 'https://taucad.dev'],
      ]),
    );

    const error = await captureEnvironmentError();

    expect(error.message).toContain('Invalid environment configuration');
    expect(error.message).toContain('TAU_FRONTEND_URL');
  });

  it('should reject malformed deploy-preview frontend URLs', async () => {
    setProcessEnvironment(
      withBaseEnvironment([
        ['NETLIFY', 'true'],
        ['CONTEXT', 'deploy-preview'],
        ['DEPLOY_PRIME_URL', 'not-a-url'],
      ]),
    );

    const error = await captureEnvironmentError();

    expect(error.message).toContain('Invalid environment configuration');
    expect(error.message).toContain('TAU_FRONTEND_URL');
  });

  it('should still require API and WebSocket URLs', async () => {
    setProcessEnvironment(
      environmentFrom([
        ['NODE_ENV', 'production'],
        ['NETLIFY', 'true'],
        ['CONTEXT', 'deploy-preview'],
        ['DEPLOY_PRIME_URL', 'https://deploy-preview-42--taucad.netlify.app'],
      ]),
    );

    const error = await captureEnvironmentError();

    expect(error.message).toContain('Invalid environment configuration');
    expect(error.message).toContain('TAU_API_URL');
    expect(error.message).toContain('TAU_WEBSOCKET_URL');
  });
});
