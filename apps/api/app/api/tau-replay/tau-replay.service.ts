import { Injectable } from '@nestjs/common';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Model } from '#api/models/model.schema.js';
import type { TauReplayModelProvider } from '#api/tau-replay/tau-replay.contract.js';
import { TauReplayChatModel } from '#api/tau-replay/tau-replay-chat-model.js';
import { cubeCylinderCutoutFixture } from '#api/tau-replay/fixtures/cube-cylinder-cutout.fixture.js';
import { planetaryGearCompositeFixture } from '#api/tau-replay/fixtures/planetary-gear-composite.fixture.js';
import { replayFixtureSchema } from '#api/tau-replay/replay-fixture.schema.js';
import type { ReplayFixture } from '#api/tau-replay/replay-fixture.schema.js';

export const tauReplayModelId = 'tau-replay';
export const tauReplayCompositeModelId = 'tau-replay-composite';

/**
 * The registered fixtures, validated at load so any drift between the fixture
 * and the tool input schemas (or the fixture schema) fails the boot loudly.
 */
const fixtures: Record<string, ReplayFixture> = {
  [tauReplayModelId]: replayFixtureSchema.parse(cubeCylinderCutoutFixture),
  [tauReplayCompositeModelId]: replayFixtureSchema.parse(planetaryGearCompositeFixture),
};

/**
 * Catalog row for the recorded replay model. Priced to mirror the source model
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

/** Synthetic multi-file replay, priced and sized like its GPT-5.6 Luna source. */
export const tauReplayCompositeModel: Model = {
  ...tauReplayModel,
  id: tauReplayCompositeModelId,
  name: 'Tau Replay (composite)',
  slug: tauReplayCompositeModelId,
  description:
    'Deterministic replay model for a multi-file JSCAD planetary gear and dual compilation-unit verification.',
  model: tauReplayCompositeModelId,
  details: {
    ...tauReplayModel.details,
    maxTokens: 128_000,
    knowledgeCutoff: '2026-02',
    cost: { inputTokens: 0.2, outputTokens: 1.2, cacheReadTokens: 0.02, cacheWriteTokens: 0.25 },
  },
};

/**
 * Implements the {@link TauReplayModelProvider} seam: surfaces the `tau` catalog
 * row(s) and constructs the replay chat model. Provided only by `TauReplayModule`
 * (loaded when `TAU_TEST_MODE=true`), so it is absent from the prod DI graph.
 */
@Injectable()
export class TauReplayService implements TauReplayModelProvider {
  public listModels(): Model[] {
    return [tauReplayModel, tauReplayCompositeModel];
  }

  public createModel(modelId: string): BaseChatModel {
    const fixture = fixtures[modelId];
    if (fixture === undefined) {
      throw new Error(`No tau replay fixture registered for model "${modelId}"`);
    }
    return new TauReplayChatModel(fixture, modelId);
  }
}
