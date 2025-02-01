import { useLoaderData } from '@remix-run/react';
import { useQuery } from '@tanstack/react-query';

export const getModels = async () => {
  const response = await fetch('http://localhost:4000/v1/models');
  const data = await response.json();

  return data;
};

export const useModels = () => {
  //   const { models } = useLoaderData<any>();
  const { data, isLoading } = useQuery({
    queryKey: ['models'],
    queryFn: () => getModels(),
    initialData: [],
  });

  return { data, isLoading };
};
