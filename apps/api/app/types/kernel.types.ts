export const kernelProviders = ['replicad', 'openscad'] as const;
export type KernelProvider = (typeof kernelProviders)[number];
