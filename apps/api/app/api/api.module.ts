import process from 'node:process';
import { Module } from '@nestjs/common';
import { ChatModule } from '#api/chat/chat.module.js';
import { CodeCompletionModule } from '#api/code-completion/code-completion.module.js';
import { FileEditModule } from '#api/file-edit/file-edit.module.js';
import { HealthModule } from '#api/health/health.module.js';
import { KernelsModule } from '#api/kernels/kernels.module.js';
import { ModelModule } from '#api/models/model.module.js';
import { PrivacyModule } from '#api/privacy/privacy.module.js';
import { ProviderModule } from '#api/providers/provider.module.js';
import { TestApiModule } from '#api/test-api/test-api.module.js';
import { TauReplayModule } from '#api/tau-replay/tau-replay.module.js';
import { ToolModule } from '#api/tools/tool.module.js';
import { TelemetryIngestModule } from '#api/telemetry/telemetry.module.js';
import { WebSocketModule } from '#api/websocket/websocket.module.js';
import { PublicationsModule } from '#api/publications/publications.module.js';

@Module({
  imports: [
    // Shared infrastructure modules
    WebSocketModule,

    // Production modules
    ChatModule,
    CodeCompletionModule,
    FileEditModule,
    HealthModule,
    KernelsModule,
    ModelModule,
    PrivacyModule,
    ProviderModule,
    PublicationsModule,
    TelemetryIngestModule,
    ToolModule,

    // Testing modules
    // The replay provider is a runtime-flag gate (not build-time): loaded only
    // when TAU_TEST_MODE is set. Production is prevented by the environment.config
    // superRefine (boot fails if the flag is set with NODE_ENV=production), so the
    // module can never load in prod. Keeps prod clean of the fake model/fixtures.
    // `process.env` is typed as the coerced `Environment` (boolean), but at
    // module-evaluation time — before ConfigModule parses it — the raw value is
    // still the string from `.env`; `String(...)` reads it correctly either way.
    ...(String(process.env.TAU_TEST_MODE) === 'true' ? [TauReplayModule] : []),
    ...(import.meta.env.DEV ? [TestApiModule] : []),
  ],
})
export class ApiModule {}
