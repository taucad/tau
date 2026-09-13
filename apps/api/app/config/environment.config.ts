import process from 'node:process';
import { z } from 'zod';
import { jsonCodec } from '#lib/zod.lib.js';

const environmentSchema = z.object({
  /* eslint-disable @typescript-eslint/naming-convention -- environment variables are UPPER_CASED */
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.string().default('3000'),
  DATABASE_URL: z.string(),
  TAU_FRONTEND_URL: z.string(),
  ADDITIONAL_CORS_ORIGINS: jsonCodec(z.array(z.string()).describe('Additional CORS origin glob patterns to allow.'))
    .optional()
    .default([]),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']),
  LOG_SERVICE: z.enum(['console', 'fly', 'google-logging', 'aws-cloudwatch']).default('console'),

  // Chat & LLMs
  OPENAI_API_KEY: z.string(),
  ANTHROPIC_API_KEY: z.string(),
  MORPH_API_KEY: z.string().optional(),
  GOOGLE_VERTEX_AI_CREDENTIALS: jsonCodec(
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
  TAVILY_API_KEY: z.string().optional(),
  CEREBRAS_API_KEY: z.string().optional(),
  TOGETHER_API_KEY: z.string().optional(),
  LANGSMITH_TRACING: z.string().optional(),
  LANGSMITH_ENDPOINT: z.string().optional(),
  LANGSMITH_PROJECT: z.string().optional(),
  LANGSMITH_API_KEY: z.string().optional(),

  // Authentication
  AUTH_SECRET: z.string(),
  AUTH_URL: z.string(),
  GITHUB_CLIENT_ID: z.string(),
  GITHUB_CLIENT_SECRET: z.string(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // Email delivery
  RESEND_API_KEY: z.string().default(''),
  TAU_EMAIL_FROM: z.string().default('Tau <identity@taucad.dev>'),
  TAU_EMAIL_REPLY_TO: z.email().default('identity@taucad.dev'),

  // Local Model Providers
  OLLAMA_ENABLED: z.coerce.boolean().default(false).describe('Enable Ollama local model provider'),

  // Kernel Integrations
  ZOO_API_KEY: z.string().describe('Zoo.dev API key for KCL kernel proxy'),
  ZOO_WEBSOCKET_URL: z.string().describe('Zoo.dev API URL for KCL kernel proxy').default('wss://api.zoo.dev'),

  // Redis Configuration
  REDIS_URL: z.string().describe('Redis connection URL (e.g., redis://localhost:6379 or rediss://... for TLS)'),

  // OpenTelemetry
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional().describe('OTLP endpoint for traces and logs'),
  OTEL_EXPORTER_OTLP_HEADERS: z.string().optional().describe('OTLP auth headers (e.g., Grafana Cloud Basic auth)'),
  OTEL_METRICS_PORT: z.string().optional().default('9464').describe('Port for Prometheus metrics exporter'),
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
