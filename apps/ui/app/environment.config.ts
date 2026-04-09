/**
 * Environment variable loader for the server.
 *
 * Uses Zod for validation
 */
import process from 'node:process';
import { z } from 'zod';

// Define the schema for environment variables
const environmentSchema = z.preprocess(
  (environment) => {
    const rawEnvironment = environment as Record<string, string | undefined>;

    // Extract base URL from NETLIFY_AI_GATEWAY_URL if TAU_FRONTEND_URL not set
    // NETLIFY_AI_GATEWAY_URL format: https://deploy-preview-XX--site.netlify.app/.netlify/ai
    let frontendUrl = rawEnvironment['TAU_FRONTEND_URL'];
    if (!frontendUrl && rawEnvironment['NETLIFY_AI_GATEWAY_URL']) {
      // Use URL constructor to reliably extract origin (protocol + host)
      const url = new URL(rawEnvironment['NETLIFY_AI_GATEWAY_URL']);
      frontendUrl = url.origin;
    }

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

    // ClassCAD / Buerli
    CLASSCAD_WASM_KEY: z.string().optional().describe('ClassCAD WASM API key for the Buerli kernel.'),
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
  globalThis.window ? globalThis.window.ENV : process.env;
