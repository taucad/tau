// @vitest-environment node
import process from 'node:process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ENV, getClientEnvironment, getEnvironment, resolveFrontendUrl } from '#environment.config.js';
import type { ClientEnvironment } from '#environment.config.js';

const originalEnvironment = { ...process.env };
const originalProcessEnvironmentDescriptor = Object.getOwnPropertyDescriptor(process, 'env');
const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');

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

describe('getClientEnvironment', () => {
  const secretToken = 'pretend-this-is-a-real-server-only-secret';

  // `AUTH_SECRET` is the API service's, not the UI's — it is absent from
  // `environmentSchema` on purpose. Deployments that share one env file across
  // both services still leak it into this process, so assert it is dropped.
  const setEnvironmentWithSecret = (): void => {
    setProcessEnvironment(
      withBaseEnvironment([
        ['TAU_FRONTEND_URL', 'https://taucad.dev'],
        ['AUTH_SECRET', secretToken],
      ]),
    );
  };

  afterEach(() => {
    process.env = originalEnvironment;
  });

  // This payload is serialised into page source for every visitor, so a
  // server-only key reaching it is a leak.
  it('should omit server-only secrets from the client payload', async () => {
    setEnvironmentWithSecret();

    const clientEnvironment = await getClientEnvironment();

    expect(clientEnvironment).not.toHaveProperty('AUTH_SECRET');
    expect(JSON.stringify(clientEnvironment)).not.toContain(secretToken);
  });

  it('should omit server-only secrets from server-side UI environment parsing', async () => {
    setEnvironmentWithSecret();

    const environment = await getEnvironment();

    expect(environment).not.toHaveProperty('AUTH_SECRET');
    expect(JSON.stringify(environment)).not.toContain(secretToken);
  });

  it('should carry the client-safe keys through to the browser', async () => {
    setEnvironmentWithSecret();

    const clientEnvironment = await getClientEnvironment();

    /* eslint-disable @typescript-eslint/naming-convention -- environment variable keys are uppercase by contract. */
    expect(clientEnvironment).toMatchObject({
      TAU_API_URL: 'https://api.taucad.dev',
      TAU_WEBSOCKET_URL: 'wss://api.taucad.dev',
      TAU_FRONTEND_URL: 'https://taucad.dev',
      TAU_DEBUG: false,
      NODE_ENV: 'production',
      POSTHOG_API_HOST: 'https://us.i.posthog.com',
    });
    /* eslint-enable @typescript-eslint/naming-convention -- environment variable keys are uppercase by contract. */
  });

  it('should expose parsed server values without treating string booleans as truthy', () => {
    setEnvironmentWithSecret();
    process.env['TAU_DEBUG'] = 'true';
    expect(ENV.TAU_DEBUG).toBe(true);

    process.env['TAU_DEBUG'] = 'false';
    expect(ENV.TAU_DEBUG).toBe(false);
  });

  // Pins the fail-closed property: a key added to the schema stays server-only
  // until it is deliberately added to `clientEnvironmentKeys`. This list is the
  // exact set of values published in page source — extend it deliberately.
  it('should expose only allowlisted keys, never the whole schema', async () => {
    setEnvironmentWithSecret();

    const clientEnvironment = await getClientEnvironment();

    expect(Object.keys(clientEnvironment).toSorted()).toStrictEqual([
      'NODE_ENV',
      'POSTHOG_API_HOST',
      'POSTHOG_ASSET_HOST',
      'POSTHOG_CLIENT_KEY',
      'POSTHOG_UI_HOST',
      'TAU_API_URL',
      'TAU_DEBUG',
      'TAU_FRONTEND_URL',
      'TAU_WEBSOCKET_URL',
    ]);
  });
});

describe('window.ENV host contract', () => {
  afterEach(() => {
    if (originalProcessEnvironmentDescriptor) {
      Object.defineProperty(process, 'env', originalProcessEnvironmentDescriptor);
    }
    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
    } else {
      // oxlint-disable-next-line @typescript-eslint/no-dynamic-delete -- restoring the Node test global.
      delete (globalThis as { window?: Window }).window;
    }
    vi.resetModules();
  });

  it('uses the full pre-import injection without reading process.env', async () => {
    const injectedEnvironment = {
      /* eslint-disable @typescript-eslint/naming-convention -- environment variable keys are uppercase by contract. */
      TAU_API_URL: 'https://api.host.test',
      TAU_WEBSOCKET_URL: 'wss://socket.host.test',
      TAU_FRONTEND_URL: 'https://host.test',
      TAU_DEBUG: true,
      NODE_ENV: 'production',
      POSTHOG_API_HOST: 'https://events.host.test',
      POSTHOG_UI_HOST: 'https://analytics.host.test',
      POSTHOG_ASSET_HOST: 'assets.host.test',
      POSTHOG_CLIENT_KEY: 'phc_host',
      /* eslint-enable @typescript-eslint/naming-convention -- environment variable keys are uppercase by contract. */
    } as const satisfies ClientEnvironment;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- browser injection contract is named window.ENV.
      value: { ENV: injectedEnvironment },
    });
    const processEnvironmentRead = vi.fn(() => originalEnvironment);
    Object.defineProperty(process, 'env', {
      configurable: true,
      get: processEnvironmentRead,
    });
    vi.resetModules();

    const { ENV: freshEnvironment } = await import('#environment.config.js');
    const resolvedEnvironment = { ...freshEnvironment };
    if (originalProcessEnvironmentDescriptor) {
      Object.defineProperty(process, 'env', originalProcessEnvironmentDescriptor);
    }

    expect(resolvedEnvironment).toStrictEqual(injectedEnvironment);
    expect(processEnvironmentRead).not.toHaveBeenCalled();
  });

  it('reads nothing in a worker, which has neither window nor process', async () => {
    // oxlint-disable-next-line @typescript-eslint/no-dynamic-delete -- a worker global has no window.
    delete (globalThis as { window?: Window }).window;
    vi.resetModules();
    /* Imported while Node still has its own globals — a worker bundle is
     * loaded by a runtime that never had `process`, which this environment
     * cannot reproduce without breaking the module loader. The facade resolves
     * lazily, so the globals only have to be gone at read time. */
    const { ENV: workerEnvironment } = await import('#environment.config.js');
    const originalProcess = globalThis.process;
    // oxlint-disable-next-line @typescript-eslint/no-dynamic-delete -- a worker global has no process either.
    delete (globalThis as { process?: NodeJS.Process }).process;

    try {
      // The read that used to throw and abandon the job that made it.
      expect(workerEnvironment.TAU_DEBUG).toBeUndefined();
      // A required value still fails by name rather than by TypeError.
      expect(() => workerEnvironment.TAU_API_URL).toThrow(/Missing TAU_API_URL/u);
    } finally {
      Object.defineProperty(globalThis, 'process', { configurable: true, writable: true, value: originalProcess });
    }
  });
});
