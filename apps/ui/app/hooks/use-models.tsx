import { useRouteLoaderData } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { Model } from '@taucad/types';
import { ENV } from '#config.js';
import type { loader } from '#root.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import { defaultChatModel } from '#constants/chat.constants.js';

export const getModels = async (): Promise<Model[]> => {
  try {
    const response = await fetch(`${ENV.TAU_API_URL}/v1/models`, {
      credentials: 'include',
    });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- TODO: replace with SDK fetcher
    const data = await response.json();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- TODO: replace with SDK fetcher
    return data;
  } catch {
    return [];
  }
};

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- intentionally allowing inference
export const useModels = () => {
  const loaderData = useRouteLoaderData<typeof loader>('root');
  const [selectedModelId, setSelectedModelId] = useCookie(cookieName.chatModel, defaultChatModel);

  const { data, isLoading } = useQuery({
    queryKey: ['models'],
    queryFn: async () => getModels(),
    refetchInterval: 1000 * 60 * 5, // 5 minutes
    initialData: loaderData?.models,
  });

  const selectedModel = useMemo(() => {
    const model = data?.find((model) => model.id === selectedModelId);

    return model;
  }, [data, selectedModelId]);

  return { data, isLoading, selectedModel, setSelectedModelId };
};
