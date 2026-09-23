import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line no-restricted-imports -- type-only: the catalog row's shape, which the models hook owns
import type { Model } from '#hooks/use-models.js';
import {
  admittedReasoning,
  clampEffort,
  effectiveEffort,
  modelReasoning,
  offeredReasoningLevels,
} from '#utils/model-reasoning.js';

type Fixture = { readonly provider: Model['provider']['id'] } & Pick<Model, 'configuration'> &
  Partial<Pick<Model, 'support'>>;

/** A catalog row reduced to what reasoning reads. */
const model = ({ provider, configuration, support }: Fixture): Model => ({
  id: `${provider}-fixture`,
  providerKind: 'tau-hosted',
  name: 'Fixture',
  slug: 'fixture',
  model: 'fixture',
  provider: { id: provider, name: provider },
  details: {
    family: 'claude',
    families: ['claude'],
    contextWindow: 200_000,
    maxTokens: 64_000,
    cost: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
  },
  configuration,
  ...(support === undefined ? {} : { support }),
});

const fable = model({
  provider: 'anthropic',
  configuration: {
    streaming: true,
    thinking: { type: 'adaptive', display: 'summarized' },
    outputConfig: { effort: 'high' },
  },
  support: { reasoning: { levels: ['low', 'medium', 'high', 'xhigh'] } },
});
const haiku = model({
  provider: 'anthropic',
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Anthropic wire key
  configuration: { streaming: true, thinking: { type: 'enabled', budget_tokens: 4000 } },
});
const gemini = model({
  provider: 'vertexai',
  configuration: { streaming: true, thinkingLevel: 'HIGH' },
  support: { reasoning: { levels: ['low', 'medium', 'high'] } },
});
const gpt = model({
  provider: 'openai',
  configuration: { streaming: true, reasoning: { effort: 'high', summary: 'auto' } },
  support: { reasoning: { levels: ['low', 'medium', 'high'] } },
});
const gptMini = model({ provider: 'openai', configuration: { streaming: true } });
const together = model({ provider: 'together', configuration: { streaming: true } });
/* Morph's rows carry an effort the completions codec never forwards, so the catalog offers no levels. */
const morph = model({ provider: 'morph', configuration: { streaming: true, reasoning: { effort: 'high' } } });

describe('modelReasoning', () => {
  it('should read each provider shape into the host reasoning config, as the admission did inline', () => {
    expect(modelReasoning(fable)).toEqual({ effort: 'high', display: 'summarized' });
    expect(modelReasoning(haiku)).toEqual({ budgetTokens: 4000 });
    expect(modelReasoning(gemini)).toEqual({ effort: 'high' });
    expect(modelReasoning(gpt)).toEqual({ effort: 'high', summary: 'auto' });
    expect(modelReasoning(gptMini)).toBeUndefined();
    expect(modelReasoning(undefined)).toBeUndefined();
  });

  it('should refuse a Vertex level outside the three its transport accepts', () => {
    expect(
      modelReasoning(
        model({
          provider: 'vertexai',
          configuration: { streaming: true, thinkingLevel: 'THINKING_LEVEL_UNSPECIFIED' },
        }),
      ),
    ).toBeUndefined();
  });
});

describe('offeredReasoningLevels', () => {
  it('should offer nothing for a fixed budget, a non-reasoning model, or a wire that sends no level', () => {
    expect(offeredReasoningLevels(haiku)).toEqual([]);
    expect(offeredReasoningLevels(gptMini)).toEqual([]);
    expect(offeredReasoningLevels(together)).toEqual([]);
    expect(offeredReasoningLevels(morph)).toEqual([]);
    expect(offeredReasoningLevels(undefined)).toEqual([]);
  });

  it('should offer exactly the levels the catalog row declares', () => {
    expect(offeredReasoningLevels(fable)).toEqual(['low', 'medium', 'high', 'xhigh']);
    expect(offeredReasoningLevels(gemini)).toEqual(['low', 'medium', 'high']);
  });
});

describe('clampEffort', () => {
  it('should carry a level the model offers unchanged', () => {
    expect(clampEffort(gemini, 'low')).toBe('low');
  });

  it('should step a level the model does not offer down to its highest below it', () => {
    expect(clampEffort(gemini, 'xhigh')).toBe('high');
    expect(clampEffort(gemini, 'max')).toBe('high');
  });

  it('should carry nothing onto a model with no levels, or when no level was chosen', () => {
    expect(clampEffort(haiku, 'low')).toBeUndefined();
    expect(clampEffort(fable, undefined)).toBeUndefined();
  });
});

describe('effectiveEffort', () => {
  it('should run the chosen level when offered and the catalog default otherwise', () => {
    expect(effectiveEffort(fable, 'low')).toBe('low');
    expect(effectiveEffort(fable, undefined)).toBe('high');
    expect(effectiveEffort(gemini, 'xhigh')).toBe('high');
    expect(effectiveEffort(haiku, 'low')).toBeUndefined();
  });
});

describe('admittedReasoning', () => {
  it('should admit the chosen level in place of the default and keep the rest of the config', () => {
    expect(admittedReasoning(fable, 'low')).toEqual({ effort: 'low', display: 'summarized' });
    expect(admittedReasoning(gpt, 'medium')).toEqual({ effort: 'medium', summary: 'auto' });
  });

  it('should admit the catalog default unchanged when the chat chose no level', () => {
    expect(admittedReasoning(fable, undefined)).toEqual({ effort: 'high', display: 'summarized' });
    expect(admittedReasoning(haiku, 'low')).toEqual({ budgetTokens: 4000 });
    expect(admittedReasoning(gptMini, 'low')).toBeUndefined();
  });

  it('should never admit a level the model refuses', () => {
    expect(admittedReasoning(gemini, 'xhigh')).toEqual({ effort: 'high' });
    // Morph's default is carried as before, but a chosen level cannot reach it.
    expect(admittedReasoning(morph, 'low')).toEqual({ effort: 'high' });
  });
});
