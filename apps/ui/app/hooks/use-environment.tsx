import type { loader } from '@/root';
import { useRouteLoaderData } from '@remix-run/react';

export const useEnvironment = () => {
  const loaderData = useRouteLoaderData<typeof loader>('root');

  if (!loaderData?.env) {
    throw new Error('Environment variables not available');
  }

  return loaderData?.env;
};
