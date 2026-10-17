import { z } from 'zod';
import { agentChannelModelSchema } from '@taucad/agent-host/wire';
import type { AgentSessionModel } from '@taucad/agent-host';
import type { ResolveProjectModelInput } from '@taucad/host';

const catalogModelSchema = z.looseObject({
  id: z.string(),
  provider: z.looseObject({ id: z.string() }),
  details: z.looseObject({
    contextWindow: z.number(),
    maxTokens: z.number(),
    cost: z.looseObject({
      inputTokens: z.number(),
      outputTokens: z.number(),
      cacheReadTokens: z.number(),
      cacheWriteTokens: z.number(),
    }),
  }),
  configuration: z.looseObject({
    thinking: z
      .union([
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Anthropic catalog uses snake_case.
        z.looseObject({ type: z.literal('enabled'), budget_tokens: z.number() }),
        z.looseObject({ type: z.literal('adaptive'), display: z.enum(['summarized', 'omitted']).optional() }),
      ])
      .optional(),
    outputConfig: z.looseObject({ effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional() }).optional(),
    thinkingLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'THINKING_LEVEL_UNSPECIFIED']).optional(),
    reasoning: z
      .looseObject({
        effort: z.enum(['low', 'medium', 'high']).optional(),
        summary: z.enum(['auto', 'concise', 'detailed']).optional(),
      })
      .optional(),
  }),
});

type CatalogModel = z.infer<typeof catalogModelSchema>;

/** Default reasoning carried by the catalog row, matching the browser admission's provider rules. */
const catalogReasoning = (model: CatalogModel): AgentSessionModel['reasoning'] => {
  const { configuration } = model;
  switch (model.provider.id) {
    case 'anthropic': {
      if (configuration.thinking?.type === 'enabled') {
        return { budgetTokens: configuration.thinking.budget_tokens };
      }
      if (configuration.thinking?.type === 'adaptive') {
        return {
          ...(configuration.outputConfig?.effort === undefined ? {} : { effort: configuration.outputConfig.effort }),
          ...(configuration.thinking.display === undefined ? {} : { display: configuration.thinking.display }),
        };
      }
      return undefined;
    }
    case 'vertexai': {
      const effort = configuration.thinkingLevel?.toLowerCase();
      return effort === 'low' || effort === 'medium' || effort === 'high' ? { effort } : undefined;
    }
    default: {
      return configuration.reasoning;
    }
  }
};

/** Project one API catalog row into the existing portable admission model. */
export const mapProjectCatalogModel = (value: unknown): AgentSessionModel | undefined => {
  const catalog = catalogModelSchema.safeParse(value);
  if (!catalog.success) {
    return undefined;
  }
  const model = catalog.data;
  const reasoning = catalogReasoning(model);
  const projected = agentChannelModelSchema.safeParse({
    id: model.id,
    providerKind: model.provider.id,
    contextWindow: model.details.contextWindow,
    maxTokens: model.details.maxTokens,
    cost: {
      input: model.details.cost.inputTokens,
      output: model.details.cost.outputTokens,
      cacheRead: model.details.cost.cacheReadTokens,
      cacheWrite: model.details.cost.cacheWriteTokens,
    },
    ...(reasoning === undefined ? {} : { reasoning }),
  });
  return projected.success ? projected.data : undefined;
};

const unavailable = (): Error =>
  Object.assign(new Error('The requested Tau model is unavailable on this host.'), {
    code: 'TASK_UNAVAILABLE',
  });

/** Read the current signed-in catalog once for an explicit Tau child selection. */
export const createProjectModelResolver =
  (
    options: Readonly<{
      apiBaseUrl: string;
      authToken: () => string | undefined;
      fetch?: typeof fetch;
    }>,
  ): ((input: ResolveProjectModelInput) => Promise<AgentSessionModel | undefined>) =>
  async ({ modelId, signal }) => {
    signal.throwIfAborted();
    const token = options.authToken();
    if (token === undefined) {
      throw unavailable();
    }
    const deadline = AbortSignal.timeout(10_000);
    const requestSignal = AbortSignal.any([signal, deadline]);
    try {
      const response = await (options.fetch ?? fetch)(new URL('/v1/models', options.apiBaseUrl), {
        headers: { authorization: `Bearer ${token}` },
        redirect: 'error',
        signal: requestSignal,
      });
      if (!response.ok) {
        throw unavailable();
      }
      const body: unknown = await response.json();
      if (!Array.isArray(body)) {
        throw unavailable();
      }
      const row: unknown = body.find(
        (item: unknown) => typeof item === 'object' && item !== null && 'id' in item && item.id === modelId,
      );
      const model = mapProjectCatalogModel(row);
      if (model === undefined || model.id !== modelId) {
        throw unavailable();
      }
      signal.throwIfAborted();
      return model;
    } catch {
      signal.throwIfAborted();
      throw unavailable();
    }
  };
