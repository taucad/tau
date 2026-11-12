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

/** Kernels whose supplier must be open before routing may offer them: Zoo runs on Zoo's cloud engine. */
const supplierKernels: ReadonlySet<KernelId> = new Set<KernelId>(['zoo']);

/**
 * What this host can offer routing now (automatic kernel selection blueprint D4): the three entitlement facts, each
 * failing closed. The runtime executes the kernel; the plan, once resolved, allows it; and a kernel that runs on a
 * supplier's engine is offered only while that supplier is open (the `zooCloudDispatch` flag).
 *
 * @param facts - The plan fact (fail-closed) and whether Zoo's cloud dispatch is open.
 * @returns The routing profile, in catalog order.
 */
export const routingKernelProfile = (
  facts: Readonly<{ isPlanAllowed: (kernel: KernelId) => boolean; isSupplierOpen: boolean }>,
): KernelRoutingProfile => ({
  available: availableKernelConfigurations()
    .map(({ id }) => id)
    .filter((id) => facts.isPlanAllowed(id) && (facts.isSupplierOpen || !supplierKernels.has(id))),
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
