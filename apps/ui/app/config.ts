/**
 * Environment variable loader for the server.
 *
 * Uses Zod for validation
 */
import process from 'node:process';
import { z } from 'zod';

// Define the schema for environment variables
const environmentSchema = z.object({
  /* eslint-disable @typescript-eslint/naming-convention -- environment variables are not camelCase */
  TAU_API_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'production', 'test']),
  /* eslint-enable @typescript-eslint/naming-convention -- environment variables are not camelCase */
});

export const getEnvironment = async () => {
  const result = environmentSchema.safeParse(process.env);

  if (!result.success) {
    const formattedError = result.error.flatten().fieldErrors;
    const errorMessage = `Invalid environment configuration: ${JSON.stringify(formattedError)}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  return result.data;
};

export type Environment = z.infer<typeof environmentSchema>;

// eslint-disable-next-line @typescript-eslint/naming-convention -- easier to distinguish this constant with UPPER_CASE.
export const ENV = globalThis.window ? globalThis.window.ENV : process.env;

/**
 * Meta config. Contains infrequently changing information about the app.
 */
export const metaConfig = {
  /**
   * The name of the app. Used for SEO and other metadata such as PWA and app store naming.
   */
  name: 'Tau',
  /**
   * The prefix for all cookies.
   *
   * WARNING: changing this value will cause existing cookies not to be read and result in poor UX.
   */
  cookiePrefix: 'tau-',
  /**
   * The URL to the GitHub repository.
   */
  githubUrl: 'https://github.com/opensrchq/tau',
  /**
   * The description of the app. Used for SEO and other metadata such as PWA and app store descriptions.
   */
  description:
    'Your AI-powered workshop companion - a free, open-source CAD platform that works offline. Design anything from 3D prints to woodworking projects with intelligent assistance, right in your browser.',
} as const;
