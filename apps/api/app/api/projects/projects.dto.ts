import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** `PUT /v1/projects/:projectId` — what a client knows when it connects (P51). */
export const registerProjectSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
});
export class RegisterProjectDto extends createZodDto(registerProjectSchema) {}
