import { Module, Logger, VersioningType } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { ZodValidationPipe } from 'nestjs-zod';
import { MemorySaver } from '@langchain/langgraph-checkpoint';
import { fromMemoryFS } from '@taucad/kernels';
import { createRpcDispatcher } from '@taucad/chat/rpc';
import { getEnvironment } from '#config/environment.config.js';
import { ChatController } from '#api/chat/chat.controller.js';
import { ChatService } from '#api/chat/chat.service.js';
import { ChatRpcService } from '#api/chat/chat-rpc.service.js';
import { CheckpointerService } from '#api/chat/checkpointer.service.js';
import { ModelService } from '#api/models/model.service.js';
import { ProviderService } from '#api/providers/provider.service.js';
import { ToolService } from '#api/tools/tool.service.js';
import { FileEditService } from '#api/file-edit/file-edit.service.js';
import { GeometryAnalysisService } from '#api/analysis/geometry-analysis.service.js';
import { authInstanceKey } from '#constants/auth.constant.js';
import { HeadlessChatRpcService } from '#testing/headless-chat-rpc.service.js';
import { createHeadlessRpcFileSystem } from '#testing/headless-rpc-filesystem.js';
import { createHeadlessKernelClient } from '#testing/headless-kernel-client.js';

/**
 * In-memory checkpointer service that replaces the PostgreSQL-backed one.
 */
class MemoryCheckpointerService {
  private readonly saver = new MemorySaver();

  public getCheckpointer(): MemorySaver {
    return this.saver;
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
    CheckpointerService,
    { provide: authInstanceKey, useValue: mockAuthInstance },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
  ],
})
class TestChatModule {}

export type TestApp = {
  app: NestFastifyApplication;
  baseUrl: string;
  memFs: ReturnType<typeof fromMemoryFS>;
  headlessRpc: HeadlessChatRpcService;
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
export async function createTestApp(): Promise<TestApp> {
  const logger = new Logger('TestApp');

  const moduleRef = await Test.createTestingModule({
    imports: [TestChatModule],
  })
    .overrideProvider(ChatRpcService)
    .useClass(HeadlessChatRpcService)
    .overrideProvider(CheckpointerService)
    .useClass(MemoryCheckpointerService)
    .compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.enableVersioning({ type: VersioningType.URI });

  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  await app.listen(0);

  const address = app.getHttpServer().address();
  const port = typeof address === 'string' ? address : address?.port;
  const baseUrl = `http://localhost:${port}`;

  logger.log(`Test app listening on ${baseUrl}`);

  const memFs = fromMemoryFS();
  const headlessRpc: HeadlessChatRpcService = moduleRef.get(ChatRpcService);

  const dispatcher = createRpcDispatcher({
    fileSystem: createHeadlessRpcFileSystem(memFs),
    kernelClient: createHeadlessKernelClient({ createGeometry: async () => ({ success: true, issues: [] }) }),
  });
  headlessRpc.setDispatcher(dispatcher);

  return { app, baseUrl, memFs, headlessRpc };
}
