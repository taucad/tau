import process from 'node:process';
import { z } from 'zod';
import { jsonCodec } from '#lib/zod.lib.js';

const environmentSchemaBase = z.object({
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
  TAU_PROVIDER_DIAGNOSTICS_VERBOSE: z.coerce
    .boolean()
    .default(false)
    .describe('Emit sanitized provider request diagnostics for successful model calls. Failures are always logged.'),

  // Authentication
  AUTH_SECRET: z.string(),
  /**
   * Secret for signing the first-party `tau_view_id` cookie and related publication view dedup. Must be
   * at least 32 characters.
   */
  TAU_VIEW_COOKIE_SECRET: z.string().min(32),
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

  // Object storage (MinIO via infra/docker-compose in dev; Cloudflare R2 in staging/production — overrides defaults via Fly secrets + env)
  TAU_S3_ENDPOINT: z
    .string()
    .default('http://localhost:9000')
    .describe('S3-compatible API endpoint (MinIO or *.r2.cloudflarestorage.com)'),
  TAU_S3_REGION: z.string().default('us-east-1').describe('AWS SigV4 region (MinIO: arbitrary; R2/Tigris: auto)'),
  TAU_S3_ACCESS_KEY_ID: z.string().default('tau-api'),
  TAU_S3_SECRET_ACCESS_KEY: z.string().default('tau-api-dev-secret'),
  TAU_S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true).describe('Required true for MinIO + R2 S3 API'),
  TAU_S3_BUCKET: z
    .string()
    .default('tau-content')
    .describe(
      'Single R2 bucket per environment; namespace prefixes (blobs/, derivatives/, etc.) are compile-time constants in storage.constants.ts',
    ),
  TAU_S3_PUBLIC_BASE_URL: z
    .string()
    .default('http://localhost:9000/tau-content')
    .describe('Canonical CDN/host prefix for browser GETs (never *.r2.cloudflarestorage.com in prod UI)'),

  // OpenTelemetry
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional().describe('OTLP endpoint for traces and logs'),
  OTEL_EXPORTER_OTLP_HEADERS: z.string().optional().describe('OTLP auth headers (e.g., Grafana Cloud Basic auth)'),
  OTEL_METRICS_PORT: z.string().optional().default('9464').describe('Port for Prometheus metrics exporter'),
  /* eslint-enable @typescript-eslint/naming-convention -- renabling */
});

export const environmentSchema = environmentSchemaBase.superRefine((data, context) => {
  if (data.NODE_ENV !== 'production') {
    return;
  }

  try {
    const endpointHost = new URL(data.TAU_S3_ENDPOINT).hostname;
    if (endpointHost === 'localhost' || endpointHost === '127.0.0.1') {
      context.addIssue({
        code: 'custom',
        message: 'TAU_S3_ENDPOINT must not target localhost in production',
        path: ['TAU_S3_ENDPOINT'],
      });
    }
  } catch {
    context.addIssue({
      code: 'custom',
      message: 'TAU_S3_ENDPOINT must be a valid URL',
      path: ['TAU_S3_ENDPOINT'],
    });
  }

  try {
    const publicHost = new URL(data.TAU_S3_PUBLIC_BASE_URL).hostname;
    if (publicHost === 'localhost' || publicHost === '127.0.0.1') {
      context.addIssue({
        code: 'custom',
        message: 'TAU_S3_PUBLIC_BASE_URL must not target localhost in production',
        path: ['TAU_S3_PUBLIC_BASE_URL'],
      });
    }
  } catch {
    context.addIssue({
      code: 'custom',
      message: 'TAU_S3_PUBLIC_BASE_URL must be a valid URL',
      path: ['TAU_S3_PUBLIC_BASE_URL'],
    });
  }

  // Never boot production on the checked-in dev S3 credentials (MinIO defaults).
  if (data.TAU_S3_ACCESS_KEY_ID === 'tau-api') {
    context.addIssue({
      code: 'custom',
      message: 'TAU_S3_ACCESS_KEY_ID must not use the default dev credential in production',
      path: ['TAU_S3_ACCESS_KEY_ID'],
    });
  }
  if (data.TAU_S3_SECRET_ACCESS_KEY === 'tau-api-dev-secret') {
    context.addIssue({
      code: 'custom',
      message: 'TAU_S3_SECRET_ACCESS_KEY must not use the default dev credential in production',
      path: ['TAU_S3_SECRET_ACCESS_KEY'],
    });
  }
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
