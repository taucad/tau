/* oxlint-disable new-cap -- NestJS decorators are factories, not constructors. */
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Module, VersioningType } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Auth } from 'better-auth';
import { createAgentSession, createGatewayModelTransport, requestedMaxTokens } from '@taucad/agent-host';
import type {
  AgentSession,
  AgentSessionModel,
  CreateAgentSessionOptions,
  HostRunSnapshot,
  HostToolInvocation,
  HostToolResult,
  ModelTransport,
  ToolRegistry,
} from '@taucad/agent-host';
import { createChatToolRegistry } from '@taucad/agent-tools/registry';
import type { ChatToolRegistryOptions } from '@taucad/agent-tools/registry';
import { getCadSystemPrompt } from '@taucad/chat/prompts';
import type { KernelId } from '@taucad/types/constants';
import { authInstanceKey } from '#constants/auth.constant.js';
import { httpBodyLimit } from '#constants/http-body.constant.js';
import { getEnvironment } from '#config/environment.config.js';
import { HostsService } from '#api/hosts/hosts.service.js';
import { LlmGatewayController } from '#api/llm/llm-gateway.controller.js';
import { LlmGatewayAuthGuard } from '#api/llm/llm-gateway.guard.js';
import { LlmGatewayService } from '#api/llm/llm-gateway.service.js';
import { ModelInvocationModule } from '#api/llm/model-invocation.module.js';
import { isModelListEntryEnabled, modelList } from '#api/models/model.constants.js';
import type { ModelListEntry } from '#api/models/model.constants.js';

/**
 * In-process live model gateway for provider suites.
 *
 * Boots the production `LlmGatewayController`/`LlmGatewayService` in self-host
 * (direct) mode on a loopback port with the real `ConfigService` reading
 * `apps/api/.env`, so a live test drives the whole browser path — the agent
 * host's `createGatewayModelTransport` through Tau's own gateway to the real
 * provider — without a database, Redis, a deployed API or a user bearer.
 */

/**
 * Catalog rows the gateway can route, indexed by their Tau model id.
 *
 * Built from the same `modelList` the gateway's own route table reads, so the
 * harness cannot resolve a row the gateway would refuse.
 */
const catalog = new Map<string, ModelListEntry>(
  Object.values(modelList)
    .flatMap((rows) => Object.values(rows))
    .filter((row) => isModelListEntryEnabled(row))
    .map((row) => [row.id, row]),
);

/** Provider credential each catalog provider needs before a live turn can run. */
const credentialByProvider: Partial<Record<ModelListEntry['provider']['id'], string>> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  vertexai: 'GOOGLE_VERTEX_AI_CREDENTIALS',
  xai: 'XAI_API_KEY',
  cerebras: 'CEREBRAS_API_KEY',
  moonshot: 'MOONSHOT_API_KEY',
  morph: 'MORPH_API_KEY',
  together: 'TOGETHER_API_KEY',
};

const row = (modelId: string): ModelListEntry => {
  const entry = catalog.get(modelId);
  if (!entry) {
    throw new Error(`Model ${modelId} is not an enabled Tau catalog row.`);
  }
  return entry;
};

/**
 * The environment variable one catalog row's provider needs.
 *
 * @param modelId - Tau catalog model id, such as `google-gemini-3.8-flash`.
 * @returns The credential's environment variable name.
 */
export const liveCredentialName = (modelId: string): string => {
  const providerId = row(modelId).provider.id;
  const name = credentialByProvider[providerId];
  if (!name) {
    throw new Error(`Provider ${providerId} has no live credential mapping.`);
  }
  return name;
};

/**
 * Whether this checkout can run a live turn on one catalog row.
 *
 * Suites gate on this with `describe.skipIf`, naming the variable in the title
 * so a skipped run says which credential is missing.
 *
 * @param modelId - Tau catalog model id.
 * @returns True when the row's provider credential is present.
 */
export const hasLiveCredential = (modelId: string): boolean =>
  (process.env[liveCredentialName(modelId)] ?? '').length > 0;

/**
 * Project a catalog row onto the session model the agent host runs a turn with.
 *
 * Derived exactly as the browser derives it in
 * `apps/ui/app/chat-clients/_internal/turn-body.ts`: the provider id is the
 * provider kind, and reasoning comes from the row's own configuration —
 * Anthropic's thinking budget or adaptive display, Vertex's thinking level, and
 * the OpenAI-shaped `reasoning` block for every other provider.
 *
 * @param modelId - Tau catalog model id.
 * @returns The `AgentSessionModel` for `createAgentSession`.
 */
export const liveSessionModel = (modelId: string): AgentSessionModel => {
  const entry = row(modelId);
  const { configuration, details } = entry;
  const reasoning = ((): AgentSessionModel['reasoning'] => {
    if (entry.provider.id === 'anthropic') {
      if (configuration.thinking?.type === 'enabled') {
        return { budgetTokens: configuration.thinking.budget_tokens };
      }
      if (configuration.thinking?.type === 'adaptive') {
        return {
          ...(configuration.outputConfig?.effort === undefined ? {} : { effort: configuration.outputConfig.effort }),
          ...(configuration.thinking.display === undefined ? {} : { display: configuration.thinking.display }),
        };
      }
      return undefined;
    }
    if (entry.provider.id === 'vertexai') {
      const effort = configuration.thinkingLevel?.toLowerCase();
      return effort === 'low' || effort === 'medium' || effort === 'high' ? { effort } : undefined;
    }
    return configuration.reasoning;
  })();
  return {
    id: entry.id,
    providerKind: entry.provider.id,
    contextWindow: details.contextWindow,
    maxTokens: details.maxTokens,
    cost: {
      input: details.cost.inputTokens,
      output: details.cost.outputTokens,
      cacheRead: details.cost.cacheReadTokens,
      cacheWrite: details.cost.cacheWriteTokens,
    },
    ...(reasoning === undefined ? {} : { reasoning }),
  };
};

/**
 * The completion ceiling a production turn asks for on one catalog row.
 *
 * Both live suites send this rather than a cheaper test-only number. A ceiling
 * is a limit, not a spend — the provider bills the tokens it actually generates
 * — so a lower one buys nothing and, on a reasoning row, can end the turn on
 * `length` with the whole budget spent on thinking and no answer at all. Cost
 * discipline in these suites belongs in the prompts, which ask for short
 * answers.
 *
 * @param modelId - Tau catalog model id.
 * @returns What `createAgentSession` would put on the provider request.
 */
export const liveCompletionCeiling = (modelId: string): number =>
  requestedMaxTokens(row(modelId).details.maxTokens, undefined);

/**
 * The real CAD system prompt a browser turn carries.
 *
 * @param options - Kernel, chat identity and the model row the prompt describes.
 * @returns The static and dynamic sections joined the way the browser joins them.
 */
export const liveCadSystemPrompt = (options: {
  readonly kernel?: KernelId;
  readonly chatId: string;
  readonly modelId: string;
  readonly testingEnabled?: boolean;
}): string => {
  const entry = row(options.modelId);
  const prompt = getCadSystemPrompt(options.kernel ?? 'replicad', 'agent', options.testingEnabled ?? false, {
    chatId: options.chatId,
    modelId: entry.id,
    contextWindow: entry.details.contextWindow,
    ...(entry.details.knowledgeCutoff === undefined ? {} : { knowledgeCutoff: entry.details.knowledgeCutoff }),
    supportsImageInput: entry.support?.modalities?.input.includes('image') ?? false,
  });
  return [prompt.static, prompt.dynamic].join('\n\n');
};

/**
 * The tool clients a listing-only registry needs to be non-`undefined`.
 *
 * `createChatToolRegistry` lists a tool only when its client is present, so the
 * full browser toolbelt needs every client. These are never dispatched: the
 * returned registry answers `invoke` from the caller's scripted results, so a
 * live suite chooses tool outcomes without standing up a CAD runtime.
 */
const listingOnlyClients = {
  fileSystemFor: () => ({}),
  recordFileSystemFor: () => ({}),
  kernelClient: {},
  graphics: {},
  images: {},
  geospec: {},
  skillResolver: {},
  revisions: {},
  parameters: {},
} as unknown as ChatToolRegistryOptions;

/**
 * The real Tau tool list the browser offers, answered by scripted results.
 *
 * @param options - Whether GeoSpec tools are offered, and the scripted result writer.
 * @returns A registry listing the production tool schemas.
 */
export const createLiveToolRegistry = (options: {
  readonly testingEnabled?: boolean;
  readonly results?: (invocation: HostToolInvocation) => HostToolResult | Promise<HostToolResult>;
}): ToolRegistry => {
  const listing = createChatToolRegistry({ ...listingOnlyClients, testingEnabled: options.testingEnabled ?? false });
  return {
    list: () => listing.list(),
    invoke: async (invocation) =>
      options.results?.(invocation) ?? {
        content: { errorCode: 'NO_SCRIPTED_RESULT', message: `No scripted result for ${invocation.toolName}.` },
        isError: true,
      },
  };
};

/** A booted in-process gateway and the credential its transport authenticates with. */
export type LiveGateway = {
  /** Loopback origin the transport's `baseUrl` takes, such as `http://127.0.0.1:53123`. */
  readonly baseUrl: string;
  /** Device credential the harness minted for this gateway. */
  readonly bearer: string;
  close(): Promise<void>;
};

/**
 * The gateway guard's session path needs a better-auth instance injected. The
 * harness holds no cookie jar, so this one reports no session and the guard
 * falls through to its device-credential path — the same path the desktop
 * launcher and a paired daemon authenticate on. The guard itself is production
 * code and runs unchanged.
 */
const sessionlessAuth = { api: { getSession: async () => null } } as unknown as Auth;

/**
 * Boot the production LLM gateway in self-host mode on a loopback port.
 *
 * Direct mode needs no database and no Redis, so only the gateway's own module
 * graph is composed: `ModelInvocationModule.forRoot({ tauCloudEnabled: false })`
 * over the real `ModelModule`, plus the real controller, service and auth guard.
 * `HostsService` is the one stub, because the production guard resolves a device
 * credential against PostgreSQL; the harness answers its own minted bearer and
 * nothing else.
 *
 * @param options - Optional principal id recorded as the calling user.
 * @returns The booted gateway's base URL, bearer and shutdown.
 */
export const startLiveGateway = async (options: { readonly principalId?: string } = {}): Promise<LiveGateway> => {
  const bearer = randomUUID();
  const principalId = options.principalId ?? `live-harness-${bearer.slice(0, 8)}`;

  @Module({
    imports: [
      ConfigModule.forRoot({ validate: () => getEnvironment(), isGlobal: true }),
      ModelInvocationModule.forRoot({ tauCloudEnabled: false }),
    ],
    controllers: [LlmGatewayController],
    providers: [
      LlmGatewayService,
      LlmGatewayAuthGuard,
      { provide: authInstanceKey, useValue: sessionlessAuth },
      {
        provide: HostsService,
        useValue: {
          authenticateDevice: async (authorization: string | undefined) =>
            authorization === `Bearer ${bearer}` ? { ownerId: principalId } : undefined,
        },
      },
    ],
  })
  class LiveGatewayModule {}

  const app = await NestFactory.create<NestFastifyApplication>(
    LiveGatewayModule,
    new FastifyAdapter({ bodyLimit: httpBodyLimit }),
    { logger: false },
  );
  app.enableVersioning({ type: VersioningType.URI });
  await app.listen(0, '127.0.0.1');
  return {
    baseUrl: await app.getUrl(),
    bearer,
    close: async () => app.close(),
  };
};

/**
 * The agent host's real browser transport, pointed at an in-process gateway.
 *
 * @param gateway - A gateway from {@link startLiveGateway}.
 * @returns The production gateway model transport.
 */
export const createLiveGatewayTransport = (gateway: LiveGateway): ModelTransport =>
  createGatewayModelTransport({ baseUrl: gateway.baseUrl, auth: () => gateway.bearer });

/**
 * Open a session on the in-process gateway.
 *
 * Thin over `createAgentSession`: it supplies the transport, so a suite names
 * only the chat, model and tools. Pass a second call the same `eventLog` file
 * to resume a chat — that is also how a provider switch replays one thread on a
 * different `model`.
 *
 * @param options - The gateway plus every `createAgentSession` option but the transport.
 * @returns The open session.
 */
export const createLiveSession = async (
  options: Omit<CreateAgentSessionOptions, 'modelTransport'> & { readonly gateway: LiveGateway },
): Promise<AgentSession> => {
  const { gateway, ...session } = options;
  return createAgentSession({ ...session, modelTransport: createLiveGatewayTransport(gateway) });
};

/** Milliseconds. Waited when a rate-limited refusal carried no `retry-after`. */
const defaultRetryDelay = 20_000;
/** Milliseconds. Upper bound on one honored `retry-after`, so a long hint cannot hang a suite. */
const maximumRetryDelay = 120_000;

/** @returns Milliseconds to wait before retrying, or `undefined` when this was not a rate limit. */
const rateLimitDelay = (snapshot: HostRunSnapshot): number | undefined => {
  const { failure } = snapshot;
  if (snapshot.state !== 'failed' || !failure || (failure.code !== 'RATE_LIMITED' && failure.status !== 429)) {
    return undefined;
  }
  const hinted = failure.details?.['retryAfterSeconds'];
  const hintedDelay = typeof hinted === 'number' && Number.isFinite(hinted) && hinted >= 0 ? hinted * 1000 : undefined;
  return Math.min(hintedDelay ?? defaultRetryDelay, maximumRetryDelay);
};

/**
 * Run one live turn, honoring an upstream rate-limit's `retry-after`.
 *
 * Vertex answered one RESOURCE_EXHAUSTED during a 16-call burst, so the matrix
 * runs serially and retries that refusal rather than reporting it as a defect.
 * A run is terminal once it fails, so `turn` must open its own session on each
 * attempt; every other outcome, including any other failure, is returned as-is
 * for the caller to assert.
 *
 * @param turn - Opens a session, prompts it and returns that run's snapshot.
 * @param options - Total attempts, including the first (default 3).
 * @returns The last snapshot produced.
 */
export const runWithRateLimitRetry = async (
  turn: () => Promise<HostRunSnapshot>,
  options: { readonly attempts?: number } = {},
): Promise<HostRunSnapshot> => {
  const attempts = Math.max(1, options.attempts ?? 3);
  let snapshot = await turn();
  for (let attempt = 1; attempt < attempts; attempt++) {
    const wait = rateLimitDelay(snapshot);
    if (wait === undefined) {
      return snapshot;
    }
    // oxlint-disable-next-line no-await-in-loop -- the retry exists precisely to serialize attempts against a rate limit
    await delay(wait);
    // oxlint-disable-next-line no-await-in-loop -- each attempt must observe the previous one's refusal
    snapshot = await turn();
  }
  return snapshot;
};
