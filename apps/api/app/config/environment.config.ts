import process from 'node:process';
import { z } from 'zod/v4';

const environmentSchema = z.object({
  /* eslint-disable @typescript-eslint/naming-convention -- environment variables are UPPER_CASED */
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.string().default('3000'),
  DATABASE_URL: z.string(),
  TAU_FRONTEND_URL: z.string(),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']),
  LOG_SERVICE: z.enum(['console', 'fly', 'google-logging', 'aws-cloudwatch']).default('console'),

  // Chat & LLMs
  OPENAI_API_KEY: z.string(),
  ANTHROPIC_API_KEY: z.string(),
  SAMBA_API_KEY: z.string().optional(),
  MORPH_API_KEY: z.string().optional(),
  GOOGLE_VERTEX_AI_CREDENTIALS: z
    .string()
    .transform((value) => JSON.parse(value) as Record<string, unknown>)
    .pipe(
      z.object({
        type: z.string(),
        project_id: z.string(),
        private_key_id: z.string(),
        private_key: z.string(),
        client_email: z.string(),
        client_id: z.string(),
        auth_uri: z.string(),
        token_uri: z.string(),
        auth_provider_x509_cert_url: z.string(),
        client_x509_cert_url: z.string(),
        universe_domain: z.string(),
      }),
    ),
  LANGSMITH_TRACING: z.string().optional(),
  LANGSMITH_ENDPOINT: z.string().optional(),
  LANGSMITH_PROJECT: z.string().optional(),
  LANGSMITH_API_KEY: z.string().optional(),

  // Authentication
  AUTH_SECRET: z.string(),
  AUTH_URL: z.string(),
  GITHUB_CLIENT_ID: z.string(),
  GITHUB_CLIENT_SECRET: z.string(),
  /* eslint-enable @typescript-eslint/naming-convention -- renabling */
});

export const getEnvironment = (): Environment => {
  const result = environmentSchema.safeParse(process.env);

  if (!result.success) {
    const formattedError = z.treeifyError(result.error).properties;
    const errorMessage = `Invalid environment configuration: ${JSON.stringify(formattedError)}`;
    throw new Error(errorMessage);
  }

  return result.data;
};

export type Environment = z.infer<typeof environmentSchema>;
