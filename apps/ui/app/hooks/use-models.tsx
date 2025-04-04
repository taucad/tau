import { ENV } from '@/config';
import type { loader } from '@/root';
import { useCookie } from '@/hooks/use-cookie';
import { useRouteLoaderData } from '@remix-run/react';
import { useQuery } from '@tanstack/react-query';

const CHAT_MODEL_COOKIE_NAME = 'chat-model';
const DEFAULT_CHAT_MODEL = 'anthropic-claude-3.7-sonnet-thinking';

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
    const data = await response.json();

    return data;
  } catch {
    return [];
  }
};

export const useModels = () => {
  const loaderData = useRouteLoaderData<typeof loader>('root');
  const [selectedModel, setSelectedModel] = useCookie(CHAT_MODEL_COOKIE_NAME, DEFAULT_CHAT_MODEL);

  const { data, isLoading } = useQuery({
    queryKey: ['models'],
    queryFn: () => getModels(),
    initialData: loaderData?.models,
  });

  return { data, isLoading, selectedModel, setSelectedModel };
};
