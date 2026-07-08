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

export const getEnvironment = async (): Promise<Environment> => {
  const result = environmentSchema.safeParse(process.env);

  if (!result.success) {
    const formattedError = z.treeifyError(result.error).properties;
    const errorMessage = `Invalid environment configuration: ${JSON.stringify(formattedError)}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  return result.data;
};

export type Environment = z.infer<typeof environmentSchema>;

// eslint-disable-next-line @typescript-eslint/naming-convention -- easier to distinguish this constant with UPPER_CASE.
export const ENV =
  // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- globalThis.window can be undefined in SSR
  globalThis.window ? globalThis.window.ENV : globalThis.process.env;
