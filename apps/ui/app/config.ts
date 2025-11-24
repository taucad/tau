/**
 * Environment variable loader for the server.
 *
 * Uses Zod for validation
 */
import process from 'node:process';
import { z } from 'zod/v4';

// Define the schema for environment variables
const environmentSchema = z.preprocess(
  (env) => {
    const rawEnv = env as Record<string, string | undefined>;

    // Extract base URL from NETLIFY_AI_GATEWAY_URL if TAU_FRONTEND_URL not set
    // NETLIFY_AI_GATEWAY_URL format: https://deploy-preview-XX--site.netlify.app/.netlify/ai
    let frontendUrl = rawEnv['TAU_FRONTEND_URL'];
    if (!frontendUrl && rawEnv['NETLIFY_AI_GATEWAY_URL']) {
      // Use URL constructor to reliably extract origin (protocol + host)
      const url = new URL(rawEnv['NETLIFY_AI_GATEWAY_URL']);
      frontendUrl = url.origin;
    }

    return {
      ...rawEnv,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable name
      TAU_FRONTEND_URL: frontendUrl,
    };
  },
  z.object({
    /* eslint-disable @typescript-eslint/naming-convention -- environment variables are not camelCase */
    TAU_API_URL: z.url(),
    TAU_FRONTEND_URL: z.url(),
    NODE_ENV: z.enum(['development', 'production', 'test']),
    ZOO_API_KEY: z.string().optional().describe('To be removed in favor of integrations.'),
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

// eslint-disable-next-line @typescript-eslint/naming-convention, @typescript-eslint/no-unnecessary-condition -- easier to distinguish this constant with UPPER_CASE.
export const ENV = globalThis.window ? globalThis.window.ENV : process.env;
