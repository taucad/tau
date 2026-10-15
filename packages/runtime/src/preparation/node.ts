/* oxlint-disable no-barrel-files/no-barrel-files -- public preparation/node subpath */
// The preparation host (API 4) for Node hosts: the `tau-plugin.json` v1 contract, host indicators and variant
// selection, the digest-keyed payload store, and the managed profile. `tau mcp`, `tau export`, `tau prepare`, the
// daemon parent and the desktop main process compose it; the sandboxed worker never does.
export { computeClosureIntegrity, computeTreeIntegrity } from '#preparation/closure-receipt.js';
export { detectHostIndicators } from '#preparation/host-indicators.js';
export { describeEffectiveProfile, readManagedPreparation } from '#preparation/managed-environment.js';
export { parsePluginDeployment, targetKey, wheelDataDestination } from '#preparation/plugin-deployment.js';
export { PreparationError } from '#preparation/preparation-error.js';
export type { PreparationErrorOptions } from '#preparation/preparation-error.js';
export { createPreparationHost } from '#preparation/preparation-host.js';
export { readStoreGeneration } from '#preparation/preparation-store.js';
export { selectVariant } from '#preparation/select-variant.js';
export { missingSystemLibrary, systemLibraryRefusal } from '#preparation/system-library.js';
export type {
  AcquisitionProfile,
  ClosureDescription,
  ClosureVerification,
  CollectGarbageInput,
  CreatePreparationHostOptions,
  EffectiveProfile,
  GarbageReport,
  ManagedPreparation,
  PluginPreparation,
  PluginSelection,
  PreparationBlockedReason,
  PreparationHost,
  PreparationPlugin,
  PreparationState,
  PrepareInput,
  PrepareOutcome,
  SelectVariantOptions,
  VariantSelection,
  VerifyInput,
} from '#preparation/preparation-host.types.js';
export type {
  ClosureReceipt,
  DependencyPayload,
  DependencyTarget,
  DependencyVariant,
  HostIndicators,
  Integrity,
  KernelDeployment,
  PayloadAcquisition,
  PayloadFormat,
  PayloadOrigin,
  PluginDeployment,
  PreparationErrorCode,
  ReceiptFile,
  VariantAxis,
} from '#preparation/preparation.types.js';
