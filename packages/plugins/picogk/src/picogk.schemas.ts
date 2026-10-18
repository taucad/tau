import { dotnetKernelOptionsSchema } from '@taucad/dotnet-kernel-core/adopter';
import { gltfExportConventionSchema } from '@taucad/runtime/kernel';
import type { z } from 'zod';

/**
 * Host-owned resources required by the sandboxed native PicoGK kernel: the options every .NET kernel takes.
 * @public
 */
// oxlint-disable-next-line unicorn-js/prefer-export-from -- `no-barrel-files` forbids the re-export form outside index.ts.
export const picogkOptionsSchema = dotnetKernelOptionsSchema;

/** Direct export formats implemented by the PicoGK kernel. @public */
export const picogkExportSchemas = {
  glb: gltfExportConventionSchema,
  gltf: gltfExportConventionSchema,
} as const satisfies Record<string, z.ZodType>;
