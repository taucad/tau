---
revisions: patch
---

A GitHub-proxied remote's 403 is now `REMOTE_FORBIDDEN` (the repository's access withdrawn, which no reconnect restores), with its own sentence when the remote sent none, unless the answer says the token expired: a `WWW-Authenticate` challenge naming `invalid_token` or expiry (read on the isomorphic-git leg, as `RemoteTransportContext.authenticate`), a `GITHUB_RECONNECT_REQUIRED` code, or the remote's own words. A 401, and any other proxied host's 403, stays `REMOTE_REAUTHORIZATION_REQUIRED` (W7.3).
