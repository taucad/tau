import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** `POST /v1/projects/:projectId/collaborators` — who is being invited, and as what (D27). */
export const inviteCollaboratorSchema = z.object({
  /* Normalized at the boundary, the way `publications.dto.ts` normalizes a
     private-share address: the database's lowercase check rejects anything else. */
  email: z.string().trim().toLowerCase().pipe(z.email().max(320)),
  /* `read` and `write` are the two roles the requirement names; the owner is
     implicit and is never a value a request can ask for. */
  role: z.enum(['read', 'write']),
});
export class InviteCollaboratorDto extends createZodDto(inviteCollaboratorSchema) {}
