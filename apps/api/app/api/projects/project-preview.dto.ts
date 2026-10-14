import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** A catalog image is bounded separately from optional generated exports. */
export const projectPreviewMaximumBytes = 256 * 1024;
export const projectPreviewSchema = z.object({
  image: z
    .string()
    .min(1)
    .max(Math.ceil(projectPreviewMaximumBytes / 3) * 4)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/u),
});
export class ProjectPreviewDto extends createZodDto(projectPreviewSchema) {}
