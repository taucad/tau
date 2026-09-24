---
title: 'GitHub Repository Integration'
description: 'Deployment and implementation contract for Tau GitHub App connections, repository discovery, linked import, Git transport, and release fixtures.'
status: active
created: '2026-09-14'
updated: '2026-09-23'
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
| Repository permissions   | Contents read/write, Metadata read                       |
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
| `GITHUB_REPOSITORY_CONNECTION_KEY`         | Unpadded base64url 32-byte active encryption key (43 chars)    |
| `GITHUB_REPOSITORY_CONNECTION_KEY_VERSION` | Positive integer recorded with encrypted values                |

Generate the key with `openssl rand -base64 32 | tr '+/' '-_' | tr -d '='`; padded or standard base64 is refused at startup. Workflows permission is not requested: Tau never edits `.github/workflows`, and contents write plus metadata read cover import and sync.

The frontend receives no App secret or connection key. The client id, secret and slug decide whether the connection is configured: all three or none, and with them set the callback URL and key are required, otherwise startup fails closed. An empty value counts as unset, so a copied `.env.example`, or a callback URL and key without App credentials, boots with the connection unconfigured and `GET /v1/github/configuration` answers 503 `GITHUB_CONNECTION_UNAVAILABLE`. The current implementation accepts one active encryption key: changing its version makes existing rows reconnect-required. Keep the key/version stable until an owned re-encryption operation and explicit previous-key configuration are implemented; rotation never guesses a key from `AUTH_SECRET`.

## Callback and connection lifecycle

An authenticated start request creates a ten-minute single-use state and PKCE verifier in Redis, bound to Tau user, session, fixed return location, and attempt id. GitHub redirects only to the API callback. The callback atomically consumes state, exchanges the code, validates `/user`, stores a five-minute encrypted pending result, and redirects without credentials to a fixed completion page. The originating authenticated session completes the connection. The callback never answers with an API error body: consent denial, an expired or replayed state, and a failed exchange redirect to the completion page with an `error` code, and the failure is recorded against a readable attempt so a polling client stops. Removing a connection revokes the user's grant at GitHub (best effort) before the row is deleted. The grant belongs to the GitHub account and the App, not to the Tau account, so revoking it also invalidates the App tokens of every other Tau account connected to the same GitHub account; those connections end at Reconnect GitHub on their next GitHub request.

Connection rows belong to one Tau user and GitHub numeric subject. Access and refresh tokens are independently nonce-encrypted with associated user, connection, purpose, and key version. Refresh is serialized per connection, persists GitHub's rotated pair atomically, and converts ambiguous or revoked results to reconnect-required. Request logs and incoming HTTP trace spans record `/v1/github/callback` and `/v1/auth/callback/*` by path only (the query with `code` and `state` is dropped by the request logger's URL redaction and the HTTP instrumentation's span hook), and redact request/response token bodies, authorization headers, signed action URLs, and ciphertext.

## Repository and transport contract

Discovery uses `GET /user/installations`, then every page needed from `GET /user/installations/{installation_id}/repositories`; branch data is loaded only after repository selection. All responses pass strict codecs. A result is incomplete until pagination ends, and unknown access never enables push. A lookup by stable id reports access only for a repository one of the connection's installations holds, because GitHub answers it for any repository the user can see.

A selected repository crosses into revisions as its stable numeric id, canonical HTTPS clone URL, source full ref/head, target branch/expected old head, reviewed setup digest, and sync consent. Connection ids and credentials remain user-local. Git remote configuration records only the URL, `tauProvider=github`, and stable repository id.

Browser smart HTTP and LFS batch requests pass through the Tau API with one repository-bound credential header, on the default HTTPS port only. Every redirect is revalidated; a redirect on a credentialed request is refused with `409 GIT_PROXY_REDIRECTED_CREDENTIAL` carrying the credential-free target (or no target when it fails the proxy's host, port or path checks), and the client re-resolves a moved or renamed repository by its stable id (`GET /v1/github/repositories/:id`) with the user's confirmation. LFS action URLs are replaced with short-lived server-issued handles bound to user, object, method, headers, size, and expiry; callers never submit an arbitrary relay target. Native Git receives the same URL-scoped credential only for one process invocation, pins the standard selected-repository LFS endpoint, and never writes the credential to Git config or argv.

Tau-managed credentials are exclusive. When Tau supplies a credential for a remote, or has marked it unavailable, native Git runs with the user's credential helpers and askpass disabled, so a missing or expired App token fails as reconnect-required instead of pushing with a personal identity; an unavailable credential is refused before Git starts. Remotes Tau holds no credential for keep the user's own Git configuration. The page renews the App user token before it expires (from five minutes out) and once after a genuine authentication failure, then re-sends the credential; a revoked grant still ends at Reconnect GitHub. A github.com address entered without a connected account is linked as an anonymous, fetch-only remote; pushing to it requires connecting GitHub.

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
