---
revisions: patch
---

`projectRevisionsMachine` now ignores a `pinTo` that names a checkout the registry no longer lists, once the registry has answered, so the workbench stays on its current checkout instead of selecting one with no root. A host that restores a remembered pin after a reload can send it as soon as the root starts: a `pinTo` that arrives before the registry's first listing is still checked against that listing and falls back to the live checkout.
