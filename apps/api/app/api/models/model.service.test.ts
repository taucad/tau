import { describe, expect, it, vi } from 'vitest';
import { modelSupportsInput } from '@taucad/chat';
import { toolName } from '@taucad/chat/constants';
import type { ConfigService } from '@nestjs/config';
import { modelList } from '#api/models/model.constants.js';
import { ModelService } from '#api/models/model.service.js';
import { ProviderService } from '#api/providers/provider.service.js';
import type { Environment } from '#config/environment.config.ts';

const maxEffectiveContextWindow = 200_000;

const cappedModelIds = [
  'anthropic-claude-fable-5',
  'anthropic-claude-opus-5',
  'anthropic-claude-opus-4.8',
  'anthropic-claude-sonnet-5',
  'openai-gpt-5.6-sol',
  'openai-gpt-5.6-terra',
  'openai-gpt-5.6-luna',
  'openai-gpt-5.5',
  'openai-gpt-5.3-codex',
  'openai-gpt-4.1',
  'google-gemini-3.1-pro',
  'google-gemini-3.6-flash',
  'google-gemini-3.5-flash-lite',
  'google-gemini-3.5-flash',
  'together-glm-5.1',
  'together-glm-5.2',
  'together-qwen-3.5-397b',
  'together-llama-4-maverick',
  'morph-qwen-3.5-397b',
  'morph-deepseek-v4-flash',
  'xai-grok-4.5',
  'moonshot-kimi-k3',
] as const;

const getCloudCatalogEntries = () => Object.values(modelList).flatMap((modelsBySlug) => Object.values(modelsBySlug));

const createModelService = () => {
  const providerService = {} satisfies Partial<ProviderService>;
  const configService = {
    get: vi.fn().mockReturnValue(false),
  } satisfies Pick<ConfigService<Environment>, 'get'>;

  return new ModelService(
    providerService as unknown as ProviderService,
    configService as unknown as ConfigService<Environment>,
  );
};

describe('modelList', () => {
  it('caps every cloud catalog effective context window at 200K tokens', () => {
    for (const model of getCloudCatalogEntries()) {
      expect(model.details.contextWindow, model.id).toBeLessThanOrEqual(maxEffectiveContextWindow);
    }
  });

  it('declares input and output modalities for every cloud catalog entry', () => {
    for (const model of getCloudCatalogEntries()) {
      expect(model.support?.modalities?.input.length, model.id).toBeGreaterThan(0);
      expect(model.support?.modalities?.output.length, model.id).toBeGreaterThan(0);
    }
  });
});

describe('ModelService', () => {
  it('returns the 200K effective context window for all capped model IDs', async () => {
    const service = createModelService();
    await service.getModels();

    for (const modelId of cappedModelIds) {
      expect(service.getContextWindow(modelId), modelId).toBe(maxEffectiveContextWindow);
    }
  });

  it('recommends Opus 5 instead of Opus 4.8', async () => {
    const service = createModelService();
    const listedModels = await service.getModels();
    const opus5 = listedModels.find((model) => model.id === 'anthropic-claude-opus-5');

    expect(opus5).toMatchObject({
      recommended: true,
      model: 'claude-opus-5',
      provider: { id: 'anthropic', name: 'Anthropic' },
      support: {
        toolChoice: false,
        modalities: { input: ['text', 'image'], output: ['text'] },
      },
      details: {
        family: 'claude',
        contextWindow: maxEffectiveContextWindow,
        maxTokens: 128_000,
        knowledgeCutoff: '2026-05',
        cost: { inputTokens: 5, outputTokens: 25, cacheReadTokens: 0.5, cacheWriteTokens: 6.25 },
      },
      configuration: {
        streaming: true,
        maxTokens: 120_000,
        thinking: { type: 'adaptive', display: 'summarized' },
        outputConfig: { effort: 'high' },
      },
    });
    expect(opus5?.configuration).toHaveProperty('max_tokens', 120_000);
    expect(modelList.anthropic['claude-4.8-opus'].recommended).toBe(false);
  });

  it('lists every GPT-5.6 tier and keeps GPT-5.5 non-recommended', async () => {
    const service = createModelService();
    const listedModels = await service.getModels();
    const gpt56ModelIds = ['openai-gpt-5.6-sol', 'openai-gpt-5.6-terra', 'openai-gpt-5.6-luna'];
    const listedModelIds = listedModels.map((model) => model.id);

    expect(service.models.map((model) => model.id)).toEqual(expect.arrayContaining(gpt56ModelIds));
    expect(listedModelIds).toEqual(expect.arrayContaining([...gpt56ModelIds, 'openai-gpt-5.5']));
    expect(modelList.openai['gpt-5.5'].recommended).toBe(false);
  });

  it('recommends the new Gemini Flash models instead of Gemini 3.5 Flash', async () => {
    const service = createModelService();
    const listedModels = await service.getModels();
    const listedModelIds = listedModels.map((model) => model.id);
    const newModelIds = ['google-gemini-3.6-flash', 'google-gemini-3.5-flash-lite'];

    expect(listedModelIds).toEqual(expect.arrayContaining([...newModelIds, 'google-gemini-3.5-flash']));
    expect(modelList.vertexai['gemini-3.6-flash'].recommended).toBe(true);
    expect(modelList.vertexai['gemini-3.5-flash-lite'].recommended).toBe(true);
    expect(modelList.vertexai['gemini-3.5-flash'].recommended).toBe(false);
  });

  it('lists GLM-5.2 as an enabled text-only tool-capable model', async () => {
    const service = createModelService();
    const models = await service.getModels();
    const glm = models.find((model) => model.id === 'together-glm-5.2');

    expect(glm).toBeDefined();
    expect(glm?.support?.tools).toBe(true);
    expect(modelSupportsInput(glm?.support, 'text')).toBe(true);
    expect(modelSupportsInput(glm?.support, 'image')).toBe(false);
  });

  it('lists Grok 4.5 as an enabled image-capable tool-capable model', async () => {
    const service = createModelService();
    const listedModels = await service.getModels();
    const grok = listedModels.find((model) => model.id === 'xai-grok-4.5');

    expect(grok).toBeDefined();
    expect(grok?.support?.tools).toBe(true);
    expect(modelSupportsInput(grok?.support, 'text')).toBe(true);
    expect(modelSupportsInput(grok?.support, 'image')).toBe(true);
    expect(service.getContextWindow('xai-grok-4.5')).toBe(maxEffectiveContextWindow);
    expect(service.getProviderId('xai-grok-4.5')).toBe('xai');
    expect(service.getModelSupport('xai-grok-4.5')).toMatchObject({
      tools: true,
      toolChoice: false,
      modalities: { input: ['text', 'image'], output: ['text'] },
    });
  });

  it('lists Kimi K3 as a recommended image-capable tool model with its complete catalog contract', async () => {
    const service = createModelService();
    const listedModels = await service.getModels();
    const kimi = listedModels.find((model) => model.id === 'moonshot-kimi-k3');

    expect(kimi).toMatchObject({
      recommended: true,
      model: 'kimi-k3',
      provider: { id: 'moonshot', name: 'Moonshot AI' },
      support: {
        tools: true,
        toolChoice: false,
        modalities: { input: ['text', 'image'], output: ['text'] },
      },
      details: {
        family: 'kimi',
        contextWindow: maxEffectiveContextWindow,
        maxTokens: 1_048_576,
        cost: { inputTokens: 3, outputTokens: 15, cacheReadTokens: 0.3, cacheWriteTokens: 0 },
      },
      configuration: { streaming: true, reasoning: { effort: 'high' } },
    });
    expect(kimi?.configuration).not.toHaveProperty('maxTokens');
    expect(kimi?.configuration).not.toHaveProperty('maxOutputTokens');
  });

  it('subtracts Moonshot cache hits from inclusive prompt tokens exactly once', async () => {
    const configService = {
      get: vi.fn((key: string) => (key === 'MOONSHOT_API_KEY' ? 'sk-test-moonshot' : false)),
    } satisfies Pick<ConfigService<Environment>, 'get'>;
    const service = new ModelService(
      new ProviderService(configService as unknown as ConfigService<Environment, true>),
      configService as unknown as ConfigService<Environment>,
    );
    await service.getModels();

    expect(
      service.normalizeUsageTokens('moonshot-kimi-k3', {
        inputTokens: 100,
        outputTokens: 20,
        reasoningTokens: 10,
        cacheReadTokens: 60,
        cacheWriteTokens: 0,
      }),
    ).toEqual({
      inputTokens: 40,
      outputTokens: 20,
      reasoningTokens: 10,
      cacheReadTokens: 60,
      cacheWriteTokens: 0,
    });
  });

  it('filters screenshot from GLM-5.2 while preserving text-only spatial tools', async () => {
    const service = createModelService();
    await service.getModels();

    expect(
      service.filterProviderToolNamesForModel({
        modelId: 'together-glm-5.2',
        toolNames: [toolName.screenshot, toolName.testModel, toolName.getKernelResult, toolName.exportGeometry],
      }),
    ).toEqual([toolName.testModel, toolName.getKernelResult, toolName.exportGeometry]);
  });
});
