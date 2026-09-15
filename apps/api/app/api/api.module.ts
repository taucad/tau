import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { HostsModule } from '#api/hosts/hosts.module.js';
import { ChatModule } from '#api/chat/chat.module.js';
import { CodeCompletionModule } from '#api/code-completion/code-completion.module.js';
import { GitModule } from '#api/git/git.module.js';
import { HealthModule } from '#api/health/health.module.js';
import { LlmModule } from '#api/llm/llm.module.js';
import { KernelsModule } from '#api/kernels/kernels.module.js';
import { ModelModule } from '#api/models/model.module.js';
import { PrivacyModule } from '#api/privacy/privacy.module.js';
import { ProjectsModule } from '#api/projects/projects.module.js';
import { ProviderModule } from '#api/providers/provider.module.js';
import { TestApiModule } from '#api/test-api/test-api.module.js';
import { TelemetryIngestModule } from '#api/telemetry/telemetry.module.js';
import { WebSocketModule } from '#api/websocket/websocket.module.js';
import { PublicationsModule } from '#api/publications/publications.module.js';
import { DurableEventsModule } from '#api/durable-events/durable-events.module.js';
import { JobsModule } from '#api/jobs/jobs.module.js';
import { RepositoriesModule } from '#api/repositories/repositories.module.js';
import { GithubModule } from '#api/github/github.module.js';
import { ModelInvocationModule } from '#api/llm/model-invocation.module.js';
import { CommercialEntitlementsModule } from '#api/entitlements/commercial-entitlements.module.js';

@Module({})
export class ApiModule {
  public static forRoot(options: { readonly tauCloudEnabled: boolean }): DynamicModule {
    return {
      module: ApiModule,
      imports: [
        CommercialEntitlementsModule.forRoot(options),
        ModelInvocationModule.forRoot(options),
        WebSocketModule,
        HostsModule,
        ChatModule,
        CodeCompletionModule,
        DurableEventsModule,
        GitModule,
        GithubModule,
        HealthModule,
        JobsModule,
        KernelsModule.forRoot(options),
        LlmModule,
        ModelModule,
        PrivacyModule,
        ProjectsModule,
        ProviderModule,
        PublicationsModule,
        RepositoriesModule,
        TelemetryIngestModule,
        ...(import.meta.env.DEV ? [TestApiModule] : []),
      ],
    };
  }
}
