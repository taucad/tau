---
host: patch
---

The Grok permission readback now reads a project whose directory sits under a mount point with no repository above it, such as a tmpfs `/tmp` on Ubuntu 26.04. Git reports that case as stopping at a filesystem boundary instead of with its usual "not a git repository" message. The readback took that as an unknown failure and observed nothing; it now scopes to the session directory as it does for any other folder outside a repository.
