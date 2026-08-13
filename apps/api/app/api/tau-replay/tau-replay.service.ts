import { Injectable } from '@nestjs/common';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Model } from '#api/models/model.schema.js';
import type { TauReplayModelProvider } from '#api/tau-replay/tau-replay.contract.js';
import { TauReplayChatModel } from '#api/tau-replay/tau-replay-chat-model.js';
import { cubeCylinderCutoutFixture } from '#api/tau-replay/fixtures/cube-cylinder-cutout.fixture.js';
import { replayFixtureSchema } from '#api/tau-replay/replay-fixture.schema.js';
import type { ReplayFixture } from '#api/tau-replay/replay-fixture.schema.js';

const tauReplayModelId = 'tau-replay';

/**
 * The registered fixtures, validated at load so any drift between the fixture
 * and the tool input schemas (or the fixture schema) fails the boot loudly.
 * One model for now (OQ2): `tau-replay` → the cube-cutout fixture.
 */
const fixtures: Record<string, ReplayFixture> = {
  [tauReplayModelId]: replayFixtureSchema.parse(cubeCylinderCutoutFixture),
};

/**
 * Catalog row for the single replay model. Priced to mirror the source model
 * (google-gemini-3.5-flash, per-million tokens) so the recorded token usage
 * meters realistically against the real credit ledger (R6/OQ5).
 */
export const tauReplayModel: Model = {
  id: tauReplayModelId,
  name: 'Tau Replay (test)',
  slug: tauReplayModelId,
  description:
    'Deterministic replay model for TAU_TEST_MODE — replays a recorded transcript without calling a real provider.',
  // Shown in the compact Models list by default so it needs no manual "View All" toggle when TAU_TEST_MODE is on.
  recommended: true,
  model: tauReplayModelId,
  provider: { id: 'tau', name: 'Tau' },
  details: {
    family: 'tau',
    families: ['tau'],
    contextWindow: 200_000,
    maxTokens: 64_000,
    cost: { inputTokens: 1.5, outputTokens: 9, cacheReadTokens: 0.15, cacheWriteTokens: 0 },
  },
  configuration: { streaming: true, temperature: 0 },
  support: { tools: true, toolChoice: true, modalities: { input: ['text', 'image'], output: ['text'] } },
};

/**
 * Implements the {@link TauReplayModelProvider} seam: surfaces the `tau` catalog
 * row(s) and constructs the replay chat model. Provided only by `TauReplayModule`
 * (loaded when `TAU_TEST_MODE=true`), so it is absent from the prod DI graph.
 */
@Injectable()
export class TauReplayService implements TauReplayModelProvider {
  public listModels(): Model[] {
    return [tauReplayModel];
  }

  public createModel(modelId: string): BaseChatModel {
    const fixture = fixtures[modelId];
    if (fixture === undefined) {
      throw new Error(`No tau replay fixture registered for model "${modelId}"`);
    }
    return new TauReplayChatModel(fixture);
  }
}
