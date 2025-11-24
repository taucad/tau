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
    return {
      ...rawEnv,
      // Use TAU_FRONTEND_URL if explicitly set
      // otherwise fall back to DEPLOY_PRIME_URL (Netlify auto-provides at runtime),
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable name
      TAU_FRONTEND_URL: rawEnv['TAU_FRONTEND_URL'] ?? rawEnv['DEPLOY_PRIME_URL'],
    };
  },
  z.object({
    /* eslint-disable @typescript-eslint/naming-convention -- environment variables are not camelCase */
    TAU_API_URL: z.url(),
    TAU_FRONTEND_URL: z.url(),
    NODE_ENV: z.enum(['development', 'production', 'test']),
    ZOO_API_KEY: z.string().optional(),
    /* eslint-enable @typescript-eslint/naming-convention -- environment variables are not camelCase */
  }),
);

export const getEnvironment = async (): Promise<Environment> => {
  const result = environmentSchema.safeParse(process.env);

  if (!result.success) {
    const formattedError = z.treeifyError(result.error).properties;
    const errorMessage = `Invalid environment configuration: ${JSON.stringify(formattedError)}`;
    console.error(errorMessage);
    console.error('process.env at validation:', process.env);
    throw new Error(errorMessage);
  }

  console.log('[SERVER] Environment loaded successfully:', {
    TAU_API_URL: result.data.TAU_API_URL,
    TAU_FRONTEND_URL: result.data.TAU_FRONTEND_URL,
    NODE_ENV: result.data.NODE_ENV,
  });

  return result.data;
};

export type Environment = z.infer<typeof environmentSchema>;

// eslint-disable-next-line @typescript-eslint/naming-convention, @typescript-eslint/no-unnecessary-condition -- easier to distinguish this constant with UPPER_CASE.
export const ENV = globalThis.window ? globalThis.window.ENV : process.env;
