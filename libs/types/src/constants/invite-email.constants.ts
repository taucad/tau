/**
 * Why an invite email was not sent, as the API reports it to the client so the
 * Share pane never claims an email that did not go out.
 *
 * - `daily_cap`: the owner is over the daily invite-email budget.
 * - `limiter_unavailable`: the budget could not be checked, so the email was dropped (fail closed).
 * - `email_disabled`: the deployment has no email provider configured.
 * - `undeliverable`: the address is on the suppression list (bounced, reported or suppressed).
 * - `send_failed`: the provider refused or failed the send.
 *
 * @public
 */
export const inviteEmailSkipReasons = [
  'daily_cap',
  'limiter_unavailable',
  'email_disabled',
  'undeliverable',
  'send_failed',
] as const;

/** @public */
export type InviteEmailSkipReason = (typeof inviteEmailSkipReasons)[number];

/**
 * The skip reasons a collaborator invite can report. Collaborator invites have
 * their own fail-closed budget, checked before the invitation exists, so the
 * budget reasons never reach an emailed invitation.
 *
 * @public
 */
export const collaboratorInviteEmailSkipReasons = [
  'email_disabled',
  'undeliverable',
  'send_failed',
] as const satisfies readonly InviteEmailSkipReason[];

/** @public */
export type CollaboratorInviteEmailSkipReason = (typeof collaboratorInviteEmailSkipReasons)[number];

/**
 * What happened to the email of one link invite (`POST /v1/projects/:id/share/access`).
 * `not_requested` means the caller asked for no email, or the address already had access.
 *
 * @public
 */
export type InviteEmailOutcome =
  | { readonly status: 'sent' }
  | { readonly status: 'skipped'; readonly reason: InviteEmailSkipReason }
  | { readonly status: 'not_requested' };

/**
 * What happened to the email of one collaborator invite
 * (`POST /v1/projects/:projectId/collaborators`, field `emailDelivery`).
 *
 * @public
 */
export type CollaboratorInviteEmailDelivery =
  | { readonly status: 'sent' }
  | {
      readonly status: 'skipped';
      readonly reason: CollaboratorInviteEmailSkipReason;
    };
