---
cli: minor
host: minor
---

Add browser-approved `tau auth login`, `tau auth status`, and `tau auth logout`, with separate sessions stored in the OS credential store per API origin. Cloud commands use the saved login or an explicit `TAU_AUTH_TOKEN` override. Rename the previous authentication environment variable to `TAU_AUTH_TOKEN` without an alias; update automation and hosted entrypoints to the new name.
