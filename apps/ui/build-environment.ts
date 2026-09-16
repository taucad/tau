/** Resolve the deployment mode before Vite constructs any client, worker or SSR graph. */
export const resolveTauCloudBuildEnabled = (value: string | undefined): boolean => {
  if (value === undefined || value === 'false') {
    return false;
  }
  if (value === 'true') {
    return true;
  }
  throw new Error('TAU_CLOUD_ENABLED must be exactly true or false.');
};
