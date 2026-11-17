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

/**
 * `PATCH /v1/projects/:projectId/collaborators/:email` — the role alone.
 *
 * The address is in the path because it is what is being changed, not part of
 * the change; only the role is a body field, so a request cannot quietly move a
 * grant from one address to another.
 */
export const setCollaboratorRoleSchema = z.object({
  role: z.enum(['read', 'write']),
});
export class SetCollaboratorRoleDto extends createZodDto(setCollaboratorRoleSchema) {}

/**
 * `POST /v1/invitations/accept` — the token from the invitation link.
 *
 * The token is a bearer credential, so it travels in the body and never in the
 * path: request lines reach access logs, proxies and traces, and bodies do not
 * (#2290). It is 32 random bytes in base64url, so anything longer is not one.
 */
export const acceptInvitationSchema = z.object({
  token: z.string().min(1).max(128),
});
export class AcceptInvitationDto extends createZodDto(acceptInvitationSchema) {}
