import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import type { CadAgentExecution, ModelFamily, ModelProvider, TauAgentExecution } from '@taucad/chat';
import { reasoningLevels } from '@taucad/chat/constants';
import { cadAgentExecutionSchema } from '@taucad/chat/schemas';
import { ENV } from '#environment.config.js';
import { useCookie } from '#hooks/use-cookie.js';
import { usePlaceableExecution } from '#hooks/use-placeable-execution.js';
import { useFeature } from '#flags/use-feature.js';
import { cookieName } from '@taucad/ui-core/constants/cookie.constants';
import { unknownIconId } from '@taucad/ui-kit/icons/svg-icon';
import { resolveNewChatExecution } from '@taucad/chat-ui/utils/new-chat-execution';
import type { ModelCatalog } from '@taucad/chat-ui/utils/new-chat-execution';
import { catalogFreshness, modelsQueryKey, readModelCatalog } from '#lib/model-catalog.js';
import type { Model as CatalogModel } from '#lib/model-catalog.js';

export type Model = CatalogModel;

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
  /**
   * Whether the display name is not known yet: no catalog row for the id, and either no catalog at all (still loading
   * or unavailable) or no id. A label shows a fixed-width placeholder then, never the raw id or an empty name. A
   * catalog that answered without the id (a retired model) is not pending: `name` falls back to the id.
   */
  isNamePending: boolean;
  model?: Model;
};

const buildResolved = (id: string, rows: readonly Model[] | undefined): ResolvedModel => {
  const model = rows?.find((entry) => entry.id === id);
  return {
    id,
    name: model?.name ?? id.split('/').pop() ?? id,
    family: model?.details.family ?? unknownIconId,
    provider: model?.provider ?? { id: unknownIconId, name: 'Unknown' },
    isResolved: Boolean(model),
    isNamePending: model === undefined && (rows === undefined || id === ''),
    model,
  };
};

/**
 * The model catalog. An unreachable API, an error status and a body that is not a list all reject.
 *
 * @returns The catalog rows.
 */
export const getModels = async (): Promise<Model[]> =>
  readModelCatalog(
    await fetch(`${ENV.TAU_API_URL}/v1/models`, {
      credentials: 'include',
    }),
  );

const modelsQuery = {
  queryKey: modelsQueryKey,
  queryFn: getModels,
  staleTime: catalogFreshness,
  /* One retry, whatever the network reports: admission waits on this fetch, so it must settle. */
  retry: 1,
  networkMode: 'always',
  meta: { handlesErrorLocally: true },
} as const;

/** Upper bound on a turn waiting for the catalog's first answer. Milliseconds. */
const catalogWaitTimeout = 10_000;

const catalogOf = (data: Model[] | undefined, isError: boolean): ModelCatalog =>
  data === undefined ? { status: isError ? 'unavailable' : 'loading' } : { status: 'loaded', models: data };

/**
 * The model a new chat starts on when nothing was chosen: the row the API marks `default`, else the recommended row,
 * else the first.
 *
 * @param data - The loaded catalog, if any.
 * @returns The default model id, or `undefined` before the catalog answers or when it is empty.
 */
export const catalogDefaultModelId = (
  data: ReadonlyArray<Readonly<{ id: string; recommended?: boolean; default?: boolean }>> | undefined,
): string | undefined =>
  (data?.find((model) => model.default === true) ?? data?.find((model) => model.recommended === true) ?? data?.[0])?.id;

/** A stored execution is untrusted: one that fails the wire schema would fail the turn. */
const parseStoredExecution = (value: unknown): CadAgentExecution | undefined => {
  const parsed = cadAgentExecutionSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

/** No overrides: every model follows its `recommended` flag. */
const noOverrides: Readonly<Record<string, boolean>> = {};

/** Nothing pinned. */
const noPinned: readonly string[] = [];

/** A stored pin list is untrusted: anything but a list of ids reads as nothing pinned. */
const parsePinned = (value: unknown): readonly string[] =>
  Array.isArray(value) && value.every((id) => typeof id === 'string') ? value : noPinned;

// oxlint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- intentionally allowing inference
export const useModels = () => {
  const queryClient = useQueryClient();
  const [storedExecution, setStoredExecution] = useCookie<unknown>(cookieName.chatExecution, undefined);
  const [storedModelId, setSelectedModelId] = useCookie<string | undefined>(cookieName.chatModel, undefined);
  const [overrides, setOverrides, resetOverrides] = useCookie<Readonly<Record<string, boolean>>>(
    cookieName.chatModelOverrides,
    noOverrides,
  );
  const [storedPinned, setStoredPinned] = useCookie<unknown>(cookieName.chatModelPinned, noPinned);
  /* Pinning is behind a hidden flag: while it is off, stored pins neither group nor keep a model in the picker. */
  const isPinningEnabled = useFeature('modelPinning');
  const [storedEffort, setStoredEffort] = useCookie<string | undefined>(cookieName.chatEffort, undefined);
  // Stored preferences are untrusted: a level outside the vocabulary would fail the turn wire.
  const selectedEffort = reasoningLevels.find((level) => level === storedEffort);

  const { data, isLoading, isError } = useQuery({
    ...modelsQuery,
    refetchInterval: 1000 * 60 * 5, // 5 minutes
  });
  const catalog = useMemo(() => catalogOf(data, isError), [data, isError]);

  /*
   * The Tau model chosen last, else the one the catalog names as its default. The API owns the default, so before
   * the catalog first answers a visitor who never chose has no model yet and admission waits for the catalog.
   */
  const selectedModelId = storedModelId ?? catalogDefaultModelId(data) ?? '';

  /** The last Tau model and level chosen: where a chat returns to from an external agent. */
  const lastTauExecution = useMemo<TauAgentExecution>(
    () => ({
      kind: 'tau',
      model: selectedModelId,
      ...(selectedEffort === undefined ? {} : { effort: selectedEffort }),
    }),
    [selectedModelId, selectedEffort],
  );

  /**
   * The execution a chat with none of its own starts on: the last one used, of any agent, on a host this tab reaches.
   * The cookie is shared by every tab on this device, so a loopback daemon another tab was handed is dropped here.
   */
  const defaultExecution = usePlaceableExecution(
    useMemo<CadAgentExecution>(
      () =>
        resolveNewChatExecution({ last: parseStoredExecution(storedExecution), lastTau: lastTauExecution, catalog }),
      [storedExecution, lastTauExecution, catalog],
    ),
  );

  /**
   * Remember the execution a chat chose or ran on as the next new chat's, whatever its agent. The cookie is this
   * device's own default, so it keeps a device-relative host as chosen; only a chat record drops one (XD2).
   */
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
        queryClient.query({ ...modelsQuery, staleTime: 'static' }),
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

  /**
   * The execution a new chat is created with. A Tau execution with no model yet — chosen before the catalog first
   * answered — waits for the catalog and takes its default, so the chat is never saved without a model.
   */
  const withCatalogDefaultModel = useCallback(
    async (execution: CadAgentExecution): Promise<CadAgentExecution> => {
      if (execution.kind !== 'tau' || execution.model !== '') {
        return execution;
      }
      const loaded = await ensureModelCatalog();
      const model = loaded.status === 'loaded' ? catalogDefaultModelId(loaded.models) : undefined;
      return model === undefined ? execution : { ...execution, model };
    },
    [ensureModelCatalog],
  );

  /*
   * Whether the loaded catalog offers a model id. While the catalog is loading or unavailable every id counts as
   * offered, so an offline session prunes nothing (R3).
   */
  const isOffered = useCallback((id: string): boolean => data?.some((model) => model.id === id) ?? true, [data]);

  /** Pinned model ids in pin order, without ids the loaded catalog no longer offers. */
  const pinnedIds = useMemo(
    () => (isPinningEnabled ? parsePinned(storedPinned).filter((id) => isOffered(id)) : noPinned),
    [isPinningEnabled, storedPinned, isOffered],
  );

  const isPinned = useCallback((model: Model): boolean => pinnedIds.includes(model.id), [pinnedIds]);

  /* An explicit toggle wins; otherwise a pinned or recommended model is available, so a pin keeps a model in the picker. */
  const isAvailable = useCallback(
    (model: Model): boolean => overrides[model.id] ?? (pinnedIds.includes(model.id) || (model.recommended ?? false)),
    [overrides, pinnedIds],
  );

  /* Every explicit toggle is stored, even one that agrees with `recommended`, so a later catalog change cannot undo it (R2). */
  const setAvailable = useCallback(
    (model: Model, enabled: boolean): void => {
      setOverrides((previous) => ({
        ...Object.fromEntries(Object.entries(previous).filter(([id]) => id !== model.id && isOffered(id))),
        [model.id]: enabled,
      }));
    },
    [setOverrides, isOffered],
  );

  /** Forget every toggle, so each model follows Tau's recommendation again. */
  const resetAvailability = useCallback((): void => {
    resetOverrides();
  }, [resetOverrides]);

  /**
   * Pin a model at the end of the list, or unpin it. A pin keeps a model in the picker, so pinning one switched off
   * switches it back on (Q11); an unpinned model follows its toggle or recommendation again.
   */
  const setPinned = useCallback(
    (model: Model, isOn: boolean): void => {
      setStoredPinned((previous: unknown) => {
        const ids = parsePinned(previous).filter((id) => isOffered(id));
        if (!isOn) {
          return ids.filter((id) => id !== model.id);
        }
        /* An already-pinned model keeps its place. */
        return ids.includes(model.id) ? ids : [...ids, model.id];
      });
      if (isOn && overrides[model.id] === false) {
        setAvailable(model, true);
      }
    },
    [setStoredPinned, isOffered, overrides, setAvailable],
  );

  const availableModels = useMemo(() => (data ?? []).filter((model) => isAvailable(model)), [data, isAvailable]);

  const recommendedModels = useMemo(() => (data ?? []).filter((model) => model.recommended === true), [data]);

  /* Reads the query cache rather than this render's data, so a caller that just awaited the catalog sees it. */
  const resolveModel = useCallback(
    (id: string): ResolvedModel => buildResolved(id, queryClient.getQueryData<Model[]>(modelsQuery.queryKey) ?? data),
    [queryClient, data],
  );

  const selectedModel = useMemo<ResolvedModel>(() => buildResolved(selectedModelId, data), [data, selectedModelId]);

  return {
    data,
    isLoading,
    selectedModel,
    selectedModelId,
    setSelectedModelId,
    catalog,
    ensureModelCatalog,
    withCatalogDefaultModel,
    defaultExecution,
    lastTauExecution,
    rememberExecution,
    resolveModel,
    overrides,
    isAvailable,
    setAvailable,
    resetAvailability,
    isPinningEnabled,
    pinnedIds,
    isPinned,
    setPinned,
    availableModels,
    recommendedModels,
  };
};
