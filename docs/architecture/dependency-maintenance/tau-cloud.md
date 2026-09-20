# Tau Cloud maintenance

This is the Tau-side route for the optional `repos/tau-cloud` checkout. Public install, build, test and runtime do not require it. For cloud changes, use [Repos](../../../.agents/skills/repos/SKILL.md), read that checkout's instructions and recheck the current stack/module source; reading a module is never authorization to apply, deploy, change DNS or rotate a token.

The module ownership map, the storage and publication boundaries, the Netlify build-root and secret-context traps and the release boundaries are operational. They live in Tau's private operations handbook at `docs/handbooks/cloud/` (`system/services/terraform-control-plane.md`, `system/services/object-storage.md`, `system/services/ui.md`, `operate/terraform-change.md`), maintained with the `create-handbook` skill; that path resolves only in a checkout that has the private handbook.
