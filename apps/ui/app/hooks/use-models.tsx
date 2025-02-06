import { ENV } from '@/config';
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
  const { data, isLoading } = useQuery({
    queryKey: ['models'],
    queryFn: () => getModels(),
    initialData: [],
  });

  return { data, isLoading };
};
