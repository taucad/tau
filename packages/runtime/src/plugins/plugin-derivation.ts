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
  const kernelFormats = kernels.flatMap((kernel) =>
    Object.values(kernel.exports ?? {}).map((declaration) => declaration.extension),
  );
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

/**
 * Derive the source formats that the registered transcoders convert directly to one target format.
 *
 * A host uses it to admit exactly the formats its runtime can convert, for example every image format with an
 * edge to `jpeg`, instead of keeping a second list that drifts from the registered edges.
 *
 * @param runtime - Static runtime definition returned by `defineRuntime`.
 * @param to - The target format.
 * @returns Deduplicated `from` formats of every edge to `to`, in registration order. Empty when nothing converts
 * to `to`.
 * @public
 */
export function deriveTranscodeSources<
  const Transcoders extends readonly AnyTranscoderPlugin[],
  const To extends CollectTranscoderTargets<Transcoders>,
>(runtime: { readonly transcoders: Transcoders }, to: To): readonly string[];
/** @public */
export function deriveTranscodeSources(
  runtime: { readonly transcoders: readonly AnyTranscoderPlugin[] },
  to: string,
): readonly string[] {
  const sources = new Set<string>();
  for (const transcoder of runtime.transcoders) {
    for (const edge of transcoder.edges ?? []) {
      if (edge.to === to) {
        sources.add(edge.from);
      }
    }
  }
  return [...sources];
}
