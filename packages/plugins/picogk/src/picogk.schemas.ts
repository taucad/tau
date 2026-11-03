import { dotnetKernelOptionsSchema } from '@taucad/dotnet-kernel-core/adopter';

/**
 * Host-owned resources required by the sandboxed native PicoGK kernel: the options every .NET kernel takes.
 * @public
 */
// oxlint-disable-next-line unicorn-js/prefer-export-from -- `no-barrel-files` forbids the re-export form outside index.ts.
export const picogkOptionsSchema = dotnetKernelOptionsSchema;
