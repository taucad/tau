import { z } from 'zod';
import { projectPathSchema, workbenchViewSchema } from '@taucad/workbench';

// Source-only spike. These fields deliberately mirror StudioLightingSettings in
// the existing Three.js lighting owner; no package may import apps/ui.
export const sceneLightingSchema = z.strictObject({
  environment: z.enum(['studio', 'room', 'white', 'none']).default('room'),
  ambientIntensity: z.number().min(0).max(100).default(0.1),
  headlampIntensity: z.number().min(0).max(100).default(1.5),
  environmentIntensity: z.number().min(0).max(100).default(1),
  keyIntensity: z.number().min(0).max(100).default(64),
  keySize: z.number().positive().max(100).default(1.2),
  fillIntensity: z.number().min(0).max(100).default(1),
  backgroundIntensity: z.number().min(0).max(100).default(0),
  exposure: z.number().positive().max(100).default(1),
});

// The canonical camera/grid/axes/section grammar stays owned by workbench.
// The production codec remains unchanged and will reject spike-only fields.
export const sceneViewSchema = workbenchViewSchema.extend({
  lighting: sceneLightingSchema.prefault({}),
  assetDirectory: projectPathSchema,
});
/** Source-only scene view extension; production view grammar remains unchanged. */
export type SceneView = z.output<typeof sceneViewSchema>;
