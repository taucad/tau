import { kernelConfigurations } from '@taucad/types/constants';
import type { KernelConfiguration, KernelEntry, KernelId } from '@taucad/types/constants';
import type { KernelRoutingProfile } from '@taucad/chat/prompts';
import { picogkBrowserAssets } from '#runtime/picogk-browser-assets.js';
import { desktopBridge } from '#filesystem/desktop-bridge.js';

/** Product offerings executable by the active runtime host. */
export const availableKernelConfigurations = (): readonly KernelEntry[] => {
  const advertised = new Set(desktopBridge()?.runtimeKernelIds ?? []);
  if (picogkBrowserAssets()) {
    advertised.add('picogk');
  }
  return kernelConfigurations.filter((configuration) => {
    const required = 'requiresRuntimeKernelId' in configuration ? configuration.requiresRuntimeKernelId : undefined;
    return !required || advertised.has(required);
  });
};

/**
 * Kernels whose supplier is closed to routing on every plan: Zoo, while its cloud dispatch is closed (automatic kernel
 * selection blueprint D4). Zoo is also the only kernel a plan gates, so leaving it out keeps the list fail-closed on the
 * plan as well. AKS-4 replaces this with the client-visible supplier flag the change that opens dispatch flips.
 */
const supplierClosedKernels: ReadonlySet<KernelId> = new Set<KernelId>(['zoo']);

/** What this host can offer routing now: the kernels the runtime executes, less those whose supplier is closed. */
export const routingKernelProfile = (): KernelRoutingProfile => ({
  available: availableKernelConfigurations()
    .map(({ id }) => id)
    .filter((id) => !supplierClosedKernels.has(id)),
});

/** Whether one persisted catalog id is executable by this runtime. */
export const isKernelAvailable = (kernelId: string): boolean =>
  availableKernelConfigurations().some(({ id }) => id === kernelId);

/** Resolve the native runtime requirement declared by the product catalog for an entry path; none while there is no entry. */
export const nativeKernelRequirementForEntryPath = (
  entryPath: string | undefined,
):
  | {
      readonly configuration: KernelConfiguration;
      readonly runtimeKernelId: string;
    }
  | undefined => {
  const extension = entryPath?.split('.').at(-1)?.toLowerCase();
  const configuration = kernelConfigurations.find(
    ({ mainFile }) => extension !== undefined && mainFile.toLowerCase().endsWith(`.${extension}`),
  ) as KernelConfiguration | undefined;
  if (!configuration?.requiresRuntimeKernelId) {
    return undefined;
  }
  return { configuration, runtimeKernelId: configuration.requiresRuntimeKernelId };
};
