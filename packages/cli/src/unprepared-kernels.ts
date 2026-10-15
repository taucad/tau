/**
 * The stand-in a CLI runtime composes for a native kernel that cannot run here yet (D7).
 *
 * A native kernel whose closure is not in the payload store is not composed, so a `.py` or `.cs` file would meet the
 * runtime's generic "no kernel handles this extension". This plugin claims the extension instead and answers every
 * operation with the one typed refusal: `KERNEL_NOT_PREPARED`, naming the kernel, its package, the bytes preparing
 * downloads and the exact call that prepares it; or, on a host the kernel declares no runtime for,
 * `KERNEL_CAPABILITY_MISSING` with the reason. It downloads nothing and starts no process, so evaluate, export,
 * screenshot, test and the parameter tools all refuse the same way (I5).
 *
 * @module
 */
import { createKernelError, defineKernel } from '@taucad/runtime/kernel';
import type { KernelIssue } from '@taucad/runtime/kernel';
import { definePlugin } from '@taucad/runtime/plugin';
import type { PluginInstance } from '@taucad/runtime/plugin';

/** A native kernel the CLI declares but cannot compose on this machine, as the runtime worker receives it. */
export type UnavailableNativeKernel = {
  /** Kernel name, as `tau prepare` and `prepare_kernel` take it (`build123d`, `picogk`). */
  readonly kernel: string;
  /** The npm package whose `tau-plugin.json` declares it. */
  readonly package: string;
  /** Extensions it handles, without the dot. */
  readonly extensions: readonly string[];
  /** `not-prepared`: preparing fixes it. `unsupported-target`: the package declares no runtime for this host. */
  readonly reason: 'not-prepared' | 'unsupported-target';
  /** Bytes preparing downloads on this host: the selected variants' payloads. Zero when unsupported. */
  readonly byteLength: number;
  /** For `unsupported-target`, the preparation host's own explanation. */
  readonly detail?: string;
};

const megabytes = (byteLength: number): string => `${String(Math.round(byteLength / 1e6))} MB`;

const extensionOf = (entryPath: string): string => {
  const dot = entryPath.lastIndexOf('.');
  return dot === -1 ? '' : entryPath.slice(dot);
};

/**
 * The issue one operation on an unavailable native kernel's file answers.
 * @param row - What the parent composed for the kernel: its name, package, extensions, reason and download size.
 * @param entryPath - The project file the operation names; its extension is quoted back.
 * @returns `KERNEL_NOT_PREPARED`, or `KERNEL_CAPABILITY_MISSING` on a host the kernel declares no runtime for.
 */
export const unavailableKernelIssue = (row: UnavailableNativeKernel, entryPath: string): KernelIssue => {
  const extension = extensionOf(entryPath);
  if (row.reason === 'unsupported-target') {
    return {
      code: 'KERNEL_CAPABILITY_MISSING',
      type: 'kernel',
      severity: 'error',
      message: `${row.kernel} handles "${extension}" but cannot run on this machine. ${row.detail ?? ''}`.trimEnd(),
      details: { kernel: row.kernel, package: row.package, extension, reason: row.reason },
    };
  }
  return {
    code: 'KERNEL_NOT_PREPARED',
    type: 'kernel',
    severity: 'error',
    message:
      `${row.kernel} handles "${extension}" but its runtime (${megabytes(row.byteLength)}) is not prepared on this machine. ` +
      `Call prepare_kernel with { "kernel": "${row.kernel}" } (or run \`tau prepare ${row.kernel}\`), then evaluate again.`,
    details: {
      kernel: row.kernel,
      package: row.package,
      extension,
      byteLength: row.byteLength,
      prepare: { tool: 'prepare_kernel', input: { kernel: row.kernel } },
    },
  };
};

/** An error carrying kernel issues on `.issues`, which the runtime reports verbatim. */
class UnavailableKernelError extends Error {
  public readonly issues: KernelIssue[];

  public constructor(issue: KernelIssue) {
    super(issue.message);
    this.issues = [issue];
    this.name = 'UnavailableKernelError';
  }
}

const unavailableKernel = (row: UnavailableNativeKernel) =>
  defineKernel({
    id: row.kernel,
    extensions: row.extensions,
    name: `${row.kernel} (unavailable)`,
    version: '0',
    views: {},
    exports: {},
    async initialize() {
      return undefined;
    },
    async resolve() {
      return { resolved: [], unresolved: [] };
    },
    async describe({ entryPath }) {
      return createKernelError([unavailableKernelIssue(row, entryPath)]);
    },
    async evaluate({ entryPath }) {
      throw new UnavailableKernelError(unavailableKernelIssue(row, entryPath));
    },
  });

/**
 * One plugin whose kernels stand in for every unavailable native kernel.
 * @param rows - The unavailable kernels; empty composes nothing.
 * @returns The plugin instance, or `undefined` when every native kernel is composed.
 */
export const unavailableKernelsPlugin = (rows: readonly UnavailableNativeKernel[]): PluginInstance | undefined => {
  if (rows.length === 0) {
    return undefined;
  }
  const plugin = definePlugin({
    meta: { name: '@taucad/cli/unavailable-kernels' },
    kernels: Object.fromEntries(rows.map((row) => [row.kernel, unavailableKernel(row)])),
    presets: { default: rows.map((row): `kernels.${string}` => `kernels.${row.kernel}`) },
  });
  return plugin();
};
