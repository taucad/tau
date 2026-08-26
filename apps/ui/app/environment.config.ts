/**
 * Environment variable loader for the server.
 *
 * Uses Zod for validation
 */
import { z } from 'zod';

type RawEnvironment = Record<string, string | undefined>;

const toOriginOrRaw = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
};

export const resolveFrontendUrl = (rawEnvironment: RawEnvironment): string | undefined => {
  if (rawEnvironment['TAU_FRONTEND_URL']) {
    return rawEnvironment['TAU_FRONTEND_URL'];
  }

  if (rawEnvironment['NETLIFY'] !== 'true' || rawEnvironment['CONTEXT'] === 'production') {
    return undefined;
  }

  return (
    toOriginOrRaw(typeof tauBuildFrontendUrl === 'string' ? tauBuildFrontendUrl : undefined) ??
    toOriginOrRaw(rawEnvironment['DEPLOY_PRIME_URL']) ??
    toOriginOrRaw(rawEnvironment['DEPLOY_URL']) ??
    toOriginOrRaw(rawEnvironment['NETLIFY_AI_GATEWAY_URL'])
  );
};

// Define the schema for environment variables
const environmentSchema = z.preprocess(
  (environment) => {
    const rawEnvironment = environment as RawEnvironment;
    const frontendUrl = resolveFrontendUrl(rawEnvironment);

    return {
      ...rawEnvironment,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable name
      TAU_FRONTEND_URL: frontendUrl,
    };
  },
  z.object({
    /* eslint-disable @typescript-eslint/naming-convention -- environment variables are not camelCase */
    TAU_API_URL: z.url(),
    TAU_WEBSOCKET_URL: z.url().describe('WebSocket URL for the API (e.g., wss://api.tau.new or ws://localhost:4001)'),
    TAU_FRONTEND_URL: z.url(),
    /**
     * Toggle in-app debug surfaces (per-route diagnostic panels, e2e
     * inspectors). Surfaced in the React tree via the `tauDebug` feature
     * flag (`#flags/feature-flags.ts`). Accepts the canonical truthy
     * strings `'1'` and `'true'` (case-insensitive) — anything else
     * resolves to `false`.
     */
    TAU_DEBUG: z
      .string()
      .optional()
      .transform((value) => (value === undefined ? false : /^(1|true)$/i.test(value)))
      .describe('Enable in-app debug surfaces (debug panel, inspectors). Default false.'),
    NODE_ENV: z.enum(['development', 'production', 'test']),
    GITHUB_API_TOKEN: z.string().optional().describe('GitHub API token for the GitHub API client.'),

    // PostHog Analytics
    POSTHOG_API_HOST: z.string().default('https://us.i.posthog.com').describe('PostHog host for the PostHog client.'),
    POSTHOG_UI_HOST: z.string().default('https://us.posthog.com').describe('PostHog UI host for the PostHog client.'),
    POSTHOG_ASSET_HOST: z
      .string()
      .default('us-assets.i.posthog.com')
      .describe('PostHog asset host for the PostHog client.'),
    POSTHOG_CLIENT_KEY: z.string().optional().describe('PostHog client key. Set to enable analytics.'),
    /* eslint-enable @typescript-eslint/naming-convention -- environment variables are not camelCase */
  }),
);

export type Environment = z.infer<typeof environmentSchema>;

const parseEnvironment = (rawEnvironment: RawEnvironment): Environment => {
  const result = environmentSchema.safeParse(rawEnvironment);

  if (!result.success) {
    const formattedError = z.treeifyError(result.error).properties;
    const errorMessage = `Invalid environment configuration: ${JSON.stringify(formattedError)}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  return result.data;
};

export const getEnvironment = async (): Promise<Environment> => parseEnvironment(process.env);

/**
 * Keys serialised into `window.ENV` and shipped to every visitor in page
 * source. Add a key only if it is safe to publish (public URLs, publishable
 * keys, feature flags). Everything else stays server-only and is read through
 * `getEnvironment()`.
 */
const clientEnvironmentKeys = [
  'TAU_API_URL',
  'TAU_WEBSOCKET_URL',
  'TAU_FRONTEND_URL',
  'TAU_DEBUG',
  'NODE_ENV',
  'POSTHOG_API_HOST',
  'POSTHOG_UI_HOST',
  'POSTHOG_ASSET_HOST',
  'POSTHOG_CLIENT_KEY',
] as const satisfies ReadonlyArray<keyof Environment>;

export type ClientEnvironment = Pick<Environment, (typeof clientEnvironmentKeys)[number]>;

const selectClientEnvironment = (environment: Environment): ClientEnvironment => {
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- fromEntries cannot retain tuple-key completeness.
  return Object.fromEntries(clientEnvironmentKeys.map((key) => [key, environment[key]])) as ClientEnvironment;
};

/**
 * The allowlisted subset safe to inject into the document. Use this — never
 * `getEnvironment()` — for anything that reaches a loader's return value.
 */
export const getClientEnvironment = async (): Promise<ClientEnvironment> =>
  selectClientEnvironment(await getEnvironment());

/**
 * Isomorphic environment access, narrowed to the client-safe allowlist so a
 * server-only key cannot be read from code that also runs in the browser.
 * Server-only code reads the full environment via `getEnvironment()`.
 */
const resolveIsomorphicClientEnvironment = (): ClientEnvironment => {
  // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- globalThis.window is absent during SSR.
  if (globalThis.window) {
    return globalThis.window.ENV;
  }

  return selectClientEnvironment(parseEnvironment(globalThis.process.env));
};

const createEnvironmentFacade = (): ClientEnvironment => {
  const facade = {};
  for (const key of clientEnvironmentKeys) {
    Object.defineProperty(facade, key, {
      enumerable: true,
      get: () => resolveIsomorphicClientEnvironment()[key],
    });
  }
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- every ClientEnvironment key is defined above.
  return facade as ClientEnvironment;
};

// eslint-disable-next-line @typescript-eslint/naming-convention -- easier to distinguish this constant with UPPER_CASE.
export const ENV = createEnvironmentFacade();
