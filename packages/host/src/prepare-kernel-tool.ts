/**
 * `prepare_kernel`: the one tool that downloads (D7).
 *
 * Every CAD tool stays read-only and never downloads: a file whose native kernel is not prepared answers
 * `KERNEL_NOT_PREPARED`, naming this tool and its input. This tool prepares the kernel's runtime closure (an
 * interpreter and wheels, or a .NET runtime) into the payload store every Tau host on the computer shares, in the
 * host process, with best-effort progress; the client's approval of the call is the consent (Q31).
 *
 * @module
 */
import type { JsonObject } from '@taucad/agent-host';

/** The tool's name. @public */
export const prepareKernelToolName = 'prepare_kernel';

/** A kernel `prepare_kernel` takes, as a native kernel package's `tau-plugin.json` declares it. */
type PreparableKernel = { readonly kernel: string; readonly extensions: readonly string[] };

const kernelList = (kernels: readonly PreparableKernel[]): string =>
  kernels
    .map(({ kernel, extensions }) => `${kernel} for ${extensions.map((extension) => `.${extension}`).join(', ')}`)
    .join(', ');

/**
 * What the model reads about `prepare_kernel`.
 * @param kernels - The kernels the host can prepare, from the native deployments its runtime lists; empty names none.
 * @returns The tool description.
 * @public
 */
export const prepareKernelDescription = (kernels: readonly PreparableKernel[]): string =>
  `Download, verify and unpack a native CAD kernel's runtime into this computer's shared payload store, so Tau can evaluate its files${kernels.length === 0 ? '' : `: ${kernelList(kernels)}`}. Call it when a tool answers KERNEL_NOT_PREPARED, with the kernel that answer names, then repeat the call that refused. It downloads only pinned, digest-checked files, can take several minutes, and reports progress. A cancelled or failed call keeps every verified file, so the next call downloads only the rest; a prepared kernel answers ready at once.`;

/**
 * Its input schema, as the registry publishes it.
 * @param kernels - The kernels the host can prepare, named as examples; empty names none.
 * @returns The JSON schema.
 * @public
 */
export const prepareKernelInputSchema = (kernels: readonly PreparableKernel[]): JsonObject => ({
  type: 'object',
  properties: {
    kernel: {
      type: 'string',
      minLength: 1,
      description: `The kernel to prepare, as the KERNEL_NOT_PREPARED answer names it${kernels.length === 0 ? '' : `, such as ${kernels.map(({ kernel }) => kernel).join(' or ')}`}.`,
    },
  },
  required: ['kernel'],
  additionalProperties: false,
});
