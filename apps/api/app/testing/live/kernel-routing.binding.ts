import { sourcePathMatchesExtensions } from '@taucad/runtime';
import { isKernelId } from '@taucad/types/constants';
import type { KernelId } from '@taucad/types/constants';

/**
 * The binding helper of the automatic kernel selection eval (blueprint AKS-3a, Appendix E): which kernel a written
 * entry file binds, decided the way the runtime's first selection pass decides it (extension, then the kernel's import
 * pattern on the entry alone), so an in-turn run can stop at the write. The runtime's second pass is bundler-assisted
 * and transitive (`kernel-runtime-worker.ts`, `selectKernel`); an entry it would need is `undecided` here and runs on
 * to its first `evaluate_model`.
 *
 * The kernel rows come from a resolved runtime (`resolveRuntimeDefinition`), so their extensions, patterns and
 * precedence are the runtime's own, never restated.
 */

/** One kernel row of a resolved runtime, as the worker reads it. */
export type BindingKernelRow = {
  readonly id: string;
  readonly extensions: readonly string[];
  readonly detectImport?: RegExp | Readonly<{ source: string; flags: string }>;
  readonly builtinModuleNames?: readonly string[];
};

/**
 * The first pass's answer. `bound` names the runtime kernel and, when it authors models, its catalog kernel; `undecided`
 * means only the transitive pass can bind it; `unbound` means no kernel claims the extension.
 */
export type EntryBinding =
  | {
      readonly kind: 'bound';
      readonly runtimeKernel: string;
      readonly kernel: KernelId | undefined;
      readonly method: 'extension' | 'regex';
    }
  | { readonly kind: 'undecided'; readonly candidates: readonly string[] }
  | { readonly kind: 'unbound' };

/** Runtime kernel ids that differ from their catalog id. Every other authoring kernel shares its id. */
const catalogIdByRuntimeId: Readonly<Record<string, KernelId>> = {
  openrscad: 'openscad',
  opencascade: 'opencascadejs',
};

/**
 * The catalog kernel a runtime kernel authors, or undefined for an import-only kernel (gltf, brep, assimp).
 *
 * @param runtimeKernel - A runtime kernel id.
 * @returns Its catalog id.
 */
export const catalogKernelOf = (runtimeKernel: string): KernelId | undefined =>
  catalogIdByRuntimeId[runtimeKernel] ?? (isKernelId(runtimeKernel) ? runtimeKernel : undefined);

const patternOf = (detect: NonNullable<BindingKernelRow['detectImport']>): RegExp =>
  detect instanceof RegExp ? detect : new RegExp(detect.source, detect.flags);

/**
 * Bind an entry the way the runtime's first pass does.
 *
 * @param input - The entry's path and text and the runtime's kernel rows in precedence order.
 * @returns The binding.
 */
export const bindEntryFirstPass = (input: {
  readonly entryPath: string;
  readonly source: string;
  readonly kernels: readonly BindingKernelRow[];
}): EntryBinding => {
  const hasBundlerKernels = input.kernels.some(({ builtinModuleNames }) => (builtinModuleNames?.length ?? 0) > 0);
  const candidates: string[] = [];
  for (const row of input.kernels) {
    if (!sourcePathMatchesExtensions(input.entryPath, row.extensions)) {
      continue;
    }
    if (row.extensions.includes('*') && hasBundlerKernels) {
      candidates.push(row.id);
      continue;
    }
    if (!row.detectImport) {
      return { kind: 'bound', runtimeKernel: row.id, kernel: catalogKernelOf(row.id), method: 'extension' };
    }
    if (patternOf(row.detectImport).test(input.source)) {
      return { kind: 'bound', runtimeKernel: row.id, kernel: catalogKernelOf(row.id), method: 'regex' };
    }
    candidates.push(row.id);
  }
  return candidates.length > 0 ? { kind: 'undecided', candidates } : { kind: 'unbound' };
};
