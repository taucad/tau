---
title: 'Better Auth Email + Resend Activation Blueprint'
description: 'Audit and implementation blueprint for activating Tau email auth flows with Resend: magic-link signups, email/password signup verification, forgot password, and private publication invite access.'
status: draft
created: '2026-06-01'
updated: '2026-06-01'
category: architecture
related:
  - docs/research/sharing-architecture.md
  - docs/research/publication-viewer-layout-blueprint.md
  - docs/research/stripe-better-auth-integration.md
---

# Better Auth Email + Resend Activation Blueprint

Investigate whether Tau already documents or implements Better Auth email activation through Resend, then blueprint the API + UI work needed for magic-link signups, forgot-password emails, and private publication sharing.

## Executive Summary

Tau already has Better Auth's email primitives structurally enabled: `emailAndPassword.enabled: true`, the `magicLink` plugin is registered on the API and UI client, and the UI contains sign-in, sign-up, magic-link, forgot-password, and reset-password views. The missing activation layer is outbound email: runtime Better Auth callbacks currently log magic-link, password-reset, and verification URLs instead of sending them, and no Resend dependency or environment contract exists.

The second gap is product-level rather than provider-level. Existing publication "private" visibility is owner-only; it does not yet support sharing privately with another recipient by email. Completing the auth story means adding a shared email delivery service first, then using it from Better Auth callbacks and a publication invitation/access-grant flow.

## Problem Statement

The goal is to support:

1. Magic-link signups and sign-ins.
2. Forgot-password/reset-password emails.
3. Publication sharing that can be private to invited recipients, including recipients who need to sign up from the lock screen or an invitation email.

The user specifically asked whether any `docs/research/` documents already discuss activating Better Auth email features via Resend, and asked to use Better Auth's email docs plus `llms.txt` to identify how sign-up-by-email should be activated in the Tau UI + API.

## Methodology

1. Searched `docs/research/`, `docs/policy/`, `apps/api`, `apps/ui`, `libs`, and package metadata for `better-auth`, `Resend`, `magic link`, `forgot password`, `sendResetPassword`, and email terms.
2. Read the project research-writing workflow in `.agent/skills/create-research/SKILL.md`.
3. Read Better Auth's current email concept documentation, `llms.txt`, magic-link plugin documentation, and email/password authentication documentation.
4. Read Resend's current Node.js and React Email integration documentation.
5. Audited Tau's Better Auth static/runtime config, UI auth provider/client, sign-in/sign-up/magic-link/forgot/reset components, auth links, publication lock screen, publish dialog, publication DTO/controller/service, and publication schema.
6. Cross-checked sharing research docs for private publication and chat-thread requirements.

## Findings

### Finding 1: Research docs mention Better Auth email as a product need, but not Resend activation

No existing research document discusses wiring Better Auth email callbacks to Resend. Relevant adjacent findings:

| Document                                               | Existing signal                                                                                                                                   | Gap                                                                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `docs/research/sharing-architecture.md`                | Recommends auth-required publishing and says Better Auth email-only signup is low-friction. It also recommends opt-in "publish with chat thread". | Does not specify email provider, Better Auth callback wiring, templates, or recipient invite flow. |
| `docs/research/stripe-better-auth-integration.md`      | Shows plugin sync discipline for `auth.ts` and `better-auth.config.ts`, including `magicLink({ sendMagicLink() { /* no-op */ } })`.               | Uses magic-link no-op only as an example while discussing Stripe, not email activation.            |
| `docs/research/publication-viewer-layout-blueprint.md` | Audits private publication lock-screen UX and view/fork counters.                                                                                 | Does not cover invitation emails or signup completion.                                             |

Conclusion: this document is the first Resend activation blueprint under `docs/research/`.

### Finding 2: Better Auth is structurally configured, but all runtime email callbacks are no-ops with logs

The static config registers the schema-affecting shape:

- `apps/api/app/config/auth.ts` imports `magicLink` from `better-auth/plugins`.
- `staticAuthConfig.plugins` includes `magicLink({ sendMagicLink() { /* No-op for mock configuration */ } })`.
- `emailAndPassword.enabled` is `true`.
- `emailAndPassword.autoSignIn` is `true`.
- `resetPasswordTokenExpiresIn` is one hour.

The runtime config mirrors the plugin count, but it only logs generated URLs:

- `apps/api/app/config/better-auth.config.ts` `magicLink.sendMagicLink({ email, url, token })` logs.
- `emailAndPassword.sendResetPassword({ user, url, token })` logs.
- `emailVerification.sendVerificationEmail({ user, url, token })` logs.

This means local manual testing can copy URLs from API logs, but production users never receive magic-link, reset-password, or verification emails.

### Finding 3: Better Auth docs map directly onto the needed Tau callbacks

Better Auth's current docs identify four relevant server hooks/options:

| Capability                        | Better Auth surface                                                                                                                                         | Tau current state                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Magic-link signup/sign-in         | `magicLink({ sendMagicLink })`; `disableSignUp` defaults to false, so unknown emails are signed up automatically.                                           | Plugin exists server and client; sender only logs.                                        |
| Password reset                    | `emailAndPassword.sendResetPassword`; client calls `requestPasswordReset({ email, redirectTo })`; reset page calls `resetPassword({ token, newPassword })`. | Server hook logs; UI forgot form exists but does not pass an explicit reset `redirectTo`. |
| Email verification                | `emailVerification.sendVerificationEmail`; `sendOnSignUp`, `sendOnSignIn`, `autoSignInAfterVerification`; `emailAndPassword.requireEmailVerification`.      | Hook logs; `sendOnSignUp` and `requireEmailVerification` are not enabled.                 |
| Existing-user signup notification | `emailAndPassword.onExistingUserSignUp`, useful when `requireEmailVerification` prevents enumeration.                                                       | Not configured.                                                                           |

Important Better Auth docs constraints:

- The email callbacks receive generated `url` values that should be sent to users.
- Docs recommend not awaiting mail delivery in the auth callback to avoid timing leaks; in Tau's long-lived Nest/Fastify API, we can still call an internal mail service asynchronously, but endpoint latency and error disclosure must be designed carefully.
- Magic-link tokens are single-use; Better Auth's docs call out atomic consumption. Tau should keep verification records in Postgres unless/until secondary storage is designed with `GETDEL`-style atomicity.

### Finding 4: Resend is not yet an installed dependency or environment concept

Search results found no `resend` package in `package.json`/`pnpm-lock.yaml`, no `RESEND_API_KEY`, no sender-domain variables, and no email service module in `apps/api`.

Current environment config includes auth, OAuth, Redis, and object storage variables, but no email delivery variables:

- `apps/api/app/config/environment.config.ts`
- `apps/api/.env.example`
- `apps/api/fly.staging.toml`
- `apps/api/fly.prod.toml`

Resend's Node.js docs require:

- installing the `resend` SDK,
- creating an API key,
- verifying a sending domain before sending to normal recipients,
- calling `resend.emails.send({ from, to, subject, html/text/react })`.

For Tau, the minimal environment contract should be:

| Variable             | Purpose                    | Example                                                                  |
| -------------------- | -------------------------- | ------------------------------------------------------------------------ |
| `RESEND_API_KEY`     | Secret API key.            | Fly secret only.                                                         |
| `TAU_EMAIL_FROM`     | Auth transactional sender. | Dev/staging: `Tau <identity@taucad.dev>`; prod: `Tau <identity@tau.new>` |
| `TAU_EMAIL_REPLY_TO` | Support/reply address.     | Dev/staging: `identity@taucad.dev`; prod: `identity@tau.new`             |

Use explicit environment discriminators where needed; avoid an `is_prod` boolean. The dev/staging sender identity is `identity@taucad.dev`; production remains `identity@tau.new`.

### Finding 5: UI auth screens already exist, but password reset needs an explicit redirect target

The UI has:

- `apps/ui/app/components/auth/magic-link.tsx`
- `apps/ui/app/components/auth/sign-up.tsx`
- `apps/ui/app/components/auth/forgot-password.tsx`
- `apps/ui/app/components/auth/reset-password.tsx`
- `apps/ui/app/providers/auth-provider.tsx`
- `apps/ui/app/lib/auth-client.ts`

The magic-link view calls:

```ts
signInMagicLink({ email, callbackURL: `${baseURL}${redirectTo}` });
```

That is enough for magic-link signin/signup once the API sends the email, because the Better Auth magic-link plugin signs up unknown users unless `disableSignUp` is true.

The forgot-password form calls:

```ts
requestPasswordReset({
  email: formData.get('email') as string,
  fetchOptions,
});
```

Better Auth's docs show `redirectTo` as the reset page URL. Tau should pass:

```ts
requestPasswordReset({
  email,
  redirectTo: `${baseURL}${basePaths.auth}/${viewPaths.auth.resetPassword}`,
  fetchOptions,
});
```

This keeps the server-generated reset URL landing on Tau's existing `ResetPassword` component with a `token` query parameter.

### Finding 6: Email/password signup is enabled, but verified-email signup is not active

Tau already has a conventional `/auth/sign-up` email/password form through Better Auth UI and `authClient.signUp.email`. However, `staticAuthConfig.emailAndPassword.autoSignIn` is `true`, and `requireEmailVerification` is not set. That means email/password signup can create a session immediately without proving mailbox ownership.

There are two viable modes:

| Mode                    | Behavior                                                                                                                                                                                          | Fit                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Passwordless-first      | Keep email/password available, but make magic link the prominent low-friction path. Unknown users can sign up through magic link.                                                                 | Best for private share recipients.                                 |
| Verified email/password | Set `emailVerification.sendOnSignUp: true`, `emailVerification.sendOnSignIn: true`, `emailVerification.autoSignInAfterVerification: true`, and `emailAndPassword.requireEmailVerification: true`. | Best for account integrity, avoids unverified accounts publishing. |

Recommendation: use verified email/password plus passwordless-first UI. Magic links prove mailbox ownership by possession of the link; password accounts should also require verification before sign-in/publish-sensitive actions. Product decision: Tau remains passwordless-first, so private share entry points should prefer magic-link signup/sign-in over the password form.

### Finding 7: Private publication sharing needs access grants, not only email auth

Current publication visibility schema is `private | public`. The API enforces:

- `public`: anyone with the URL can view.
- `private`: only the owner session can view.

Evidence:

- `apps/api/app/api/publications/publications.dto.ts` `publicationVisibilitySchema = z.enum(['private', 'public'])`.
- `apps/api/app/database/schema.ts` `publication_visibility_check` allows only `private` and `public`.
- `apps/api/app/api/publications/publications.service.ts` rejects private publications unless `viewerUserId === publication.ownerId`.
- `apps/ui/app/routes/v.$id/publication-lock-screen.tsx` tells locked-out users: "Need access? Ask the owner to share with you."

This is correct for "private draft only I can open", but it cannot satisfy "share privately in chat" when the recipient is a different user. Email auth lets a recipient sign in; it does not grant them access.

Target model:

```sql
publication_access (
  id text primary key,
  publication_id text not null references publication(id) on delete cascade,
  invited_email text not null,
  invited_user_id text references "user"(id) on delete cascade,
  role text not null, -- 'viewer' initially
  invited_by_user_id text not null references "user"(id),
  invitation_token_hash text not null,
  accepted_at timestamp,
  revoked_at timestamp,
  created_at timestamp not null default now(),
  expires_at timestamp not null
)
```

Access check:

1. Owner always allowed.
2. Public always allowed.
3. Private allowed if `publication_access.invited_user_id = viewerUserId` and not revoked/expired.
4. Pending invited email can be accepted after the recipient signs up or signs in with an email matching `invited_email`.

This should be added before claiming private recipient sharing is complete. Product decision: MVP grants are only for specific email addresses, not domains, organizations, or wildcard groups.

### Finding 8: Publication invite email is a fourth email category

Better Auth covers auth lifecycle email, but publication sharing needs an application email:

- Subject: `{ownerName} shared "{publicationTitle}" with you on Tau`.
- CTA URL: `/v/:id?invite=<token>` or an API accept endpoint that redirects to `/v/:id`.
- If no session exists, the lock screen should offer magic-link sign-in and account creation with `redirectTo` preserving the invitation URL.
- On return, API resolves the token, binds `publication_access.invited_user_id`, and redirects to the viewer.

Do not put raw publication authorization in the magic-link metadata alone. The publication access grant should be a durable Tau-owned row with its own token, expiry, revoke path, and audit trail.

### Finding 9: Better Auth plugin sync remains a required migration guard

`apps/api/README.md` and `docs/research/stripe-better-auth-integration.md` both document the static/runtime plugin duplication pattern. Adding Resend does not add a Better Auth plugin, so it should not change plugin counts. But adding a future email-OTP plugin, organization invitations, or Better Auth Infra email service would require updating both:

- `apps/api/app/config/auth.ts`
- `apps/api/app/config/better-auth.config.ts`

For this blueprint, keep Resend as a Tau-owned `EmailService` injected into the runtime config. The static config remains provider-free and CLI-safe.

## Target Architecture

### API layers

```text
Better Auth callbacks
  ├─ magicLink.sendMagicLink
  ├─ emailAndPassword.sendResetPassword
  └─ emailVerification.sendVerificationEmail
        │
        ▼
EmailService interface
  ├─ sendAuthMagicLinkEmail
  ├─ sendPasswordResetEmail
  ├─ sendEmailVerificationEmail
  └─ sendPublicationInviteEmail
        │
        ▼
ResendEmailProvider
  ├─ enables delivery only when RESEND_API_KEY is present
  ├─ validates sender config
  ├─ renders template to html + text
  ├─ calls Resend SDK
  ├─ uses idempotency keys for retryable sends
  └─ logs provider message id without tokens
```

### Suggested file layout

```text
apps/api/app/email/
  email.module.ts
  email.service.ts
  email.types.ts
  email-templates.ts
  templates/
    shared.ts
```

Keep templates server-side and render every outbound email through React Email. Shared layout parts should live in `templates/shared.ts` so the Tau wordmark/header, CTA button, fallback-link block, footer, typography, spacing, and client-safe styling stay consistent across magic link, reset password, verification, and publication invite emails. Render both HTML and plain text before handing the message to Resend.

### Better Auth runtime wiring

`getBetterAuthConfig` currently receives `databaseService`, `configService`, and `authService`. Add `emailService` to the options and call it from runtime callbacks:

```ts
magicLink({
  storeToken: 'hashed',
  expiresIn: 10 * 60,
  sendMagicLink({ email, url, metadata }) {
    void emailService.sendAuthMagicLinkEmail({
      to: email,
      url,
      intent: metadata?.intent === 'signup' ? 'signup' : 'signin',
    });
  },
});
```

```ts
emailAndPassword: {
  ...staticAuthConfig.emailAndPassword,
  requireEmailVerification: true,
  revokeSessionsOnPasswordReset: true,
  sendResetPassword({ user, url }) {
    void emailService.sendPasswordResetEmail({ to: user.email, url });
  },
  onExistingUserSignUp({ user }) {
    void emailService.sendExistingUserSignUpEmail({ to: user.email });
  },
}
```

```ts
emailVerification: {
  sendOnSignUp: true,
  sendOnSignIn: true,
  autoSignInAfterVerification: true,
  sendVerificationEmail({ user, url }) {
    void emailService.sendEmailVerificationEmail({ to: user.email, url });
  },
}
```

### UI changes

| Surface                 | Change                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Magic link              | Keep current view; optionally add a name field or pass a default name for first-time magic-link signup.                                                                   |
| Sign-in                 | Keep "Continue with Magic Link" visible. Passwordless-first is decided; route private-share lock-screen primary action to `/auth/magic-link` instead of password sign-in. |
| Sign-up                 | Keep email/password signup but expect verify-email toast and redirect to sign-in when `requireEmailVerification` is true.                                                 |
| Forgot password         | Pass explicit `redirectTo` to `/auth/reset-password`.                                                                                                                     |
| Reset password          | Keep existing token form; add explicit error toast handling for invalid/expired token from Better Auth if the hook does not already surface it globally.                  |
| Publication lock screen | Preserve `redirectTo`; for private shared links, keep invitation token in the redirect URL.                                                                               |
| Publish dialog          | Add "Invite by email" only after `publication_access` exists; do not overload owner-only private visibility.                                                              |

## Recommended Roadmap

| #   | Action                                                                                                                                                                                                       | Priority | Effort | Impact |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------ | ------ |
| R1  | Add `resend` and `react-email` dependencies and API env schema for `RESEND_API_KEY`, `TAU_EMAIL_FROM`, and `TAU_EMAIL_REPLY_TO`. Resend is the only provider; do not add a provider switch or delivery flag. | P0       | Low    | High   |
| R2  | Add `EmailModule` + `EmailService` that sends through Resend when `RESEND_API_KEY` is present and renders/logs safely when the key is absent in tests/dev.                                                   | P0       | Medium | High   |
| R3  | Replace Better Auth runtime logging callbacks with `EmailService` sends for magic links, reset password, verification, and existing-user signup notifications.                                               | P0       | Low    | High   |
| R4  | Update forgot-password UI to pass `redirectTo` for `/auth/reset-password`.                                                                                                                                   | P0       | Low    | High   |
| R5  | Enable verified email/password signup: `requireEmailVerification`, `sendOnSignUp`, `sendOnSignIn`, `autoSignInAfterVerification`, and `revokeSessionsOnPasswordReset`.                                       | P0       | Low    | High   |
| R6  | Add tests for Better Auth config callbacks using a fake `EmailService` so token URLs are routed to the right template without sending email.                                                                 | P0       | Medium | High   |
| R7  | Add publication access grants keyed by exact normalized recipient email for private recipient sharing.                                                                                                       | P0       | Medium | High   |
| R8  | Add React Email templates for every outbound email plus API endpoint/actions to invite, revoke, and list publication access grants.                                                                          | P0       | Medium | High   |
| R9  | Update lock-screen copy/actions so private invite recipients land on magic-link signup/sign-in and return to the same shared URL.                                                                            | P1       | Low    | Medium |
| R10 | Add Resend staging/prod operator checklist: verified domains, DNS records, API key scopes, Fly secrets, sender smoke tests.                                                                                  | P1       | Low    | High   |
| R11 | Add delivery observability: log Resend message id, template kind, recipient hash/domain, and failure class; never log auth URLs or tokens.                                                                   | P1       | Medium | High   |
| R12 | Add Terraform-managed Resend/Fly email secrets and Resend DNS verification CNAME support in `repos/tau-cloud`.                                                                                               | P0       | Medium | High   |

## Security and Privacy Notes

- Do not log magic-link, reset, verification, or invite tokens in production. The current logger behavior should be removed or gated to local development.
- Prefer hashed magic-link token storage (`storeToken: 'hashed'`) unless Better Auth version/type compatibility blocks it; keep verification in Postgres for multi-instance atomicity.
- Use short expiries: magic links around 10 minutes, reset links around one hour, invite links around 7-14 days.
- Use generic success messaging for forgot-password and sign-up duplicate paths.
- Verify Resend sender domains before staging/prod rollout; do not use `onboarding@resend.dev` outside provider tests.
- Treat publication invite emails as personal data processing: store normalized email, revocation, expiry, accepted user id, and invited-by user id.

## Testing Plan

API:

- Unit-test `ResendEmailProvider` request mapping with a mocked Resend client.
- Unit-test Better Auth runtime config callbacks with a fake `EmailService`.
- Integration-test `POST /v1/auth/sign-in/magic-link` returns success and records an email send.
- Integration-test `POST /v1/auth/request-password-reset` records a reset email with a `/auth/reset-password` URL.
- Integration-test private publication access: owner allowed, anonymous denied, non-granted signed-in user denied, granted user allowed, revoked/expired grant denied.

UI:

- Component-test forgot-password submits `redirectTo`.
- Component-test publication lock screen preserves `redirectTo` for private publication URLs.
- Component-test magic-link signup path from a private lock screen.

Manual smoke:

1. Start local API without `RESEND_API_KEY`; confirm emails are captured/logged safely without raw tokens in structured logs.
2. Start staging with Resend sandbox/verified domain; request magic link to a test inbox; click it; confirm redirect.
3. Request password reset; set a new password; confirm old sessions are revoked if configured.
4. Invite a fresh email to a private publication; accept via magic link/signup; confirm access grant binds to the new user and the viewer opens.

## Decisions

1. Tau remains passwordless-first. Private share lock screens should route recipients to magic-link signup/sign-in rather than making password auth equally prominent.
2. The dev/staging transactional sender is `identity@taucad.dev`; production remains `identity@tau.new`.
3. Publication invite MVP grants access only to specific email addresses.
4. Magic-link-created users should not be prompted to set a display name after first sign-in.

## References

- Better Auth: [Email](https://better-auth.com/docs/concepts/email)
- Better Auth: [LLMs.txt](https://better-auth.com/llms.txt)
- Better Auth: [Magic link plugin](https://better-auth.com/docs/plugins/magic-link)
- Better Auth: [Email & Password](https://better-auth.com/docs/authentication/email-password)
- Resend: [Send emails with Node.js](https://resend.com/nodejs/)
- React Email: [Send email using Resend](https://react.email/docs/integrations/resend)
- Related: `docs/research/sharing-architecture.md`
- Related: `docs/research/publication-viewer-layout-blueprint.md`
- Related: `docs/research/stripe-better-auth-integration.md`
