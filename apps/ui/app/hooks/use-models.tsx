import { ENV } from '@/config';
import type { loader } from '@/root';
import { useRouteLoaderData } from '@remix-run/react';
import { useQuery } from '@tanstack/react-query';

export type Model = {
  model: string;
  provider: string;
  details: {
    parameterSize: string;
  };
};

export const getModels = async (): Promise<Model[]> => {
  const response = await fetch(`${ENV.TAU_API_BASE_URL}/v1/models`, {
    headers: {
      'ngrok-skip-browser-warning': 'true',
    },
  });
  const data = await response.json();

  return data;
};

export const useModels = () => {
  const loaderData = useRouteLoaderData<typeof loader>('root');

  const { data, isLoading } = useQuery({
    queryKey: ['models'],
    queryFn: () => getModels(),
    initialData: loaderData?.models,
  });

  return { data, isLoading };
};
