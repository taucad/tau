import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import type { ModelFamily, ModelProvider } from '@taucad/chat';
/* oxlint-disable import/extensions -- TypeScript ESM resolves the authoritative source through its emitted .js path. */
// eslint-disable-next-line @nx/enforce-module-boundaries -- Type-only reuse keeps the API's Zod-inferred response authoritative.
import type { Model as ApiModel } from '../../../api/app/api/models/model.schema.js';
/* oxlint-enable import/extensions -- Re-enable project import checks. */
import { ENV } from '#environment.config.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import { defaultChatModel } from '#constants/chat.constants.js';
import { unknownIconId } from '#components/icons/svg-icon.js';

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

export const getModels = async (): Promise<Model[]> => {
  try {
    const response = await fetch(`${ENV.TAU_API_URL}/v1/models`, {
      credentials: 'include',
    });
    // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- TODO: replace with SDK fetcher
    const data = await response.json();

    // oxlint-disable-next-line @typescript-eslint/no-unsafe-return -- TODO: replace with SDK fetcher
    return data;
  } catch {
    return [];
  }
};

// oxlint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- intentionally allowing inference
export const useModels = () => {
  const [selectedModelId, setSelectedModelId] = useCookie(cookieName.chatModel, defaultChatModel);
  const [overrides, setOverrides] = useCookie<Record<string, boolean>>(cookieName.chatModelOverrides, {});

  const { data, isLoading } = useQuery({
    queryKey: ['models'],
    queryFn: async () => getModels(),
    refetchInterval: 1000 * 60 * 5, // 5 minutes
  });

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

  const resolveModel = useCallback((id: string): ResolvedModel => buildResolved(id, modelById.get(id)), [modelById]);

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
    resolveModel,
    overrides,
    isAvailable,
    setAvailable,
    availableModels,
    recommendedModels,
  };
};
