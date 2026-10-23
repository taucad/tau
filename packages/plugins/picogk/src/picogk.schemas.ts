import { dotnetKernelOptionsSchema } from '@taucad/dotnet-kernel-core/adopter';
import { gltfExportConventionSchema } from '@taucad/runtime/kernel';
import { z } from 'zod';

/**
 * Host-owned resources required by the sandboxed native PicoGK kernel: the options every .NET kernel takes.
 * @public
 */
// oxlint-disable-next-line unicorn-js/prefer-export-from -- `no-barrel-files` forbids the re-export form outside index.ts.
export const picogkOptionsSchema = dotnetKernelOptionsSchema;

/**
 * Construction options for views. The defaults build today's uniform mesh, so a view that sends no options
 * renders exactly as before.
 *
 * @public
 */
export const picogkRenderSchema = z.object({
  meshAdaptivity: z
    .number()
    .min(0)
    .lt(1)
    .default(0)
    .describe(
      'OpenVDB mesh adaptivity in [0, 1) for the displayed Voxels: 0 (default) is the uniform marching-cubes mesh; higher values merge flat regions into fewer, larger triangles. It changes only the display mesh, never the voxels, and exports always mesh at 0.',
    ),
  meshRelax: z
    .boolean()
    .default(false)
    .describe('Relax disoriented triangles of an adaptive mesh (meshAdaptivity above 0). Default false.'),
});

/** PicoGK view construction options. @public */
export type PicogkRenderOptions = z.output<typeof picogkRenderSchema>;

// Exports always mesh uniformly: a view's adaptivity never reaches an exported file.
const exportMeshingSchema = z.object({
  meshAdaptivity: z.literal(0).default(0).describe('Exports always use the uniform mesh (0).'),
  meshRelax: z.literal(false).default(false).describe('Exports never relax the mesh.'),
});

/** Direct export formats implemented by the PicoGK kernel; each pins the uniform mesh. @public */
export const picogkExportSchemas = {
  glb: exportMeshingSchema.extend(gltfExportConventionSchema.shape),
  gltf: exportMeshingSchema.extend(gltfExportConventionSchema.shape),
} as const satisfies Record<string, z.ZodType>;
