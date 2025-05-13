import { useRouteLoaderData } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { ENV } from '@/config.js';
import type { loader } from '@/root.js';
import { useCookie } from '@/hooks/use-cookie.js';

const defaultChatModel = 'anthropic-claude-3.7-sonnet-thinking';

export type Model = {
  id: string;
  model: string;
  name: string;
  provider: string;
  details: {
    parameterSize: string;
  };
};

export const getModels = async (): Promise<Model[]> => {
  try {
    const response = await fetch(`${ENV.TAU_API_URL}/v1/models`, {
      headers: {
        'ngrok-skip-browser-warning': 'true',
      },
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
  const [selectedModelId, setSelectedModelId] = useCookie('chat-model', defaultChatModel);

  const { data, isLoading } = useQuery({
    queryKey: ['models'],
    queryFn: async () => getModels(),
    initialData: loaderData?.models,
  });

  const selectedModel = useMemo(() => {
    return data?.find((model) => model.id === selectedModelId);
  }, [data, selectedModelId]);

  return { data, isLoading, selectedModel, setSelectedModelId };
};
