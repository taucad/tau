import { describe, expect, it } from 'vitest';
import { TauReplayChatModel } from '#api/tau-replay/tau-replay-chat-model.js';
import { TauReplayService, tauReplayCompositeModelId, tauReplayModelId } from '#api/tau-replay/tau-replay.service.js';

describe('TauReplayService', () => {
  const service = new TauReplayService();

  it('should expose exactly the two test-only replay models', () => {
    expect(service.listModels().map(({ id, name }) => ({ id, name }))).toEqual([
      { id: tauReplayModelId, name: 'Tau Replay (test)' },
      { id: tauReplayCompositeModelId, name: 'Tau Replay (composite)' },
    ]);
  });

  it.each([tauReplayModelId, tauReplayCompositeModelId])('should build the registered model %s', (modelId) => {
    expect(service.createModel(modelId)).toBeInstanceOf(TauReplayChatModel);
  });

  it('should reject an unknown replay model', () => {
    expect(() => service.createModel('tau-replay-missing')).toThrow(
      'No tau replay fixture registered for model "tau-replay-missing"',
    );
  });
});
