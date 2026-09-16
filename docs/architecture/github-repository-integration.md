---
title: 'GitHub Repository Integration'
description: 'Deployment and implementation contract for Tau GitHub App connections, repository discovery, linked import, Git transport, and release fixtures.'
status: active
created: '2026-09-14'
updated: '2026-09-14'
related:
  - docs/research/github-repository-import-and-linked-revisions-blueprint.md
  - docs/policy/revisions-policy.md
  - docs/policy/filesystem-authority-policy.md
  - docs/policy/project-manifest-policy.md
---

# GitHub Repository Integration

Implementation and operator contract for the first-class GitHub.com repository connection used by Import Project and project Revisions.

## GitHub App registration

Register separate GitHub Apps for local development, staging, and production. Each App uses its own exact callback URL and secrets and targets any personal or organization account.

| Setting                  | Required value                                           |
| ------------------------ | -------------------------------------------------------- |
| Repository permissions   | Contents read/write, Workflows read/write, Metadata read |
| Organization permissions | None                                                     |
| User permissions         | None; do not request email addresses                     |
| User access-token expiry | Enabled                                                  |
| Webhooks                 | No configured delivery for the first release             |
| OAuth callback           | `<api-origin>/v1/github/callback`, exact per environment |
| Installation             | Personal or organization, all or selected repositories   |

This flow uses GitHub App user tokens. It does not need an App private key or installation token, does not authorize Tau sign-in, and does not replace the existing GitHub provider used for sign-in and Gists.

## API configuration

The API validates these deployment secrets at startup:

| Variable                                   | Contract                                                       |
| ------------------------------------------ | -------------------------------------------------------------- |
| `GITHUB_REPOSITORY_APP_CLIENT_ID`          | GitHub App OAuth client id                                     |
| `GITHUB_REPOSITORY_APP_CLIENT_SECRET`      | GitHub App OAuth client secret                                 |
| `GITHUB_REPOSITORY_APP_SLUG`               | Public App slug used only to construct GitHub management links |
| `GITHUB_REPOSITORY_APP_CALLBACK_URL`       | Exact public callback URL; HTTPS except local development      |
| `GITHUB_REPOSITORY_CONNECTION_KEY`         | Base64-encoded 32-byte active encryption key                   |
| `GITHUB_REPOSITORY_CONNECTION_KEY_VERSION` | Positive integer recorded with encrypted values                |

The frontend receives no App secret or connection key. Startup fails closed when only part of the configuration is present. The current implementation accepts one active encryption key: changing its version makes existing rows reconnect-required. Keep the key/version stable until an owned re-encryption operation and explicit previous-key configuration are implemented; rotation never guesses a key from `AUTH_SECRET`.

## Callback and connection lifecycle

An authenticated start request creates a ten-minute single-use state and PKCE verifier in Redis, bound to Tau user, session, fixed return location, and attempt id. GitHub redirects only to the API callback. The callback atomically consumes state, exchanges the code, validates `/user`, stores a five-minute encrypted pending result, and redirects without credentials to a fixed completion page. The originating authenticated session completes the connection.

Connection rows belong to one Tau user and GitHub numeric subject. Access and refresh tokens are independently nonce-encrypted with associated user, connection, purpose, and key version. Refresh is serialized per connection, persists GitHub's rotated pair atomically, and converts ambiguous or revoked results to reconnect-required. Logs redact callback queries, request/response token bodies, authorization headers, signed action URLs, and ciphertext.

## Repository and transport contract

Discovery uses `GET /user/installations`, then every page needed from `GET /user/installations/{installation_id}/repositories`; branch data is loaded only after repository selection. All responses pass strict codecs. A result is incomplete until pagination ends, and unknown access never enables push.

A selected repository crosses into revisions as its stable numeric id, canonical HTTPS clone URL, source full ref/head, target branch/expected old head, reviewed setup digest, and sync consent. Connection ids and credentials remain user-local. Git remote configuration records only the URL, `tauProvider=github`, and stable repository id.

Browser smart HTTP and LFS batch requests pass through the Tau API with one repository-bound credential header. Every redirect is revalidated and a credential is stripped before a cross-origin hop. LFS action URLs are replaced with short-lived server-issued handles bound to user, repository, object, method, headers, size, and expiry; callers never submit an arbitrary relay target. Native Git receives the same URL-scoped credential only for one process invocation, pins the standard selected-repository LFS endpoint, and never writes the credential to Git config or argv.

## Supported content and bounds

Linked import preserves regular files with `100644` or `100755` mode and standard Git LFS pointers. It refuses symlinks, gitlinks, unknown modes, tracked paths outside Tau's versioned registry, unsafe/colliding paths, custom LFS endpoints, and large ordinary Git blobs that Tau would otherwise convert invisibly; track those blobs with Git LFS before import. Custom Git filters are never executed by Tau. Initial browser admission is bounded to 100,000 tree entries, 128 MiB received pack per request, and 256 MiB expanded authored bytes. These are Tau engineering limits, not GitHub plan limits.

## Release and operations

No production feature flag or dual credential path ships. Deterministic OAuth/REST/Git/LFS fixtures are blocking. Release additionally requires authorized disposable live fixtures for one personal selected repository, one organization private selected repository, read-only/refusal behavior, and LFS upload/download. Fixture automation creates unique branches only and never deletes default branches, repositories, or installations.

Operational dashboards may record redacted phase, duration, outcome, status family, and rate-limit reset. They never record repository names for private repositories, tokens, OAuth codes, action URLs, Git authorization, connection ids, filenames, or commit content. A failed remote push leaves a locally published project and its destination-bound queue intact.

## References

- [GitHub App user tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
- [GitHub App permissions](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app)
- [GitHub App installation endpoints](https://docs.github.com/en/rest/apps/installations)
- [Git LFS batch API](https://github.com/git-lfs/git-lfs/blob/main/docs/api/batch.md)
