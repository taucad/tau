export const kernelProviders = ['replicad', 'openscad', 'zoo'] as const;
export type KernelProvider = (typeof kernelProviders)[number];
