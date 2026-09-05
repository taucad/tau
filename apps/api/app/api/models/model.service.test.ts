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
  'anthropic-claude-fable-5.1',
  'anthropic-claude-fable-5',
  'anthropic-claude-opus-5',
  'anthropic-claude-opus-4.8',
  'anthropic-claude-sonnet-5',
  'openai-gpt-6-astra',
  'openai-gpt-5.6-sol',
  'openai-gpt-5.6-terra',
  'openai-gpt-5.6-luna',
  'openai-gpt-5.5',
  'google-gemini-3.1-pro',
  'google-gemini-3.7-flash',
  'google-gemini-3.5-flash-lite',
  'google-gemini-3.5-flash',
  'together-glm-5.1',
  'together-glm-5.2',
  'together-kimi-k3',
  'together-qwen-3.5-397b',
  'together-llama-4-maverick',
  'morph-qwen-3.5-397b',
  'morph-deepseek-v4-flash',
  'xai-grok-4.6',
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
  it('marks every cloud catalog entry as explicitly Tau-hosted', () => {
    for (const model of getCloudCatalogEntries()) {
      expect(model.providerKind, model.id).toBe('tau-hosted');
    }
  });

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
    expect(modelList.anthropic['claude-4.8-opus']?.recommended).toBe(false);
  });

  it('recommends Fable 5.1 while retaining Fable 5', async () => {
    const service = createModelService();
    const listedModels = await service.getModels();
    const fable51 = listedModels.find((model) => model.id === 'anthropic-claude-fable-5.1');

    expect(fable51).toMatchObject({
      recommended: true,
      model: 'claude-fable-5-1',
      provider: { id: 'anthropic', name: 'Anthropic' },
      support: {
        toolChoice: false,
        modalities: { input: ['text', 'image'], output: ['text'] },
      },
      details: {
        family: 'claude',
        contextWindow: maxEffectiveContextWindow,
        maxTokens: 128_000,
        knowledgeCutoff: '2026-06',
        cost: { inputTokens: 10, outputTokens: 50, cacheReadTokens: 0.25, cacheWriteTokens: 12.5 },
      },
      configuration: {
        streaming: true,
        maxTokens: 120_000,
        thinking: { type: 'adaptive', display: 'summarized' },
        outputConfig: { effort: 'high' },
      },
    });
    expect(fable51?.configuration).toHaveProperty('max_tokens', 120_000);
    expect(modelList.anthropic['claude-fable-5']?.recommended).toBe(false);
  });

  it('lists every GPT-5.6 tier and keeps GPT-5.5 non-recommended', async () => {
    const service = createModelService();
    const listedModels = await service.getModels();
    const gpt56ModelIds = ['openai-gpt-5.6-sol', 'openai-gpt-5.6-terra', 'openai-gpt-5.6-luna'];
    const listedModelIds = listedModels.map((model) => model.id);

    expect(service.models.map((model) => model.id)).toEqual(expect.arrayContaining(gpt56ModelIds));
    expect(listedModelIds).toEqual(expect.arrayContaining([...gpt56ModelIds, 'openai-gpt-5.5']));
    expect(modelList.openai['gpt-5.5']?.recommended).toBe(false);
  });

  it('lists GPT-6 Astra as a recommended OpenAI model', async () => {
    const service = createModelService();
    const listedModels = await service.getModels();
    const listedModelIds = listedModels.map((model) => model.id);

    expect(listedModelIds).toContain('openai-gpt-6-astra');
    expect(modelList.openai['gpt-6-astra']?.recommended).toBe(true);
  });

  it('recommends Gemini 3.7 Flash instead of the Gemini 3.5 models', async () => {
    const service = createModelService();
    const listedModels = await service.getModels();
    const listedModelIds = listedModels.map((model) => model.id);
    const newModelIds = ['google-gemini-3.7-flash', 'google-gemini-3.5-flash-lite'];

    expect(listedModelIds).toEqual(expect.arrayContaining([...newModelIds, 'google-gemini-3.5-flash']));
    expect(modelList.vertexai['gemini-3.7-flash']?.recommended).toBe(true);
    expect(modelList.vertexai['gemini-3.5-flash-lite']?.recommended).toBe(false);
    expect(modelList.vertexai['gemini-3.5-flash']?.recommended).toBe(false);
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

  it('lists Grok 4.6 as the recommended image-capable xAI model', async () => {
    const service = createModelService();
    const listedModels = await service.getModels();
    const grok = listedModels.find((model) => model.id === 'xai-grok-4.6');

    expect(grok).toMatchObject({
      recommended: true,
      model: 'grok-4.6',
      provider: { id: 'xai', name: 'xAI' },
      support: {
        tools: true,
        toolChoice: false,
        modalities: { input: ['text', 'image'], output: ['text'] },
      },
      details: {
        family: 'grok',
        contextWindow: maxEffectiveContextWindow,
        maxTokens: 64_000,
        knowledgeCutoff: '2026-02',
        cost: { inputTokens: 2, outputTokens: 6, cacheReadTokens: 0.5, cacheWriteTokens: 0 },
      },
      configuration: {
        streaming: true,
        maxOutputTokens: 64_000,
        reasoning: { effort: 'high', summary: 'auto' },
      },
    });
  });

  it('lists Together Kimi K3 while retaining Moonshot as a hidden fallback', async () => {
    const service = createModelService();
    const listedModels = await service.getModels();
    const kimi = service.models.find((model) => model.id === 'together-kimi-k3');
    const moonshotKimi = service.models.find((model) => model.id === 'moonshot-kimi-k3');
    const listedModelIds = listedModels.map((model) => model.id);

    expect(kimi).toMatchObject({
      recommended: true,
      model: 'moonshotai/Kimi-K3',
      provider: { id: 'together', name: 'Together AI' },
      support: {
        tools: true,
        toolChoice: false,
        modalities: { input: ['text', 'image'], output: ['text'] },
      },
      details: {
        family: 'kimi',
        contextWindow: maxEffectiveContextWindow,
        maxTokens: 200_000,
        cost: { inputTokens: 3, outputTokens: 15, cacheReadTokens: 0.3, cacheWriteTokens: 0 },
      },
      configuration: { streaming: true },
    });
    expect(kimi?.configuration).not.toHaveProperty('maxTokens');
    expect(kimi?.configuration).not.toHaveProperty('maxOutputTokens');
    expect(kimi?.configuration).not.toHaveProperty('reasoning');
    expect(listedModelIds).toContain('together-kimi-k3');
    expect(moonshotKimi).toMatchObject({
      recommended: false,
      model: 'kimi-k3',
      provider: { id: 'moonshot' },
      details: { contextWindow: maxEffectiveContextWindow },
    });
    expect(listedModelIds).not.toContain('moonshot-kimi-k3');
    expect(service.getContextWindow('together-kimi-k3')).toBe(maxEffectiveContextWindow);
    expect(service.getContextWindow('moonshot-kimi-k3')).toBe(maxEffectiveContextWindow);
  });

  it('subtracts Together cache hits from inclusive prompt tokens exactly once', async () => {
    const configService = {
      get: vi.fn((key: string) => (key === 'TOGETHER_API_KEY' ? 'sk-test-together' : false)),
    } satisfies Pick<ConfigService<Environment>, 'get'>;
    const service = new ModelService(
      new ProviderService(configService as unknown as ConfigService<Environment, true>),
      configService as unknown as ConfigService<Environment>,
    );
    await service.getModels();

    expect(
      service.normalizeUsageTokens('together-kimi-k3', {
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
