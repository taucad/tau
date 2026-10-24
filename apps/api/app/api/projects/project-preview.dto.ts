import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { projectPreviewMaximumBytes } from '#api/projects/project-preview-key.js';

export const projectPreviewSchema = z.object({
  image: z
    .string()
    .min(1)
    .max(Math.ceil(projectPreviewMaximumBytes / 3) * 4)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/u),
});
export class ProjectPreviewDto extends createZodDto(projectPreviewSchema) {}
