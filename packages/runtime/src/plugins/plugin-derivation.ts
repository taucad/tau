import type {
  CollectExportFormats,
  CollectKernelExtensions,
  CollectTranscoderTargets,
  KernelPlugin,
  TranscoderPlugin,
} from '#plugins/plugin-types.js';

type AnyKernelPlugin = KernelPlugin<Record<string, unknown>, unknown>;
type AnyTranscoderPlugin = TranscoderPlugin<Record<string, unknown>>;

type StaticRuntimeDefinition<
  Kernels extends readonly AnyKernelPlugin[] = readonly AnyKernelPlugin[],
  Transcoders extends readonly AnyTranscoderPlugin[] = readonly AnyTranscoderPlugin[],
> = {
  readonly kernels: Kernels;
  readonly transcoders: Transcoders;
};

type ExplicitImportExtension<Kernels extends readonly AnyKernelPlugin[]> = Exclude<
  CollectKernelExtensions<Kernels>,
  '*'
>;

type ReachableExportTarget<
  Kernels extends readonly AnyKernelPlugin[],
  Transcoders extends readonly AnyTranscoderPlugin[],
> = CollectExportFormats<Kernels> | CollectTranscoderTargets<Transcoders>;

/**
 * Derive the ordered union of explicit kernel import extensions.
 *
 * @param runtime - Static runtime definition returned by `defineRuntime`.
 * @returns Deduplicated extensions in runtime registration order, excluding `*`.
 * @public
 */
export function deriveImportExtensions<
  const Kernels extends readonly AnyKernelPlugin[],
  const Transcoders extends readonly AnyTranscoderPlugin[],
>(runtime: StaticRuntimeDefinition<Kernels, Transcoders>): ReadonlyArray<ExplicitImportExtension<Kernels>>;
/** @public */
export function deriveImportExtensions(runtime: StaticRuntimeDefinition): readonly string[] {
  const extensions = new Set<string>();
  for (const kernel of runtime.kernels) {
    for (const extension of kernel.extensions) {
      if (extension !== '*') {
        extensions.add(extension);
      }
    }
  }
  return [...extensions];
}

/**
 * Derive direct and single-hop export targets using worker-manifest ordering.
 *
 * @param runtime - Static runtime definition returned by `defineRuntime`.
 * @returns Deduplicated reachable export formats.
 * @public
 */
export function deriveExportTargets<
  const Kernels extends readonly AnyKernelPlugin[],
  const Transcoders extends readonly AnyTranscoderPlugin[],
>(runtime: StaticRuntimeDefinition<Kernels, Transcoders>): ReadonlyArray<ReachableExportTarget<Kernels, Transcoders>>;
/** @public */
export function deriveExportTargets(runtime: StaticRuntimeDefinition): readonly string[] {
  const { kernels, transcoders } = runtime;
  const kernelFormats = kernels.flatMap((kernel) => kernel.exportFormats ?? []);
  const targets = new Set(kernelFormats);
  const sourceFormats = new Set(kernelFormats);
  for (const transcoder of transcoders) {
    for (const edge of transcoder.edges ?? []) {
      if (sourceFormats.has(edge.from)) {
        targets.add(edge.to);
      }
    }
  }
  return [...targets];
}
