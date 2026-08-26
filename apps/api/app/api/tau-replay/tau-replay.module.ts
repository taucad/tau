import { Global, Module } from '@nestjs/common';
import { TauReplayService } from '#api/tau-replay/tau-replay.service.js';
import { TAU_REPLAY_MODEL_PROVIDER } from '#api/tau-replay/tau-replay.contract.js';

/**
 * TAU_TEST_MODE-only module (registered conditionally in `ApiModule`). `@Global`
 * so `ProviderService`/`ModelService` — declared in always-loaded modules — can
 * resolve the {@link TAU_REPLAY_MODEL_PROVIDER} token via `@Optional()` when this
 * module is present, and see `undefined` (no `tau` provider) when it is not.
 */
// oxlint-disable-next-line new-cap -- NestJS decorators are invoked by decorator syntax.
@Global()
@Module({
  providers: [TauReplayService, { provide: TAU_REPLAY_MODEL_PROVIDER, useExisting: TauReplayService }],
  exports: [TauReplayService, TAU_REPLAY_MODEL_PROVIDER],
})
export class TauReplayModule {}
