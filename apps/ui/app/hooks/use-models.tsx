import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import type { CadAgentExecution, ModelFamily, ModelProvider, TauAgentExecution } from '@taucad/chat';
import { reasoningLevels } from '@taucad/chat/constants';
import { cadAgentExecutionSchema } from '@taucad/chat/schemas';
/* oxlint-disable import/extensions -- TypeScript ESM resolves the authoritative source through its emitted .js path. */
// eslint-disable-next-line @nx/enforce-module-boundaries -- Type-only reuse keeps the API's Zod-inferred response authoritative.
import type { Model as ApiModel } from '../../../api/app/api/models/model.schema.js';
/* oxlint-enable import/extensions -- Re-enable project import checks. */
import { ENV } from '#environment.config.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import { defaultChatModel } from '#constants/chat.constants.js';
import { unknownIconId } from '#components/icons/svg-icon.js';
import { resolveNewChatExecution } from '#utils/new-chat-execution.js';
import type { ModelCatalog } from '#utils/new-chat-execution.js';

export type Model = ApiModel;

/**
 * UI-local resolved view of a {@link Model}. Always non-null so call sites can
 * render display values without `??` fallbacks. When the API hasn't returned
 * the model yet (or never will), `family` and `provider.id` degrade to the
 * `'unknown'` sentinel that {@link SvgIcon} skips.
 */
export type ResolvedModel = {
  id: string;
  name: string;
  family: ModelFamily | typeof unknownIconId;
  provider: { id: ModelProvider | typeof unknownIconId; name: string };
  isResolved: boolean;
  model?: Model;
};

const buildResolved = (id: string, model?: Model): ResolvedModel => ({
  id,
  name: model?.name ?? id.split('/').pop() ?? id,
  family: model?.details.family ?? unknownIconId,
  provider: model?.provider ?? { id: unknownIconId, name: 'Unknown' },
  isResolved: Boolean(model),
  model,
});

/**
 * The model catalog. An unreachable API, an error status and a body that is not a list all reject, so a failed
 * catalog is never mistaken for an empty one.
 *
 * @returns The catalog rows.
 */
export const getModels = async (): Promise<Model[]> => {
  const response = await fetch(`${ENV.TAU_API_URL}/v1/models`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(`The model catalog answered ${response.status}.`);
  }
  const data: unknown = await response.json();
  if (!Array.isArray(data)) {
    throw new TypeError('The model catalog answered with something other than a list.');
  }
  // ponytail: the API's own Zod schema shapes the rows; the UI checks only the envelope.
  return data as Model[];
};

const modelsQuery = {
  queryKey: ['models'],
  queryFn: getModels,
  /* One retry, whatever the network reports: admission waits on this fetch, so it must settle. */
  retry: 1,
  networkMode: 'always',
  meta: { handlesErrorLocally: true },
} as const;

/** Upper bound on a turn waiting for the catalog's first answer. Milliseconds. */
const catalogWaitTimeout = 10_000;

const catalogOf = (data: Model[] | undefined, isError: boolean): ModelCatalog =>
  data === undefined ? { status: isError ? 'unavailable' : 'loading' } : { status: 'loaded', models: data };

/** A stored execution is untrusted: one that fails the wire schema would fail the turn. */
const parseStoredExecution = (value: unknown): CadAgentExecution | undefined => {
  const parsed = cadAgentExecutionSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

// oxlint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- intentionally allowing inference
export const useModels = () => {
  const queryClient = useQueryClient();
  const [storedExecution, setStoredExecution] = useCookie<unknown>(cookieName.chatExecution, undefined);
  const [selectedModelId, setSelectedModelId] = useCookie(cookieName.chatModel, defaultChatModel);
  const [overrides, setOverrides] = useCookie<Record<string, boolean>>(cookieName.chatModelOverrides, {});
  const [storedEffort, setStoredEffort] = useCookie<string | undefined>(cookieName.chatEffort, undefined);
  // Stored preferences are untrusted: a level outside the vocabulary would fail the turn wire.
  const selectedEffort = reasoningLevels.find((level) => level === storedEffort);

  /** The last Tau model and level chosen: where a chat returns to from an external agent. */
  const lastTauExecution = useMemo<TauAgentExecution>(
    () => ({
      kind: 'tau',
      model: selectedModelId,
      ...(selectedEffort === undefined ? {} : { effort: selectedEffort }),
    }),
    [selectedModelId, selectedEffort],
  );

  const { data, isLoading, isError } = useQuery({
    ...modelsQuery,
    refetchInterval: 1000 * 60 * 5, // 5 minutes
  });
  const catalog = useMemo(() => catalogOf(data, isError), [data, isError]);

  /** The execution a chat with none of its own starts on: the last one used, of any agent. */
  const defaultExecution = useMemo<CadAgentExecution>(
    () => resolveNewChatExecution({ last: parseStoredExecution(storedExecution), lastTau: lastTauExecution, catalog }),
    [storedExecution, lastTauExecution, catalog],
  );

  /** Remember the execution a chat chose or ran on as the next new chat's, whatever its agent. */
  const rememberExecution = useCallback(
    (execution: CadAgentExecution): void => {
      setStoredExecution(execution);
      if (execution.kind !== 'tau') {
        return;
      }
      setSelectedModelId(execution.model);
      if (execution.effort !== undefined) {
        setStoredEffort(execution.effort);
      }
    },
    [setStoredExecution, setSelectedModelId, setStoredEffort],
  );

  /**
   * The catalog for a turn about to run. A settled answer — rows or a failure — is returned at once, so admission
   * never polls; only a first fetch still in flight is awaited, and no longer than {@link catalogWaitTimeout}, because
   * a seeded first turn can fire at chat load, ahead of it.
   */
  const ensureModelCatalog = useCallback(async (): Promise<ModelCatalog> => {
    const state = queryClient.getQueryState<Model[]>(modelsQuery.queryKey);
    if (state?.data !== undefined || state?.status === 'error') {
      return catalogOf(state.data, true);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const data = await Promise.race([
        queryClient.ensureQueryData(modelsQuery),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            reject(new Error('The model catalog did not answer in time.'));
          }, catalogWaitTimeout);
        }),
      ]);
      return catalogOf(data, true);
    } catch {
      return { status: 'unavailable' };
    } finally {
      clearTimeout(timer);
    }
  }, [queryClient]);

  const isAvailable = useCallback(
    (model: Model): boolean => overrides[model.id] ?? model.recommended ?? false,
    [overrides],
  );

  const setAvailable = useCallback(
    (model: Model, enabled: boolean): void => {
      const recommendedDefault = model.recommended ?? false;
      setOverrides((previous) => {
        const entries = Object.entries(previous).filter(([key]) => key !== model.id);
        if (enabled !== recommendedDefault) {
          entries.push([model.id, enabled]);
        }

        return Object.fromEntries(entries);
      });
    },
    [setOverrides],
  );

  const availableModels = useMemo(() => (data ?? []).filter((model) => isAvailable(model)), [data, isAvailable]);

  const recommendedModels = useMemo(() => (data ?? []).filter((model) => model.recommended === true), [data]);

  const modelById = useMemo(() => new Map((data ?? []).map((m) => [m.id, m])), [data]);

  /* Reads the query cache rather than this render's map, so a caller that just awaited the catalog sees it. */
  const resolveModel = useCallback(
    (id: string): ResolvedModel =>
      buildResolved(
        id,
        (queryClient.getQueryData<Model[]>(modelsQuery.queryKey) ?? data)?.find((model) => model.id === id),
      ),
    [queryClient, data],
  );

  const selectedModel = useMemo<ResolvedModel>(
    () => buildResolved(selectedModelId, modelById.get(selectedModelId)),
    [modelById, selectedModelId],
  );

  return {
    data,
    isLoading,
    selectedModel,
    selectedModelId,
    setSelectedModelId,
    catalog,
    ensureModelCatalog,
    defaultExecution,
    lastTauExecution,
    rememberExecution,
    resolveModel,
    overrides,
    isAvailable,
    setAvailable,
    availableModels,
    recommendedModels,
  };
};
