import { useMemo } from 'react';
import type { KernelRoutingProfile } from '@taucad/chat/prompts';
import { routingKernelProfile } from '#constants/available-kernel-configurations.js';
import { useKernelRoutingPlan } from '#cloud/kernel-commerce.js';
import { useFeature } from '#flags/use-feature.js';

/**
 * The host's routing profile from its three entitlement facts: runtime, plan (fail-closed) and supplier.
 *
 * @returns The kernels routing may offer here.
 */
export const useRoutingKernelProfile = (): KernelRoutingProfile => {
  const isPlanAllowed = useKernelRoutingPlan();
  const isSupplierOpen = useFeature('zooCloudDispatch');
  return useMemo(() => routingKernelProfile({ isPlanAllowed, isSupplierOpen }), [isPlanAllowed, isSupplierOpen]);
};
