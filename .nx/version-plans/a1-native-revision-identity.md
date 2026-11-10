---
host: minor
cli: minor
---

A native host records the signed-in Tau account, never the machine. The desktop, `tau serve` and `tau revisions save` no longer read the OS login name, `GIT_AUTHOR_*`, `GIT_COMMITTER_*` or `EMAIL`, so neither enters a commit, a trailer or a tag.

Breaking:

- `hostRevisionActor(account?)` resolves the account it is given, else the cloud owner (`TAU_HOST_OWNER_ID`), else this device's pseudonym (`anon:<hash>`, name `Anonymous`, from a random salt in Tau's config directory). It no longer answers with the OS user or an environment address.
- A `setActor` channel request now sets who every later mint of that project is authored by; it was ignored. A request whose `actor` is not a person is refused.
- `createProjectRevisions` always records a resolved person: without an `actor` option it uses `hostRevisionActor()`, never the opaque `tau-host` id.

New options: `openProjectRevisions({ actor })`, `createProjectHost({ revisionActor })` and the host daemon's `agent.revisionActor` name the account a token belongs to. `tau revisions save` and `tau serve` resolve it from their session token (the account id only); a token the API does not accept records the device pseudonym.
