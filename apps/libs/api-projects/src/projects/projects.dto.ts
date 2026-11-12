import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** `PUT /v1/projects/:projectId` — what a client knows when it connects (P51). */
export const registerProjectSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  /**
   * Where the project's history comes from, recorded when the row is created:
   * `github` for a project linked to a GitHub repository, whose commits Tau did
   * not record and which the push's authorship check then admits (B4).
   */
  origin: z.enum(['local-mirror', 'github']).optional(),
});
export class RegisterProjectDto extends createZodDto(registerProjectSchema) {}
