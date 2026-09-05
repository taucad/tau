import { Module } from '@nestjs/common';
import { HostsModule } from '#api/hosts/hosts.module.js';
import { BillingModule } from '#api/billing/billing.module.js';
import { ChatModule } from '#api/chat/chat.module.js';
import { CodeCompletionModule } from '#api/code-completion/code-completion.module.js';
import { HealthModule } from '#api/health/health.module.js';
import { LlmModule } from '#api/llm/llm.module.js';
import { KernelsModule } from '#api/kernels/kernels.module.js';
import { ModelModule } from '#api/models/model.module.js';
import { PrivacyModule } from '#api/privacy/privacy.module.js';
import { ProviderModule } from '#api/providers/provider.module.js';
import { TestApiModule } from '#api/test-api/test-api.module.js';
import { TelemetryIngestModule } from '#api/telemetry/telemetry.module.js';
import { WebSocketModule } from '#api/websocket/websocket.module.js';
import { PublicationsModule } from '#api/publications/publications.module.js';
import { DurableEventsModule } from '#api/durable-events/durable-events.module.js';
import { JobsModule } from '#api/jobs/jobs.module.js';
import { PaseoConnectorModule } from '#api/connectors/paseo/paseo-connector.module.js';
import { RepositoriesModule } from '#api/repositories/repositories.module.js';

@Module({
  imports: [
    // Shared infrastructure modules
    WebSocketModule,

    // Production modules
    HostsModule,
    BillingModule,
    ChatModule,
    CodeCompletionModule,
    DurableEventsModule,
    HealthModule,
    JobsModule,
    KernelsModule,
    LlmModule,
    ModelModule,
    PrivacyModule,
    ProviderModule,
    PublicationsModule,
    RepositoriesModule,
    PaseoConnectorModule,
    TelemetryIngestModule,

    // Testing modules
    ...(import.meta.env.DEV ? [TestApiModule] : []),
  ],
})
export class ApiModule {}
