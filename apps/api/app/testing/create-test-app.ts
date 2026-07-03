import { Module, Logger, VersioningType } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { ZodValidationPipe } from 'nestjs-zod';
import { MemorySaver } from '@langchain/langgraph-checkpoint';
import { InMemoryStore } from '@langchain/langgraph';
import { createRuntimeFileSystem } from '@taucad/runtime/filesystem';
// eslint-disable-next-line no-restricted-imports -- this is a test file.
import { getTestFileSystem } from '@taucad/runtime/testing';
import type { RuntimeFileSystemBase } from '@taucad/runtime';
import { createRpcDispatcher } from '@taucad/chat/rpc';
import type { RpcGeoSpecClient, RpcGraphicsClient } from '@taucad/chat/rpc';
import { getEnvironment } from '#config/environment.config.js';
import { ChatController } from '#api/chat/chat.controller.js';
import { ChatService } from '#api/chat/chat.service.js';
import { ChatRpcService } from '#api/chat/chat-rpc.service.js';
import { CheckpointerService } from '#api/chat/checkpointer.service.js';
import { StoreService } from '#api/chat/store.service.js';
import type { ReadDedupClearer } from '#api/chat/clear-recent-reads.js';
import { recentReadsRootNamespace } from '#api/chat/recent-reads-namespace.js';
import { ModelService } from '#api/models/model.service.js';
import { ProviderService } from '#api/providers/provider.service.js';
import { ToolService } from '#api/tools/tool.service.js';
import { FileEditService } from '#api/file-edit/file-edit.service.js';
import { GeometryAnalysisService } from '#api/analysis/geometry-analysis.service.js';
import { authInstanceKey } from '#constants/auth.constant.js';
import { MetricsService } from '#telemetry/metrics.js';
import { TracerService } from '#telemetry/tracer.service.js';
import { CompactionService } from '#api/chat/compaction.service.js';
import { TauRpcBackendFactory } from '#api/chat/tau-rpc-backend.js';
import { TokenBudgetService } from '#api/chat/token-budget.service.js';
import { HeadlessChatRpcService } from '#testing/headless-chat-rpc.service.js';
import { createHeadlessRpcFileSystem } from '#testing/headless-rpc-filesystem.js';
import { createHeadlessRuntimeClient } from '#testing/headless-runtime-client.js';
import { ProviderRequestRecorder } from '#api/chat/utils/provider-request-recorder.js';

/**
 * In-memory checkpointer service that replaces the PostgreSQL-backed one.
 */
class MemoryCheckpointerService {
  private readonly saver = new MemorySaver();

  public getCheckpointer(): MemorySaver {
    return this.saver;
  }
}

class ClearableInMemoryStore extends InMemoryStore implements ReadDedupClearer {
  public async clearChat(chatId: string): Promise<number> {
    const namespace = [...recentReadsRootNamespace, chatId];
    const items = await this.search(namespace);
    await Promise.all(items.map(async (item) => this.delete(item.namespace, item.key)));
    return items.length;
  }
}

/**
 * In-memory LangGraph store service that replaces the Redis-backed
 * {@link StoreService} during tests. Mirrors production by exposing normal
 * `BaseStore` operations separately from the read-dedup bulk clearer.
 */
class MemoryStoreService {
  private readonly store = new ClearableInMemoryStore();

  public getStore(): ClearableInMemoryStore {
    return this.store;
  }

  public getReadDedupClearer(): ReadDedupClearer {
    return this.store;
  }
}

/**
 * Mock Better Auth instance that always returns a valid test session.
 * Allows the real AuthGuard to resolve its dependencies and pass all requests.
 */
const mockAuthInstance = {
  api: {
    async getSession() {
      return {
        user: { id: 'test-user', name: 'Test User', email: 'test@test.com' },
        session: { id: 'test-session' },
      };
    },
  },
};

/**
 * Focused NestJS module for integration testing.
 * Includes only what's needed for the chat pipeline.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      validate: getEnvironment,
      isGlobal: true,
    }),
  ],
  controllers: [ChatController],
  providers: [
    ChatService,
    ChatRpcService,
    ModelService,
    ProviderService,
    ToolService,
    FileEditService,
    GeometryAnalysisService,
    MetricsService,
    TracerService,
    CheckpointerService,
    StoreService,
    CompactionService,
    TokenBudgetService,
    TauRpcBackendFactory,
    ProviderRequestRecorder,
    { provide: authInstanceKey, useValue: mockAuthInstance },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
  ],
})
class TestChatModule {}

export type TestApp = {
  app: NestFastifyApplication;
  baseUrl: string;
  checkpointer: MemorySaver;
  memFs: RuntimeFileSystemBase;
  headlessRpc: HeadlessChatRpcService;
  providerRequestRecorder: ProviderRequestRecorder;
};

/**
 * Optional overrides for {@link createTestApp}.
 *
 * - `graphicsStub`: replace the default (omitted) graphics client.
 * - `geospecStub`: replace the default (omitted) GeoSpec client. Used by
 *   agent-loop safeguards tests to inject deterministic `test_model` failures.
 * - `storeService`: replace the default in-memory store service. Used by
 *   compaction tests to exercise Redis-backed read-dedup clearing.
 */
export type CreateTestAppOptions = {
  graphicsStub?: RpcGraphicsClient;
  geospecStub?: RpcGeoSpecClient;
  storeService?: Pick<StoreService, 'getStore' | 'getReadDedupClearer'>;
  modelService?: Pick<
    ModelService,
    | 'buildModel'
    | 'createProviderDiagnosticsContext'
    | 'filterProviderToolNamesForModel'
    | 'getContextWindow'
    | 'getKnowledgeCutoff'
    | 'getModelSupport'
    | 'getModelCost'
    | 'getOtelProviderName'
    | 'getProviderId'
    | 'normalizeUsageTokens'
  >;
  compactionService?: Pick<CompactionService, 'compact'>;
};

/**
 * Create a minimal NestJS test application configured for integration testing.
 *
 * Overrides:
 * - ChatRpcService -> HeadlessChatRpcService (no Socket.IO)
 * - CheckpointerService -> MemoryCheckpointerService (no PostgreSQL)
 * - AuthGuard -> NoOpAuthGuard (no authentication)
 *
 * The test app uses real API keys from .env for model calls.
 */
export async function createTestApp(options: CreateTestAppOptions = {}): Promise<TestApp> {
  const logger = new Logger('TestApp');

  let builder = Test.createTestingModule({
    imports: [TestChatModule],
  })
    .overrideProvider(ChatRpcService)
    .useClass(HeadlessChatRpcService)
    .overrideProvider(CheckpointerService)
    .useClass(MemoryCheckpointerService);

  builder = options.storeService
    ? builder.overrideProvider(StoreService).useValue(options.storeService)
    : builder.overrideProvider(StoreService).useClass(MemoryStoreService);

  if (options.modelService) {
    builder = builder.overrideProvider(ModelService).useValue(options.modelService);
  }
  if (options.compactionService) {
    builder = builder.overrideProvider(CompactionService).useValue(options.compactionService);
  }

  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.enableVersioning({ type: VersioningType.URI });

  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  await app.listen(0);

  const address = app.getHttpServer().address();
  const port = typeof address === 'string' ? address : address?.port;
  const baseUrl = `http://localhost:${port}`;

  logger.log(`Test app listening on ${baseUrl}`);

  const memFs = getTestFileSystem();
  const checkpointer = moduleRef.get(CheckpointerService).getCheckpointer() as unknown as MemorySaver;
  const headlessRpc: HeadlessChatRpcService = moduleRef.get(ChatRpcService);
  const providerRequestRecorder = moduleRef.get(ProviderRequestRecorder);

  const dispatcher = createRpcDispatcher({
    fileSystem: createHeadlessRpcFileSystem(createRuntimeFileSystem(memFs)),
    kernelClient: createHeadlessRuntimeClient({ createGeometry: async () => ({ success: true, issues: [] }) }),
    ...(options.graphicsStub ? { graphics: options.graphicsStub } : {}),
    ...(options.geospecStub ? { geospec: options.geospecStub } : {}),
  });
  headlessRpc.setDispatcher(dispatcher);

  return { app, baseUrl, checkpointer, memFs, headlessRpc, providerRequestRecorder };
}
