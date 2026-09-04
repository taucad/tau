import { kernelConfigurations } from '@taucad/types/constants';
import type { KernelConfiguration } from '@taucad/types/constants';
import { desktopBridge } from '#filesystem/desktop-bridge.js';

/** Product offerings executable by the active runtime host. */
export const availableKernelConfigurations = () => {
  const advertised = new Set(desktopBridge()?.runtimeKernelIds ?? []);
  return kernelConfigurations.filter((configuration) => {
    const required = 'requiresRuntimeKernelId' in configuration ? configuration.requiresRuntimeKernelId : undefined;
    return !required || advertised.has(required);
  });
};

/** Whether one persisted catalog id is executable by this runtime. */
export const isKernelAvailable = (kernelId: string): boolean =>
  availableKernelConfigurations().some(({ id }) => id === kernelId);

/** Resolve the native runtime requirement declared by the product catalog for an entry path. */
export const nativeKernelRequirementForEntryPath = (
  entryPath: string,
):
  | {
      readonly configuration: KernelConfiguration;
      readonly runtimeKernelId: string;
    }
  | undefined => {
  const extension = entryPath.split('.').at(-1)?.toLowerCase();
  const configuration = kernelConfigurations.find(
    ({ mainFile }) => extension !== undefined && mainFile.toLowerCase().endsWith(`.${extension}`),
  ) as KernelConfiguration | undefined;
  if (!configuration?.requiresNativeCodeTrust || !configuration.requiresRuntimeKernelId) {
    return undefined;
  }
  return { configuration, runtimeKernelId: configuration.requiresRuntimeKernelId };
};
