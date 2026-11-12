import type { Model, ModelModalities, ModelReasoningSupport, ProviderId } from '@taucad/chat/model-catalog';

// 'ollama' is runtime-discovered and never part of the static cloud catalog.
type CloudCatalogProviderId = Exclude<ProviderId, 'ollama'>;

const textOnlyModalities = { input: ['text'], output: ['text'] } satisfies ModelModalities;
const imageInputModalities = { input: ['text', 'image'], output: ['text'] } satisfies ModelModalities;
/**
 * Vision models whose codec can deliver a PDF. Anthropic and OpenAI rasterise
 * pages on their document parts. Vertex's OpenAI-compatible chat endpoint does
 * not accept a `file` part; the gateway rewrites it to an `image_url` PDF data
 * URI, the blob form that endpoint uses for any GenerateContent document type.
 * `pdf` never appears without `image`.
 */
const pdfInputModalities = { input: ['text', 'image', 'pdf'], output: ['text'] } satisfies ModelModalities;

/*
 * User-selectable reasoning levels, per row (`support.reasoning`). A row
 * declares levels only when its codec forwards an effort — Anthropic adaptive
 * thinking, the Responses wire (OpenAI, xAI) and Vertex's thinking level; the
 * OpenAI-compatible completions providers carry none, so they get no menu.
 * `xhigh` is Anthropic Sonnet 5.5 / Opus 4.7+ / Fable 5 and GPT-6 Astra;
 * Sonnet 5.5 also accepts `max`. Vertex refuses anything past `high`.
 */
const lowToHighReasoning = { levels: ['low', 'medium', 'high'] } satisfies ModelReasoningSupport;
const lowToExtraHighReasoning = { levels: ['low', 'medium', 'high', 'xhigh'] } satisfies ModelReasoningSupport;
/*
 * Two facts about how a provider treats a model's reasoning, each probed per model through the gateway, never
 * inferred from the provider. A client sends either form only for a row that declares it, so a client newer than the
 * API it talks to sends neither.
 *
 * `effortInTranscript`: the provider reads the level from the transcript (Anthropic's empty `system` message with
 * `output_config`, OpenAI's `configuration_update` item), so a level change appends to the prompt cache instead of
 * rewriting it. Refused by the provider on Fable 5, Opus 4.8, Sonnet 5, Sonnet 4.6 and GPT 5.5, and on xAI.
 *
 * `replayBinding`: the provider takes `thinking.block_binding`, which says what happens to a replayed thinking block
 * whose prefix changed. Every Anthropic row that thinks accepts it.
 */
const anthropicReplayBinding = { replayBinding: true } satisfies Partial<ModelReasoningSupport>;
const effortInTranscript = { effortInTranscript: true } satisfies Partial<ModelReasoningSupport>;

/** Catalog row; omit {@link ModelListEntry.enabled} or set `true` to expose via GET `/v1/models`. */
export type ModelListEntry = Model & { readonly enabled?: boolean };

export function modelListEntryToModel(entry: ModelListEntry): Model {
  const { enabled: _enabled, ...model } = entry;
  return model;
}

export function isModelListEntryEnabled(entry: ModelListEntry): boolean {
  return entry.enabled !== false;
}

/**
 * Refuse a catalog that names more than one default model. `default` is optional, so rows that omit it are not
 * defaults; a catalog with none leaves the client to fall back to its recommended row.
 *
 * @param models - The catalog rows.
 * @throws {Error} When more than one row sets `default: true`.
 */
export function assertSingleDefaultModel(models: ReadonlyArray<Pick<Model, 'id' | 'default'>>): void {
  const defaults = models.filter((model) => model.default === true).map((model) => model.id);
  if (defaults.length > 1) {
    throw new Error(`Only one model may be the default, but ${defaults.length} are: ${defaults.join(', ')}`);
  }
}

export const modelList: Record<CloudCatalogProviderId, Record<string, ModelListEntry>> = {
  anthropic: {
    'claude-fable-5.2': {
      enabled: true,
      id: 'anthropic-claude-fable-5.2',
      providerKind: 'tau-hosted',
      name: 'Fable 5.2',
      slug: 'claude-fable-5.2',
      recommended: true,
      description: "Anthropic's strongest model for demanding reasoning and long-horizon agentic CAD work.",
      provider: {
        id: 'anthropic',
        name: 'Anthropic',
      },
      model: 'claude-fable-5-2',
      support: {
        reasoning: { ...lowToExtraHighReasoning, ...anthropicReplayBinding, ...effortInTranscript },
        toolChoice: false,
        modalities: pdfInputModalities,
      },
      details: {
        family: 'claude',
        families: ['claude'],
        contextWindow: 200_000, // Provider supports 1M tokens; Tau caps effective chat budget for cost and compaction reliability.
        maxTokens: 128_000,
        knowledgeCutoff: '2026-06',
        cost: {
          inputTokens: 8,
          outputTokens: 40,
          cacheReadTokens: 0.2,
          cacheWriteTokens: 10,
        },
      },
      configuration: {
        streaming: true,
        maxTokens: 120_000,
        // @ts-expect-error: FIXME - some models use camelCase
        // eslint-disable-next-line @typescript-eslint/naming-convention -- some models use snake_case
        max_tokens: 120_000,
        thinking: {
          type: 'adaptive',
          display: 'summarized',
        },
        outputConfig: {
          effort: 'high',
        },
      },
    },
    'claude-fable-5.1': {
      enabled: true,
      id: 'anthropic-claude-fable-5.1',
      providerKind: 'tau-hosted',
      name: 'Fable 5.1',
      slug: 'claude-fable-5.1',
      recommended: false,
      description: 'Previous Fable release for demanding reasoning and long-horizon agentic CAD work.',
      provider: {
        id: 'anthropic',
        name: 'Anthropic',
      },
      model: 'claude-fable-5-1',
      support: {
        reasoning: { ...lowToExtraHighReasoning, ...anthropicReplayBinding, ...effortInTranscript },
        toolChoice: false,
        modalities: pdfInputModalities,
      },
      details: {
        family: 'claude',
        families: ['claude'],
        contextWindow: 200_000, // Provider supports 1M tokens; Tau caps effective chat budget for cost and compaction reliability.
        maxTokens: 128_000,
        knowledgeCutoff: '2026-06',
        cost: {
          inputTokens: 10,
          outputTokens: 50,
          cacheReadTokens: 0.25,
          cacheWriteTokens: 12.5,
        },
      },
      configuration: {
        streaming: true,
        maxTokens: 120_000,
        // @ts-expect-error: FIXME - some models use camelCase
        // eslint-disable-next-line @typescript-eslint/naming-convention -- some models use snake_case
        max_tokens: 120_000,
        thinking: {
          type: 'adaptive',
          display: 'summarized',
        },
        outputConfig: {
          effort: 'high',
        },
      },
    },
    'claude-fable-5': {
      enabled: true,
      id: 'anthropic-claude-fable-5',
      providerKind: 'tau-hosted',
      name: 'Fable 5',
      slug: 'claude-fable-5',
      recommended: false,
      description:
        "Anthropic's most capable widely released model for the hardest long-horizon agentic CAD design work.",
      provider: {
        id: 'anthropic',
        name: 'Anthropic',
      },
      model: 'claude-fable-5',
      support: {
        reasoning: { ...lowToExtraHighReasoning, ...anthropicReplayBinding },
        toolChoice: false,
        modalities: pdfInputModalities,
      },
      details: {
        family: 'claude',
        families: ['claude'],
        contextWindow: 200_000, // Provider supports larger windows; Tau caps effective chat budget for cost and compaction reliability.
        maxTokens: 128_000,
        knowledgeCutoff: '2026-01',
        cost: {
          inputTokens: 10,
          outputTokens: 50,
          cacheReadTokens: 1,
          cacheWriteTokens: 12.5,
        },
      },
      configuration: {
        streaming: true,
        maxTokens: 120_000,
        // @ts-expect-error: FIXME - some models use camelCase
        // eslint-disable-next-line @typescript-eslint/naming-convention -- some models use snake_case
        max_tokens: 120_000,
        thinking: {
          type: 'adaptive',
          display: 'summarized',
        },
        outputConfig: {
          effort: 'high',
        },
      },
    },
    'claude-opus-5.5': {
      id: 'anthropic-claude-opus-5.5',
      providerKind: 'tau-hosted',
      name: 'Opus 5.5',
      slug: 'claude-opus-5.5',
      recommended: true,
      default: true,
      description:
        'Most capable Opus model for long-horizon agentic CAD design, complex multi-part assemblies, and multi-file work.',
      provider: {
        id: 'anthropic',
        name: 'Anthropic',
      },
      model: 'claude-opus-5-5',
      support: {
        reasoning: { ...lowToExtraHighReasoning, ...anthropicReplayBinding, ...effortInTranscript },
        toolChoice: false,
        modalities: pdfInputModalities,
      },
      details: {
        family: 'claude',
        families: ['claude'],
        contextWindow: 200_000, // Provider supports 1M tokens; Tau caps effective chat budget for cost and compaction reliability.
        maxTokens: 128_000,
        knowledgeCutoff: '2026-06',
        cost: {
          inputTokens: 4,
          outputTokens: 20,
          cacheReadTokens: 0.2,
          cacheWriteTokens: 5,
        },
      },
      configuration: {
        streaming: true,
        maxTokens: 120_000,
        // @ts-expect-error: FIXME - some models use camelCase
        // eslint-disable-next-line @typescript-eslint/naming-convention -- some models use snake_case
        max_tokens: 120_000,
        thinking: {
          type: 'adaptive',
          display: 'summarized',
        },
        outputConfig: {
          effort: 'high',
        },
      },
    },
    'claude-opus-5': {
      id: 'anthropic-claude-opus-5',
      providerKind: 'tau-hosted',
      name: 'Opus 5',
      slug: 'claude-opus-5',
      recommended: false,
      description:
        'Strong Opus model for long-horizon agentic CAD design, complex multi-part assemblies, and multi-file work.',
      provider: {
        id: 'anthropic',
        name: 'Anthropic',
      },
      model: 'claude-opus-5',
      support: {
        reasoning: { ...lowToExtraHighReasoning, ...anthropicReplayBinding, ...effortInTranscript },
        toolChoice: false,
        modalities: pdfInputModalities,
      },
      details: {
        family: 'claude',
        families: ['claude'],
        contextWindow: 200_000, // Provider supports 1M tokens; Tau caps effective chat budget for cost and compaction reliability.
        maxTokens: 128_000,
        knowledgeCutoff: '2026-05',
        cost: {
          inputTokens: 5,
          outputTokens: 25,
          cacheReadTokens: 0.5,
          cacheWriteTokens: 6.25,
        },
      },
      configuration: {
        streaming: true,
        maxTokens: 120_000,
        // @ts-expect-error: FIXME - some models use camelCase
        // eslint-disable-next-line @typescript-eslint/naming-convention -- some models use snake_case
        max_tokens: 120_000,
        thinking: {
          type: 'adaptive',
          display: 'summarized',
        },
        outputConfig: {
          effort: 'high',
        },
      },
    },
    'claude-4.8-opus': {
      id: 'anthropic-claude-opus-4.8',
      providerKind: 'tau-hosted',
      name: 'Opus 4.8',
      slug: 'claude-opus-4.8',
      recommended: false,
      description:
        "Anthropic's most powerful long-context capable model with adaptive reasoning, great for designing complex multi-part assemblies.",
      provider: {
        id: 'anthropic',
        name: 'Anthropic',
      },
      model: 'claude-opus-4-8',
      support: {
        reasoning: { ...lowToExtraHighReasoning, ...anthropicReplayBinding },
        toolChoice: false,
        modalities: pdfInputModalities,
      },
      details: {
        family: 'claude',
        families: ['claude'],
        contextWindow: 200_000, // Provider supports larger windows; Tau caps effective chat budget for cost and compaction reliability.
        maxTokens: 128_000,
        knowledgeCutoff: '2026-01',
        cost: {
          inputTokens: 5,
          outputTokens: 25,
          cacheReadTokens: 0.5,
          cacheWriteTokens: 6.25,
        },
      },
      configuration: {
        streaming: true,
        maxTokens: 120_000,
        // @ts-expect-error: FIXME - some models use camelCase
        // eslint-disable-next-line @typescript-eslint/naming-convention -- some models use snake_case
        max_tokens: 120_000,
        thinking: {
          type: 'adaptive',
          display: 'summarized',
        },
        outputConfig: {
          effort: 'high',
        },
      },
    },
    'claude-sonnet-5.5': {
      id: 'anthropic-claude-sonnet-5.5',
      providerKind: 'tau-hosted',
      name: 'Sonnet 5.5',
      slug: 'claude-sonnet-5.5',
      recommended: true,
      description: 'Fast Claude model for everyday CAD design iterations and focused multi-file edits.',
      provider: {
        id: 'anthropic',
        name: 'Anthropic',
      },
      model: 'claude-sonnet-5-5',
      support: {
        reasoning: {
          levels: ['low', 'medium', 'high', 'xhigh', 'max'],
          ...anthropicReplayBinding,
          ...effortInTranscript,
        },
        toolChoice: false,
        modalities: pdfInputModalities,
      },
      details: {
        family: 'claude',
        families: ['claude'],
        contextWindow: 200_000, // Provider supports 1M tokens; Tau caps effective chat budget for cost and compaction reliability.
        maxTokens: 128_000,
        knowledgeCutoff: '2026-06',
        cost: {
          inputTokens: 2,
          outputTokens: 10,
          cacheReadTokens: 0.2,
          cacheWriteTokens: 2.5,
        },
      },
      configuration: {
        streaming: true,
        maxTokens: 120_000,
        // @ts-expect-error: FIXME - some models use camelCase
        // eslint-disable-next-line @typescript-eslint/naming-convention -- some models use snake_case
        max_tokens: 120_000,
        thinking: {
          type: 'adaptive',
          display: 'summarized',
        },
        outputConfig: {
          effort: 'high',
        },
      },
    },
    'claude-sonnet-5': {
      id: 'anthropic-claude-sonnet-5',
      providerKind: 'tau-hosted',
      name: 'Sonnet 5',
      slug: 'claude-sonnet-5',
      recommended: false,
      description: 'Strong Claude model for complex CAD design iterations and long multi-file edits.',
      provider: {
        id: 'anthropic',
        name: 'Anthropic',
      },
      model: 'claude-sonnet-5',
      support: {
        reasoning: { ...lowToHighReasoning, ...anthropicReplayBinding },
        toolChoice: false,
        modalities: pdfInputModalities,
      },
      details: {
        family: 'claude',
        families: ['claude'],
        contextWindow: 200_000, // Provider supports larger windows; Tau caps effective chat budget for cost and compaction reliability.
        maxTokens: 128_000,
        knowledgeCutoff: '2026-02',
        cost: {
          inputTokens: 2,
          outputTokens: 10,
          cacheReadTokens: 0.2,
          cacheWriteTokens: 2.5,
        },
      },
      configuration: {
        streaming: true,
        maxTokens: 120_000,
        // @ts-expect-error: FIXME - some models use camelCase
        // eslint-disable-next-line @typescript-eslint/naming-convention -- some models use snake_case
        max_tokens: 120_000,
        thinking: {
          type: 'adaptive',
          display: 'summarized',
        },
        outputConfig: {
          effort: 'high',
        },
      },
    },
    'claude-sonnet-4.6': {
      id: 'anthropic-claude-sonnet-4.6',
      providerKind: 'tau-hosted',
      name: 'Sonnet 4.6',
      slug: 'claude-sonnet-4.6',
      recommended: false,
      description: 'Best combination of speed and intelligence, great for most design tasks.',
      provider: {
        id: 'anthropic',
        name: 'Anthropic',
      },
      model: 'claude-sonnet-4-6',
      support: {
        reasoning: { ...lowToHighReasoning, ...anthropicReplayBinding },
        toolChoice: false,
        modalities: pdfInputModalities,
      },
      details: {
        family: 'claude',
        families: ['claude'],
        contextWindow: 200_000,
        maxTokens: 64_000,
        knowledgeCutoff: '2025-08',
        cost: {
          inputTokens: 3,
          outputTokens: 15,
          cacheReadTokens: 0.3,
          cacheWriteTokens: 3.75,
        },
      },
      configuration: {
        streaming: true,
        maxTokens: 120_000,
        // @ts-expect-error: FIXME - some models use camelCase
        // eslint-disable-next-line @typescript-eslint/naming-convention -- some models use snake_case
        max_tokens: 120_000,
        thinking: {
          type: 'adaptive',
        },
        outputConfig: {
          effort: 'high',
        },
      },
    },
    'claude-haiku-5.5': {
      id: 'anthropic-claude-haiku-5.5',
      providerKind: 'tau-hosted',
      name: 'Haiku 5.5',
      slug: 'claude-haiku-5.5',
      recommended: true,
      description: 'Fastest Claude model, ideal for quick design tasks or small changes.',
      provider: {
        id: 'anthropic',
        name: 'Anthropic',
      },
      model: 'claude-haiku-5-5',
      support: {
        reasoning: { ...lowToHighReasoning, ...anthropicReplayBinding, ...effortInTranscript },
        toolChoice: false,
        modalities: pdfInputModalities,
      },
      details: {
        family: 'claude',
        families: ['claude'],
        contextWindow: 200_000, // Provider supports 1M tokens; Tau caps effective chat budget for cost and compaction reliability.
        maxTokens: 128_000,
        cost: {
          inputTokens: 0.1,
          outputTokens: 0.5,
          cacheReadTokens: 0.01,
          cacheWriteTokens: 0.125,
        },
      },
      configuration: {
        streaming: true,
        maxTokens: 16_000,
        // @ts-expect-error: FIXME - some models use camelCase
        // eslint-disable-next-line @typescript-eslint/naming-convention -- some models use snake_case
        max_tokens: 16_000,
        thinking: {
          type: 'adaptive',
        },
        outputConfig: {
          effort: 'high',
        },
      },
    },
  },
  openai: {
    'gpt-6.1-terra': {
      enabled: true,
      id: 'openai-gpt-6.1-terra',
      providerKind: 'tau-hosted',
      name: 'GPT-6.1 Terra',
      slug: 'gpt-6.1-terra',
      recommended: true,
      description: 'Fast visual reasoning for interpreting technical drawings and everyday CAD design iterations.',
      provider: {
        id: 'openai',
        name: 'OpenAI',
      },
      model: 'gpt-6.1-terra',
      support: {
        reasoning: { levels: ['low', 'medium', 'high', 'xhigh', 'max'], ...effortInTranscript },
        modalities: pdfInputModalities,
      },
      details: {
        family: 'gpt',
        families: ['GPT-6.1'],
        contextWindow: 200_000, // Provider supports 1.05M tokens; Tau caps effective chat budget for cost and compaction reliability.
        maxTokens: 128_000,
        knowledgeCutoff: '2026-06',
        cost: {
          inputTokens: 1,
          outputTokens: 5,
          cacheReadTokens: 0.05,
          cacheWriteTokens: 1.25,
        },
      },
      configuration: {
        streaming: true,
        reasoning: {
          effort: 'high',
          summary: 'auto',
        },
      },
    },
    'gpt-6-astra': {
      enabled: true,
      id: 'openai-gpt-6-astra',
      providerKind: 'tau-hosted',
      name: 'GPT-6 Astra',
      slug: 'gpt-6-astra',
      recommended: true,
      description:
        "OpenAI's most capable model for the hardest CAD work: whole-assembly design, deep geometry debugging, and long multi-file refactors.",
      provider: {
        id: 'openai',
        name: 'OpenAI',
      },
      model: 'gpt-6-astra',
      support: {
        reasoning: { ...lowToExtraHighReasoning, ...effortInTranscript },
        modalities: pdfInputModalities,
      },
      details: {
        family: 'gpt',
        families: ['GPT-6'],
        contextWindow: 200_000, // Provider supports 1.05M tokens; Tau caps effective chat budget for cost and compaction reliability.
        maxTokens: 128_000,
        knowledgeCutoff: '2026-04',
        cost: {
          inputTokens: 10,
          outputTokens: 50,
          cacheReadTokens: 1,
          cacheWriteTokens: 12.5,
        },
      },
      configuration: {
        streaming: true,
        temperature: 1,
        reasoning: {
          effort: 'high',
          summary: 'auto',
        },
      },
    },
    'gpt-6-sol': {
      enabled: true,
      id: 'openai-gpt-6-sol',
      providerKind: 'tau-hosted',
      name: 'GPT-6 Sol',
      slug: 'gpt-6-sol',
      recommended: true,
      description:
        'Cost-efficient GPT-6 model for complex CAD design, strong at planning multi-part assemblies and verifying its own work.',
      provider: {
        id: 'openai',
        name: 'OpenAI',
      },
      model: 'gpt-6-sol',
      support: {
        reasoning: { ...lowToHighReasoning, ...effortInTranscript },
        modalities: pdfInputModalities,
      },
      details: {
        family: 'gpt',
        families: ['GPT-6'],
        contextWindow: 200_000, // Provider supports 1.05M tokens; Tau caps effective chat budget for cost and compaction reliability.
        maxTokens: 128_000,
        knowledgeCutoff: '2026-04',
        cost: {
          inputTokens: 2,
          outputTokens: 10,
          cacheReadTokens: 0.2,
          cacheWriteTokens: 2.5,
        },
      },
      configuration: {
        streaming: true,
        temperature: 1,
        reasoning: {
          effort: 'high',
          summary: 'auto',
        },
      },
    },
    'gpt-6-luna': {
      enabled: true,
      id: 'openai-gpt-6-luna',
      providerKind: 'tau-hosted',
      name: 'GPT-6 Luna',
      slug: 'gpt-6-luna',
      recommended: true,
      description: 'Fast, cost-efficient model for high-volume CAD iterations and small design changes.',
      provider: {
        id: 'openai',
        name: 'OpenAI',
      },
      model: 'gpt-6-luna',
      support: {
        reasoning: { ...lowToHighReasoning, ...effortInTranscript },
        modalities: pdfInputModalities,
      },
      details: {
        family: 'gpt',
        families: ['GPT-6'],
        contextWindow: 200_000, // Provider supports 1.05M tokens; Tau caps effective chat budget for cost and compaction reliability.
        maxTokens: 128_000,
        knowledgeCutoff: '2026-04',
        cost: {
          inputTokens: 0.1,
          outputTokens: 0.5,
          cacheReadTokens: 0.01,
          cacheWriteTokens: 0.125,
        },
      },
      configuration: {
        streaming: true,
        temperature: 1,
        reasoning: {
          effort: 'high',
          summary: 'auto',
        },
      },
    },

    'gpt-5.6-sol': {
      enabled: true,
      id: 'openai-gpt-5.6-sol',
      providerKind: 'tau-hosted',
      name: 'GPT-5.6 Sol',
      slug: 'gpt-5.6-sol',
      recommended: false,
      description:
        "OpenAI's frontier model for complex CAD design, strong at planning multi-part assemblies and verifying its own work.",
      provider: {
        id: 'openai',
        name: 'OpenAI',
      },
      model: 'gpt-5.6-sol',
      support: {
        reasoning: { ...lowToHighReasoning, ...effortInTranscript },
        modalities: pdfInputModalities,
      },
      details: {
        family: 'gpt',
        families: ['GPT-5.6'],
        contextWindow: 200_000, // Provider supports 1.05M tokens; Tau caps effective chat budget for cost and compaction reliability.
        maxTokens: 128_000,
        knowledgeCutoff: '2026-02',
        // OpenAI's standard price; billing charges its promotional rate while that lasts.
        cost: {
          inputTokens: 5,
          outputTokens: 30,
          cacheReadTokens: 0.5,
          cacheWriteTokens: 6.25,
        },
      },
      configuration: {
        streaming: true,
        temperature: 1,
        reasoning: {
          effort: 'high',
          summary: 'auto',
        },
      },
    },
    'gpt-5.6-terra': {
      enabled: true,
      id: 'openai-gpt-5.6-terra',
      providerKind: 'tau-hosted',
      name: 'GPT-5.6 Terra',
      slug: 'gpt-5.6-terra',
      recommended: false,
      description: 'Strong balance of intelligence and cost for everyday CAD design, iteration, and multi-file edits.',
      provider: {
        id: 'openai',
        name: 'OpenAI',
      },
      model: 'gpt-5.6-terra',
      support: {
        reasoning: { ...lowToHighReasoning, ...effortInTranscript },
        modalities: pdfInputModalities,
      },
      details: {
        family: 'gpt',
        families: ['GPT-5.6'],
        contextWindow: 200_000, // Provider supports 1.05M tokens; Tau caps effective chat budget for cost and compaction reliability.
        maxTokens: 128_000,
        knowledgeCutoff: '2026-02',
        cost: {
          inputTokens: 2,
          outputTokens: 12,
          cacheReadTokens: 0.2,
          cacheWriteTokens: 2.5,
        },
      },
      configuration: {
        streaming: true,
        temperature: 1,
        reasoning: {
          effort: 'high',
          summary: 'auto',
        },
      },
    },

    'gpt-5.6-luna': {
      enabled: true,
      id: 'openai-gpt-5.6-luna',
      providerKind: 'tau-hosted',
      name: 'GPT-5.6 Luna',
      slug: 'gpt-5.6-luna',
      recommended: false,
      description: 'Fast, cost-efficient model for high-volume CAD iterations and small design changes.',
      provider: {
        id: 'openai',
        name: 'OpenAI',
      },
      model: 'gpt-5.6-luna',
      support: {
        reasoning: { ...lowToHighReasoning, ...effortInTranscript },
        modalities: pdfInputModalities,
      },
      details: {
        family: 'gpt',
        families: ['GPT-5.6'],
        contextWindow: 200_000, // Provider supports 1.05M tokens; Tau caps effective chat budget for cost and compaction reliability.
        maxTokens: 128_000,
        knowledgeCutoff: '2026-02',
        cost: {
          inputTokens: 0.2,
          outputTokens: 1.2,
          cacheReadTokens: 0.02,
          cacheWriteTokens: 0.25,
        },
      },
      configuration: {
        streaming: true,
        temperature: 1,
        reasoning: {
          effort: 'high',
          summary: 'auto',
        },
      },
    },
    'gpt-5.5': {
      enabled: true,
      id: 'openai-gpt-5.5',
      providerKind: 'tau-hosted',
      name: 'GPT-5.5',
      slug: 'gpt-5.5',
      recommended: false,
      description:
        "OpenAI's previous frontier model for complex CAD planning, multi-part assemblies, and design verification.",
      provider: {
        id: 'openai',
        name: 'OpenAI',
      },
      model: 'gpt-5.5',
      support: {
        reasoning: lowToHighReasoning,
        modalities: pdfInputModalities,
      },
      details: {
        family: 'gpt',
        families: ['GPT-5.5'],
        contextWindow: 200_000, // Provider supports 1.05M tokens; Tau caps effective chat budget for cost and compaction reliability.
        maxTokens: 128_000,
        knowledgeCutoff: '2025-12',
        cost: {
          inputTokens: 5,
          outputTokens: 30,
          cacheReadTokens: 0.5,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
        temperature: 1,
        reasoning: {
          effort: 'high',
          summary: 'auto',
        },
      },
    },
    // Off-catalog metering row (AD14): the name/commit generators bill their
    // gpt-4o-mini calls through the credit ledger via getModelCost; never listed.
    'gpt-4o-mini': {
      enabled: false,
      id: 'openai-gpt-4o-mini',
      providerKind: 'tau-hosted',
      name: 'GPT-4o mini (generator metering)',
      slug: 'openai-gpt-4o-mini',
      description: 'Internal cost-metering entry for the project-name and commit-message generators.',
      provider: {
        id: 'openai',
        name: 'OpenAI',
      },
      model: 'gpt-4o-mini',
      support: {
        toolChoice: false,
        modalities: textOnlyModalities,
      },
      details: {
        family: 'gpt',
        families: ['gpt'],
        contextWindow: 128_000,
        maxTokens: 16_384,
        cost: {
          inputTokens: 0.15,
          outputTokens: 0.6,
          cacheReadTokens: 0.075,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
      },
    },
  },
  vertexai: {
    'gemini-4-argon': {
      enabled: true,
      id: 'google-gemini-4-argon',
      providerKind: 'tau-hosted',
      name: 'Gemini 4 Argon',
      slug: 'gemini-4-argon',
      recommended: true,
      description: 'Deep reasoning for complex CAD code, multi-step geometry planning, and large project edits.',
      provider: {
        id: 'vertexai',
        name: 'Google',
      },
      model: 'gemini-4-argon',
      support: {
        tools: true,
        toolChoice: false,
        reasoning: lowToHighReasoning,
        modalities: pdfInputModalities,
      },
      details: {
        family: 'gemini',
        families: ['gemini'],
        contextWindow: 200_000, // Provider shares 1,048,576 tokens across input, thinking, and output.
        maxTokens: 65_536, // Single-stream limit; longer output requires continuation support.
        // Google's standard price; billing pins the introductory rate through November 30, 2026.
        cost: {
          inputTokens: 4,
          outputTokens: 20,
          cacheReadTokens: 0.2,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
        thinkingLevel: 'HIGH',
      },
    },
    'gemini-4-carbon': {
      enabled: true,
      id: 'google-gemini-4-carbon',
      providerKind: 'tau-hosted',
      name: 'Gemini 4 Carbon',
      slug: 'gemini-4-carbon',
      recommended: false,
      description: 'Deep reasoning for long CAD sessions, complex part code, and large multi-file project edits.',
      provider: {
        id: 'vertexai',
        name: 'Google',
      },
      model: 'gemini-4-carbon',
      support: {
        tools: true,
        toolChoice: false,
        reasoning: lowToHighReasoning,
        modalities: pdfInputModalities,
      },
      details: {
        family: 'gemini',
        families: ['gemini'],
        contextWindow: 200_000, // Provider shares 1,048,576 tokens across input, thinking, and output.
        maxTokens: 65_536, // Single-stream limit; longer output requires continuation support.
        // Google's standard price; billing pins the introductory rate through November 30, 2026.
        cost: {
          inputTokens: 4,
          outputTokens: 20,
          cacheReadTokens: 0.2,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
        thinkingLevel: 'HIGH',
      },
    },
    'gemini-3.1-pro': {
      id: 'google-gemini-3.1-pro',
      providerKind: 'tau-hosted',
      name: 'Gemini 3.1 Pro',
      slug: 'gemini-3.1-pro',
      recommended: true,
      description:
        "Google's flagship with sharpened 3D spatial reasoning and parallel tool streaming, excellent for complex modelling work.",
      provider: {
        id: 'vertexai',
        name: 'Google',
      },
      model: 'gemini-3.1-pro-preview-customtools',
      support: {
        reasoning: lowToHighReasoning,
        modalities: pdfInputModalities,
      },
      details: {
        family: 'gemini',
        families: ['gemini'],
        contextWindow: 200_000,
        maxTokens: 65_536,
        knowledgeCutoff: '2025-01',
        cost: {
          inputTokens: 2,
          outputTokens: 12,
          cacheReadTokens: 0.2,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
        temperature: 1,
        thinkingLevel: 'HIGH',
      },
    },
    'gemini-3.8-flash': {
      id: 'google-gemini-3.8-flash',
      providerKind: 'tau-hosted',
      name: 'Gemini 3.8 Flash',
      slug: 'gemini-3.8-flash',
      recommended: true,
      description:
        "Google's fastest strong model for everyday CAD edits, agentic tool loops, and multi-step geometry reasoning.",
      provider: {
        id: 'vertexai',
        name: 'Google',
      },
      model: 'gemini-3.8-flash',
      support: {
        reasoning: lowToHighReasoning,
        modalities: pdfInputModalities,
      },
      details: {
        family: 'gemini',
        families: ['gemini'],
        contextWindow: 200_000, // Provider supports 1,048,576 tokens; Tau caps the effective chat budget.
        maxTokens: 65_536,
        // Google's standard price; billing charges its promotional rate while that lasts.
        cost: {
          inputTokens: 1.5,
          outputTokens: 7.5,
          cacheReadTokens: 0.15,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
        // Google's own default for this model; it rejects MINIMAL outright.
        thinkingLevel: 'HIGH',
      },
    },
    'gemini-3.5-flash-lite': {
      id: 'google-gemini-3.5-flash-lite',
      providerKind: 'tau-hosted',
      name: 'Gemini 3.5 Flash-Lite',
      slug: 'gemini-3.5-flash-lite',
      recommended: false,
      description: 'Fast, low-cost multimodal model for lightweight CAD edits and high-throughput iterations.',
      provider: {
        id: 'vertexai',
        name: 'Google',
      },
      model: 'gemini-3.5-flash-lite',
      support: {
        reasoning: lowToHighReasoning,
        modalities: pdfInputModalities,
      },
      details: {
        family: 'gemini',
        families: ['gemini'],
        contextWindow: 200_000,
        maxTokens: 65_536,
        knowledgeCutoff: '2025-01',
        cost: {
          inputTokens: 0.3,
          outputTokens: 2.5,
          cacheReadTokens: 0.03,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
        thinkingLevel: 'HIGH',
      },
    },
    'gemini-3.5-flash': {
      id: 'google-gemini-3.5-flash',
      providerKind: 'tau-hosted',
      name: 'Gemini 3.5 Flash',
      slug: 'gemini-3.5-flash',
      recommended: false,
      description:
        'Frontier intelligence at Flash speed with sharpened agentic coding, ideal for rapid design iterations and small changes.',
      provider: {
        id: 'vertexai',
        name: 'Google',
      },
      model: 'gemini-3.5-flash',
      support: {
        reasoning: lowToHighReasoning,
        modalities: pdfInputModalities,
      },
      details: {
        family: 'gemini',
        families: ['gemini'],
        contextWindow: 200_000,
        maxTokens: 65_536,
        knowledgeCutoff: '2025-01',
        cost: {
          inputTokens: 1.5,
          outputTokens: 9,
          cacheReadTokens: 0.15,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
        thinkingLevel: 'HIGH',
      },
    },
  },

  together: {
    'kimi-k3.1-pro': {
      enabled: true,
      id: 'together-kimi-k3.1-pro',
      providerKind: 'tau-hosted',
      name: 'Kimi K3.1 Pro',
      slug: 'kimi-k3.1-pro',
      recommended: true,
      description:
        'Strong long-context open reasoning model with vision for complex agentic CAD design and multi-file work.',
      provider: {
        id: 'together',
        name: 'Together AI',
      },
      model: 'moonshotai/Kimi-K3.1-Pro',
      support: {
        tools: true,
        toolChoice: false,
        modalities: imageInputModalities,
      },
      details: {
        family: 'kimi',
        families: ['kimi'],
        contextWindow: 200_000, // Together serves about 1M tokens; Tau caps the effective chat budget for cost and compaction reliability.
        maxTokens: 200_000,
        cost: {
          inputTokens: 2,
          outputTokens: 10,
          cacheReadTokens: 0.2,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
      },
    },
    'glm-5.3': {
      enabled: true,
      id: 'together-glm-5.3',
      providerKind: 'tau-hosted',
      name: 'GLM 5.3',
      slug: 'glm-5.3',
      recommended: false,
      description: 'Strong text-only open coder for long-horizon CAD code generation and complex geometry planning.',
      provider: {
        id: 'together',
        name: 'Together AI',
      },
      model: 'zai-org/GLM-5.3',
      support: {
        tools: true,
        toolChoice: false,
        modalities: textOnlyModalities,
      },
      details: {
        family: 'glm',
        families: ['glm'],
        contextWindow: 200_000, // Together serves about 1M tokens; Tau caps the effective chat budget for cost and compaction reliability.
        maxTokens: 131_072,
        cost: {
          inputTokens: 1.4,
          outputTokens: 4.4,
          cacheReadTokens: 0.26,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
      },
    },
    'glm-5.3-flash': {
      enabled: true,
      id: 'together-glm-5.3-flash',
      providerKind: 'tau-hosted',
      name: 'GLM 5.3 Flash',
      slug: 'glm-5.3-flash',
      recommended: false,
      description: 'Fast, low-cost open coder with vision for quick design iterations and small changes.',
      provider: {
        id: 'together',
        name: 'Together AI',
      },
      model: 'zai-org/GLM-5.3-Flash',
      support: {
        tools: true,
        toolChoice: false,
        modalities: imageInputModalities,
      },
      details: {
        family: 'glm',
        families: ['glm'],
        contextWindow: 200_000, // Together serves about 1M tokens; Tau caps the effective chat budget for cost and compaction reliability.
        maxTokens: 131_072,
        cost: {
          inputTokens: 0.15,
          outputTokens: 0.5,
          cacheReadTokens: 0.03,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
      },
    },
    'minimax-m3.1-flash': {
      enabled: true,
      id: 'together-minimax-m3.1-flash',
      providerKind: 'tau-hosted',
      name: 'MiniMax M3.1 Flash',
      slug: 'minimax-m3.1-flash',
      recommended: false,
      description: 'Low-cost open coder with vision for long agentic tool loops and multi-step design changes.',
      provider: {
        id: 'together',
        name: 'Together AI',
      },
      model: 'MiniMaxAI/MiniMax-M3.1-Flash',
      support: {
        tools: true,
        toolChoice: false,
        modalities: imageInputModalities,
      },
      details: {
        family: 'minimax',
        families: ['minimax'],
        contextWindow: 200_000, // Together serves about 1M tokens; Tau caps the effective chat budget for cost and compaction reliability.
        maxTokens: 131_072,
        cost: {
          inputTokens: 0.15,
          outputTokens: 0.6,
          cacheReadTokens: 0.015,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
      },
    },
    'deepseek-v4-pro': {
      enabled: true,
      id: 'together-deepseek-v4-pro',
      providerKind: 'tau-hosted',
      name: 'DeepSeek V4 Pro',
      slug: 'deepseek-v4-pro',
      recommended: false,
      description:
        'Strong text-only open reasoning model for complex geometry planning and multi-step CAD code generation.',
      provider: {
        id: 'together',
        name: 'Together AI',
      },
      model: 'deepseek-ai/DeepSeek-V4-Pro-0813',
      support: {
        tools: true,
        toolChoice: false,
        modalities: textOnlyModalities,
      },
      details: {
        family: 'deepseek',
        families: ['deepseek'],
        contextWindow: 200_000, // Together serves about 1M tokens; Tau caps the effective chat budget for cost and compaction reliability.
        maxTokens: 131_072,
        cost: {
          inputTokens: 1.32,
          outputTokens: 3.96,
          cacheReadTokens: 0.13,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
      },
    },
  },

  morph: {
    'deepseek-v4.1-flash': {
      enabled: false, // Parked until the Morph account is funded and capped; set true to re-enable.
      id: 'morph-deepseek-v4.1-flash',
      providerKind: 'tau-hosted',
      name: 'DeepSeek V4.1 Flash',
      slug: 'deepseek-v4.1-flash',
      recommended: false,
      description: 'Fast, low-cost open coder with vision for everyday design work and long agentic tool loops.',
      provider: {
        id: 'morph',
        name: 'Morph',
      },
      model: 'morph-dsv41flash',
      support: {
        tools: true,
        toolChoice: false,
        modalities: imageInputModalities,
      },
      details: {
        family: 'deepseek',
        families: ['deepseek'],
        contextWindow: 200_000, // Morph serves 1,048,576 tokens; Tau caps the effective chat budget for cost and compaction reliability.
        maxTokens: 65_536,
        cost: {
          inputTokens: 0.12,
          outputTokens: 0.8,
          cacheReadTokens: 0.008,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
        reasoning: {
          effort: 'high',
        },
      },
    },
  },

  xai: {
    'grok-4.7': {
      enabled: true,
      id: 'xai-grok-4.7',
      providerKind: 'tau-hosted',
      name: 'Grok 4.7',
      slug: 'grok-4.7',
      recommended: true,
      description:
        'Strong xAI model for long-horizon agentic CAD design, complex geometry reasoning, and polished visual work.',
      provider: {
        id: 'xai',
        name: 'xAI',
      },
      model: 'grok-4.7',
      support: {
        reasoning: lowToHighReasoning,
        tools: true,
        toolChoice: false,
        modalities: imageInputModalities,
      },
      details: {
        family: 'grok',
        families: ['grok'],
        contextWindow: 200_000,
        maxTokens: 64_000,
        knowledgeCutoff: '2026-05',
        cost: {
          inputTokens: 2,
          outputTokens: 6,
          cacheReadTokens: 0.5,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
        maxOutputTokens: 64_000,
        reasoning: {
          effort: 'high',
          summary: 'auto',
        },
      },
    },
    'grok-4.6': {
      enabled: true,
      id: 'xai-grok-4.6',
      providerKind: 'tau-hosted',
      name: 'Grok 4.6',
      slug: 'grok-4.6',
      recommended: false,
      description:
        'Strong xAI model for long-horizon agentic CAD design, complex geometry reasoning, and polished visual work.',
      provider: {
        id: 'xai',
        name: 'xAI',
      },
      model: 'grok-4.6',
      support: {
        reasoning: lowToHighReasoning,
        tools: true,
        toolChoice: false,
        modalities: imageInputModalities,
      },
      details: {
        family: 'grok',
        families: ['grok'],
        contextWindow: 200_000,
        maxTokens: 64_000,
        knowledgeCutoff: '2026-02',
        cost: {
          inputTokens: 2,
          outputTokens: 6,
          cacheReadTokens: 0.5,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
        maxOutputTokens: 64_000,
        reasoning: {
          effort: 'high',
          summary: 'auto',
        },
      },
    },
  },

  moonshot: {
    'kimi-k3': {
      enabled: false,
      id: 'moonshot-kimi-k3',
      providerKind: 'tau-hosted',
      name: 'Kimi K3',
      slug: 'kimi-k3',
      recommended: false,
      description: 'Long-context multimodal reasoning model for complex agentic CAD design and multi-file work.',
      provider: {
        id: 'moonshot',
        name: 'Moonshot AI',
      },
      model: 'kimi-k3',
      support: {
        tools: true,
        toolChoice: false,
        modalities: imageInputModalities,
      },
      details: {
        family: 'kimi',
        families: ['kimi'],
        contextWindow: 200_000, // Provider supports 1M tokens; Tau caps effective chat budget for cost and compaction reliability.
        maxTokens: 1_048_576,
        cost: {
          inputTokens: 3,
          outputTokens: 15,
          cacheReadTokens: 0.3,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
        reasoning: {
          effort: 'high',
        },
      },
    },
  },

  cerebras: {
    'qwen-3-235b': {
      enabled: false,
      id: 'cerebras-qwen-3-235b',
      providerKind: 'tau-hosted',
      name: 'Qwen 3 235B',
      slug: 'cerebras-qwen-3-235b',
      description: 'Strong reasoning model running at ~1,400 tok/s, great for iterative CAD design.',
      provider: {
        id: 'cerebras',
        name: 'Cerebras',
      },
      model: 'qwen-3-235b-a22b-instruct-2507',
      support: {
        toolChoice: false,
        modalities: textOnlyModalities,
      },
      details: {
        family: 'qwen',
        families: ['qwen'],
        contextWindow: 128_000,
        maxTokens: 64_000,
        cost: {
          inputTokens: 0.4,
          outputTokens: 0.8,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
      },
    },
  },
} as const satisfies Record<CloudCatalogProviderId, Record<string, ModelListEntry>>;
