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
 * Balanced adaptivity: what a view that sets no `meshAdaptivity` asks the worker for. A worker that cannot mesh
 * adaptively answers it with the uniform mesh; an explicit value is never downgraded.
 * @internal
 */
export const picogkPreviewAdaptivity = 0.25;

/**
 * Construction options for builds. A view may set them (the viewer's Kernel settings offer them), and the runtime then
 * renders that view from a build of its own. An unset `meshAdaptivity` stays absent after parsing, so the kernel can
 * tell the default from an explicit request: it asks for {@link picogkPreviewAdaptivity} and accepts the uniform mesh
 * from a worker that predates adaptive meshing, while an explicit adaptive request to such a worker is refused.
 *
 * @public
 */
export const picogkRenderSchema = z.object({
  meshAdaptivity: z
    .number()
    .min(0)
    .lt(1)
    .optional()
    .meta({
      description:
        'OpenVDB mesh adaptivity in [0, 1) for the displayed Voxels: 0 is the uniform marching-cubes mesh; higher values merge flat regions into fewer, larger triangles. It changes only the mesh, never the voxels. Unset, a view meshes at 0.25 (Balanced) where the PicoGK runtime meshes adaptively and uniformly where it does not; the tessellation report says which. An explicit value above 0 on a runtime that cannot mesh adaptively is refused. Exports take their own meshAdaptivity, 0 unless set.',
      examples: [picogkPreviewAdaptivity],
    }),
  meshRelax: z
    .boolean()
    .default(false)
    .describe('Relax disoriented triangles of an adaptive mesh (meshAdaptivity above 0). Default false.'),
});

/** PicoGK view construction options. @public */
export type PicogkRenderOptions = z.output<typeof picogkRenderSchema>;

// Exports mesh uniformly unless they ask otherwise: a view's adaptivity never reaches an exported file.
const exportMeshingSchema = z.object({
  meshAdaptivity: z
    .number()
    .min(0)
    .lt(1)
    .default(0)
    .describe(
      'OpenVDB mesh adaptivity in [0, 1) for the exported mesh. Default 0, the uniform marching-cubes mesh, whatever the view shows; above 0 merges flat regions into fewer, larger triangles and is refused on a PicoGK runtime that cannot mesh adaptively.',
    ),
  meshRelax: z
    .boolean()
    .default(false)
    .describe('Relax disoriented triangles of an adaptive exported mesh (meshAdaptivity above 0). Default false.'),
});

/** Direct export formats implemented by the PicoGK kernel; each meshes uniformly unless it sets `meshAdaptivity`. @public */
export const picogkExportSchemas = {
  glb: exportMeshingSchema.extend(gltfExportConventionSchema.shape),
  gltf: exportMeshingSchema.extend(gltfExportConventionSchema.shape),
} as const satisfies Record<string, z.ZodType>;
