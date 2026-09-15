import process from 'node:process';
import { z } from 'zod';
import { jsonCodec } from '#lib/zod.lib.js';

const strictEnvironmentBoolean = (defaultValue: boolean) =>
  z.union([z.boolean(), z.enum(['true', 'false']).transform((value) => value === 'true')]).default(defaultValue);

const environmentSchemaBase = z.object({
  /* eslint-disable @typescript-eslint/naming-convention -- environment variables are UPPER_CASED */
  NODE_ENV: z.enum(['development', 'production', 'test']),
  TAU_CLOUD_ENABLED: strictEnvironmentBoolean(false).describe(
    'Start Tau Cloud billing and funded-admission services. Defaults false for self-hosted deployments.',
  ),
  PORT: z.string().default('3000'),
  DATABASE_URL: z.string(),
  // Bounded runtime pool (B8 R3). Every value fails closed: a non-numeric or out-of-range
  // setting refuses startup rather than silently restoring an unbounded default.
  DATABASE_POOL_MAX: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(10)
    .describe('Maximum PostgreSQL backends this API process may open; replicas multiply it against database capacity'),
  DATABASE_CONNECT_TIMEOUT_SECONDS: z.coerce.number().int().min(1).max(60).default(10),
  DATABASE_IDLE_TIMEOUT_SECONDS: z.coerce
    .number()
    .int()
    .min(1)
    .max(3600)
    .default(60)
    .describe('Seconds an unused pooled connection is kept before it is returned to the database'),
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(100).max(300_000).default(15_000),
  DATABASE_LOCK_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(5000),
  DATABASE_IDLE_IN_TRANSACTION_TIMEOUT_MS: z.coerce.number().int().min(100).max(300_000).default(15_000),
  DATABASE_RUNTIME_ROLE: z
    .string()
    .regex(/^[a-z_][a-z0-9_]*$|^$/u)
    .default('')
    .describe(
      'De-privileged role every request connection assumes at connect (B7 R8). Empty = no SET ROLE, for a local database that has not run the migration job; production requires it.',
    ),
  TAU_FRONTEND_URL: z.string(),
  TAU_API_URL: z
    .string()
    .describe(
      'Browser-facing origin of this API (e.g. https://api.tau.new); used to build authenticated publication file proxy URLs. No default — startup validation must fail when it is unset.',
    ),
  ADDITIONAL_CORS_ORIGINS: jsonCodec(z.array(z.string()).describe('Additional CORS origin glob patterns to allow.'))
    .optional()
    .default([]),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']),
  LOG_SERVICE: z.enum(['console', 'fly', 'google-logging', 'aws-cloudwatch']).default('console'),

  // Chat & LLMs
  OPENAI_API_KEY: z.string().optional(),
  // Serves the morph inference-provider catalog rows and the gateway's morph wire only.
  // Optional by design: fast-apply and /v1/compact are deleted (PH17/PH18), so booting
  // and editing never require it (V6).
  MORPH_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
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
  ).optional(),
  TAVILY_API_KEY: z.string().optional(),
  CEREBRAS_API_KEY: z.string().optional(),
  TOGETHER_API_KEY: z.string().optional(),
  XAI_API_KEY: z.string().optional(),
  MOONSHOT_API_KEY: z.string().optional(),
  ZOO_API_KEY: z.string().optional(),
  ZOO_WEBSOCKET_URL: z.url().default('wss://api.zoo.dev'),
  LANGSMITH_TRACING: z.string().optional(),
  LANGSMITH_ENDPOINT: z.string().optional(),
  LANGSMITH_PROJECT: z.string().optional(),
  LANGSMITH_API_KEY: z.string().optional(),
  TAU_PROVIDER_DIAGNOSTICS_VERBOSE: strictEnvironmentBoolean(false).describe(
    'Emit sanitized provider request diagnostics for successful model calls. Failures are always logged.',
  ),

  // Authentication
  AUTH_SECRET: z.string(),
  /**
   * HMAC secret for short-lived anonymous publication view dedup. Must be at least 32 characters.
   */
  TAU_VIEW_COOKIE_SECRET: z.string().min(32),
  AUTH_URL: z.string(),
  GITHUB_CLIENT_ID: z.string(),
  GITHUB_CLIENT_SECRET: z.string(),
  GITHUB_API_TOKEN: z.string().optional(),
  GITHUB_REPOSITORY_APP_CLIENT_ID: z.string().optional(),
  GITHUB_REPOSITORY_APP_CLIENT_SECRET: z.string().optional(),
  GITHUB_REPOSITORY_APP_SLUG: z.string().optional(),
  GITHUB_REPOSITORY_APP_CALLBACK_URL: z.url().optional(),
  GITHUB_REPOSITORY_CONNECTION_KEY: z
    .string()
    .regex(/^[A-Za-z0-9_-]{43}$/u, 'must be an unpadded base64url-encoded 32-byte key')
    .optional(),
  GITHUB_REPOSITORY_CONNECTION_KEY_VERSION: z.coerce.number().int().positive().default(1),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // Email delivery
  RESEND_API_KEY: z.string().default(''),
  TAU_EMAIL_FROM: z.string().default('Tau <identity@taucad.dev>'),
  TAU_EMAIL_REPLY_TO: z.email().default('identity@taucad.dev'),

  // Local Model Providers
  OLLAMA_ENABLED: strictEnvironmentBoolean(false).describe('Enable Ollama local model provider'),

  // Redis Configuration
  // Billing (Stripe + credit ledger). STRIPE_* default to '' (the RESEND_API_KEY pattern) so local
  // dev works without keys; billing endpoints fail closed on the empty value, and production
  // requires explicit financial scope and all configured credentials (see superRefine below).
  BILLING_ENVIRONMENT: z.enum(['development', 'staging', 'prod-us', 'prod-eu']).optional(),
  BILLING_USAGE_CURSOR_SECRET: z.string().min(32).optional(),
  BILLING_REQUEST_DIGEST_SECRET: z.string().min(32).optional(),
  BILLING_PROVIDER_ACCOUNTS: jsonCodec(
    z.partialRecord(
      z.enum(['anthropic', 'openai', 'vertexai', 'together', 'morph', 'xai', 'zoo']),
      z
        .string()
        .min(1)
        .max(128)
        .regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/u),
    ),
  )
    .optional()
    .default({}),
  TAU_LLM_PROVIDER_UPSTREAM_URL: z
    .url()
    .optional()
    .describe(
      'Development-only provider upstream origin. Every funded provider call keeps its path and is sent to this origin instead, so an e2e run can drive the real gateway against a local stub. Refused outside BILLING_ENVIRONMENT=development.',
    ),
  BILLING_INVOCATION_DEADLINE: z.coerce
    .number()
    .int()
    .min(1)
    .max(300_000)
    .default(300_000)
    .describe('Maximum funded provider execution time in milliseconds, including admission'),
  BILLING_RECOVERY_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(300_000)
    .default(30_000)
    .describe('Milliseconds between in-process funded-operation recovery passes; every API replica polls'),
  BILLING_EXACT_INPUT_COUNT: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .default(false)
    .describe(
      "Counts OpenAI input tokens through the supplier's own /v1/responses/input_tokens endpoint before admission, shrinking the hold from the proved byte bound to the exact count. Off by default: enabling it spends a supplier request and up to 5s of admission latency per funded OpenAI call.",
    ),
  STRIPE_SECRET_KEY: z
    .string()
    .default('')
    .describe('Stripe API secret key (sk_test_... in staging, sk_live_... in prod); empty = billing disabled'),
  STRIPE_READ_SECRET_KEY: z.string().default(''),
  STRIPE_ACCOUNT_ID: z.string().default(''),
  STRIPE_LIVEMODE: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  STRIPE_WEBHOOK_SECRET: z.string().default('').describe('Signing secret for the /v1/auth/stripe/webhook endpoint'),
  STRIPE_PRICE_ID_PRO_MONTHLY: z
    .string()
    .default('')
    .describe('Terraform-provisioned Stripe price id for the Pro monthly plan'),
  STRIPE_PRODUCT_ID_CREDIT_PACK: z
    .string()
    .default('')
    .describe('Terraform-provisioned Stripe product id for one-time credit packs'),

  REDIS_URL: z.string().describe('Redis connection URL (e.g., redis://localhost:6379 or rediss://... for TLS)'),

  // Durable job orchestration. Empty token keeps job dispatch unavailable without affecting chat/CAD startup.
  HATCHET_CLIENT_TOKEN: z.string().default(''),
  HATCHET_CLIENT_NAMESPACE: z.string().trim().min(1).default('tau-local'),
  TAU_JOBS_ENABLED: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional()
    .describe(
      'B7 R10 gate for the paid job supplier path. Unset means enabled in development and refused everywhere else; set it true only once an operator-funded allowance covers admitted runs x attempts',
    ),

  // Object storage (MinIO via infra/docker-compose in dev; Cloudflare R2 in staging/production — overrides defaults via Fly secrets + env)
  TAU_S3_ENDPOINT: z
    .string()
    .default('http://localhost:9000')
    .describe('S3-compatible API endpoint (MinIO or *.r2.cloudflarestorage.com)'),
  TAU_S3_REGION: z.string().default('us-east-1').describe('AWS SigV4 region (MinIO: arbitrary; R2/Tigris: auto)'),
  TAU_S3_ACCESS_KEY_ID: z.string().default('tau-api'),
  TAU_S3_SECRET_ACCESS_KEY: z.string().default('tau-api-dev-secret'),
  TAU_S3_FORCE_PATH_STYLE: strictEnvironmentBoolean(true).describe('Required true for MinIO + R2 S3 API'),
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
  TAU_S3_PRIVATE_BUCKET: z
    .string()
    .default('tau-content-private')
    .describe(
      'Fail-closed bucket for private publications (blobs) and all publication manifests; no custom domain, no anonymous read — served only via the authenticated file proxy',
    ),

  // Tau Hosted Remote (git server, charter D15/EQ13). The bare repositories
  // live on the Fly volume mounted at this path; locally it is an ordinary
  // directory the API creates on first push. Never inside a project.
  TAU_GIT_ROOT: z
    .string()
    .default('.tau-git')
    .describe('Directory holding one bare repository per project (<TAU_GIT_ROOT>/<projectId>.git)'),
  /*
   * Ruling P50 (W18 DEF-3). Charter AC18 drives *Connect Git remote* at a local
   * `git http-backend`, which every SSRF guard on both legs refuses by design.
   * This relaxes the refusal for a developer or an end-to-end run and is
   * refused outright in production below; the default keeps refusing.
   */
  TAU_GIT_REMOTE_ALLOW_PRIVATE: z
    .enum(['0', '1'])
    .default('0')
    .describe('Dev/e2e only: let the git proxy reach private, loopback and http:// remotes'),
  TAU_GIT_BACKUP_INTERVAL_HOURS: z.coerce
    .number()
    .min(1)
    .max(168)
    .default(24)
    .describe('Interval between `git bundle` disaster-recovery snapshots of every repository to the private bucket'),

  // OpenTelemetry
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional().describe('OTLP endpoint for traces and logs'),
  OTEL_EXPORTER_OTLP_HEADERS: z.string().optional().describe('OTLP auth headers (e.g., Grafana Cloud Basic auth)'),
  OTEL_METRICS_PORT: z.string().optional().default('9464').describe('Port for Prometheus metrics exporter'),
  /* eslint-enable @typescript-eslint/naming-convention -- renabling */
});

export const environmentSchema = environmentSchemaBase.superRefine((data, context) => {
  // Checked before the production gate below: redirecting funded provider traffic must be
  // refused in staging and production too, not only when NODE_ENV happens to be production.
  if (data.TAU_LLM_PROVIDER_UPSTREAM_URL !== undefined && data.BILLING_ENVIRONMENT !== 'development') {
    context.addIssue({
      code: 'custom',
      message: 'TAU_LLM_PROVIDER_UPSTREAM_URL requires BILLING_ENVIRONMENT=development',
      path: ['TAU_LLM_PROVIDER_UPSTREAM_URL'],
    });
  }

  const githubRepositoryKeys = [
    'GITHUB_REPOSITORY_APP_CLIENT_ID',
    'GITHUB_REPOSITORY_APP_CLIENT_SECRET',
    'GITHUB_REPOSITORY_APP_SLUG',
    'GITHUB_REPOSITORY_APP_CALLBACK_URL',
    'GITHUB_REPOSITORY_CONNECTION_KEY',
  ] as const;
  const configuredGithubRepositoryKeys = githubRepositoryKeys.filter((key) => data[key] !== undefined);
  if (
    configuredGithubRepositoryKeys.length > 0 &&
    configuredGithubRepositoryKeys.length < githubRepositoryKeys.length
  ) {
    for (const key of githubRepositoryKeys) {
      if (data[key] === undefined) {
        context.addIssue({
          code: 'custom',
          message: `${key} is required when GitHub repository access is configured`,
          path: [key],
        });
      }
    }
  }

  if (data.TAU_CLOUD_ENABLED) {
    const requiredCloudKeys = [
      'BILLING_ENVIRONMENT',
      'BILLING_USAGE_CURSOR_SECRET',
      'BILLING_REQUEST_DIGEST_SECRET',
      'STRIPE_SECRET_KEY',
      'STRIPE_READ_SECRET_KEY',
      'STRIPE_ACCOUNT_ID',
      'STRIPE_LIVEMODE',
      'STRIPE_WEBHOOK_SECRET',
      'STRIPE_PRICE_ID_PRO_MONTHLY',
      'STRIPE_PRODUCT_ID_CREDIT_PACK',
    ] as const;
    for (const key of requiredCloudKeys) {
      if (data[key] === undefined || data[key] === '') {
        context.addIssue({
          code: 'custom',
          message: `${key} is required when TAU_CLOUD_ENABLED=true`,
          path: [key],
        });
      }
    }
    const stripeMode = data.STRIPE_LIVEMODE ? 'live' : 'test';
    const stripeIdentifiers = [
      ['STRIPE_SECRET_KEY', data.STRIPE_SECRET_KEY, [`sk_${stripeMode}_`, `rk_${stripeMode}_`]],
      ['STRIPE_READ_SECRET_KEY', data.STRIPE_READ_SECRET_KEY, [`rk_${stripeMode}_`]],
      ['STRIPE_ACCOUNT_ID', data.STRIPE_ACCOUNT_ID, 'acct_'],
      ['STRIPE_WEBHOOK_SECRET', data.STRIPE_WEBHOOK_SECRET, 'whsec_'],
      ['STRIPE_PRICE_ID_PRO_MONTHLY', data.STRIPE_PRICE_ID_PRO_MONTHLY, 'price_'],
      ['STRIPE_PRODUCT_ID_CREDIT_PACK', data.STRIPE_PRODUCT_ID_CREDIT_PACK, 'prod_'],
    ] as const;
    for (const [key, value, accepted] of stripeIdentifiers) {
      const prefixes = typeof accepted === 'string' ? [accepted] : accepted;
      if (value && !prefixes.some((prefix) => value.startsWith(prefix))) {
        context.addIssue({ code: 'custom', message: `${key} does not match Stripe ${stripeMode} mode`, path: [key] });
      }
    }
  }

  if (data.NODE_ENV !== 'production') {
    return;
  }

  // P50 is a development posture, never a deployment one: a production API that
  // could be asked to reach a private address is an SSRF hole into the network
  // it runs in.
  if (data.TAU_GIT_REMOTE_ALLOW_PRIVATE === '1') {
    context.addIssue({
      code: 'custom',
      message: 'TAU_GIT_REMOTE_ALLOW_PRIVATE must not be set in production',
      path: ['TAU_GIT_REMOTE_ALLOW_PRIVATE'],
    });
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

  // A shared bucket would put private publication bytes on the anonymous CDN origin.
  if (data.TAU_S3_PRIVATE_BUCKET === data.TAU_S3_BUCKET) {
    context.addIssue({
      code: 'custom',
      message: 'TAU_S3_PRIVATE_BUCKET must differ from TAU_S3_BUCKET in production',
      path: ['TAU_S3_PRIVATE_BUCKET'],
    });
  }

  try {
    const apiHost = new URL(data.TAU_API_URL).hostname;
    if (apiHost === 'localhost' || apiHost === '127.0.0.1') {
      context.addIssue({
        code: 'custom',
        message: 'TAU_API_URL must not target localhost in production',
        path: ['TAU_API_URL'],
      });
    }
  } catch {
    context.addIssue({
      code: 'custom',
      message: 'TAU_API_URL must be a valid URL',
      path: ['TAU_API_URL'],
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

  // A production API replica that keeps its login role can run DDL and edit
  // immutable evidence. This protection applies to cloud and self-host alike.
  if (!data.DATABASE_RUNTIME_ROLE) {
    context.addIssue({
      code: 'custom',
      message: 'DATABASE_RUNTIME_ROLE is required in production',
      path: ['DATABASE_RUNTIME_ROLE'],
    });
  }
  for (const key of githubRepositoryKeys) {
    if (!data[key]) {
      context.addIssue({ code: 'custom', message: `${key} is required in production`, path: [key] });
    }
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
