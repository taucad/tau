import type { RpcGeoSpecClient, RpcImageClient } from '@taucad/chat/rpc';
import type { ModelSupport } from '#api/models/model.schema.js';
import { createTestModel } from '#testing/create-test-app.js';
import type { CreateTestAppOptions, TestApp } from '#testing/create-test-app.js';
import { buildCadAgent } from '#testing/skip-helpers.js';
import { TauReplayChatModel } from '#api/tau-replay/tau-replay-chat-model.js';
import { cubeCylinderCutoutFixture } from '#api/tau-replay/fixtures/cube-cylinder-cutout.fixture.js';

/** Shared setup for the hermetic tau-replay integration tests. */
export const tauReplayModelId = 'tau-replay';

/** A ModelService stub returning the deterministic replay model. */
export const buildTauReplayModelService = (): NonNullable<CreateTestAppOptions['modelService']> => {
  const support: ModelSupport = {
    tools: true,
    toolChoice: true,
    modalities: { input: ['text', 'image'], output: ['text'] },
  };
  const replayModel = createTestModel({ id: tauReplayModelId, providerId: 'tau', family: 'tau' });
  // Base is typed as the stub contract so the method signatures are contextually checked.
  const base: NonNullable<CreateTestAppOptions['modelService']> = {
    models: [replayModel],
    buildModel() {
      return { model: new TauReplayChatModel(cubeCylinderCutoutFixture), support };
    },
    getProviderId() {
      return 'tau';
    },
    createProviderDiagnosticsContext(options) {
      return {
        ...options,
        verbose: false,
        nextProviderAttemptId: () => 1,
        setLatestModelCallSummary: () => undefined,
        getLatestModelCallSummary: () => undefined,
      };
    },
    getContextWindow() {
      return 200_000;
    },
    normalizeUsageTokens(_modelId, usage) {
      return usage;
    },
    // Priced off the same catalog row the credit pipeline meters against, so the
    // streamed `data-usage` cost cannot silently diverge from what is debited.
    getModelCost(_modelId, usage) {
      const { cost } = replayModel.details;
      const inputTokensCost = (usage.inputTokens * cost.inputTokens) / 1_000_000;
      const outputTokensCost = (usage.outputTokens * cost.outputTokens) / 1_000_000;
      const cacheReadTokensCost = (usage.cacheReadTokens * cost.cacheReadTokens) / 1_000_000;
      const cacheWriteTokensCost = (usage.cacheWriteTokens * cost.cacheWriteTokens) / 1_000_000;
      return {
        inputTokensCost,
        outputTokensCost,
        cacheReadTokensCost,
        cacheWriteTokensCost,
        totalCost: inputTokensCost + outputTokensCost + cacheReadTokensCost + cacheWriteTokensCost,
      };
    },
    getKnowledgeCutoff() {
      return '2026-01';
    },
    getModelSupport() {
      return support;
    },
    filterProviderToolNamesForModel({ toolNames }) {
      return [...toolNames];
    },
    getOtelProviderName() {
      return 'tau';
    },
  };
  return base;
};

export const geospecStub: RpcGeoSpecClient = {
  async runTests() {
    return { success: true, failures: [], passes: [], passed: 1, total: 1 };
  },
};

/** Deterministic headless screenshot client for replayed visual-inspection calls. */
export const imagesStub: RpcImageClient = {
  async captureImages() {
    return { success: true, images: [{ view: 'isometric', dataUrl: 'data:image/png;base64,' }] };
  },
};

/** Seed the initial (empty) project the recorded chat started from. Paths are project-root-absolute. */
export const seedCubeProject = async (testApp: TestApp): Promise<void> => {
  await testApp.memFs.writeFile('/tau.json', JSON.stringify({ name: 'Cube Cylinder Cutout' }));
  await testApp.memFs.writeFile('/package.json', '{ "type": "module" }\n');
  await testApp.memFs.writeFile('/main.scad', '');
};

export const postCubeChat = async (testApp: TestApp, chatId: string): Promise<Response> =>
  fetch(`${testApp.baseUrl}/v1/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: chatId,
      messages: [
        { id: `${chatId}_user`, role: 'user', parts: [{ type: 'text', text: 'a cube with a cylinder cutout' }] },
      ],
      agent: buildCadAgent(tauReplayModelId, 'openscad', { testingEnabled: true }),
    }),
  });
