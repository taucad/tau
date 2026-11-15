---
host: patch
---

A signed-out external agent's sign-in card now offers a command that works in the user's own terminal. Tau's own login command (`claude auth login`, `codex login`, `grok login`) is always listed first. A `terminal-auth` command that runs the host's own runtime or names the adapter's module path is dropped, because on the desktop that is Tau's Electron helper; the method keeps its name and description. Every surfaced command is quoted for the host's shell, with PowerShell's call operator on Windows, and an advertised command equal to the login command is listed once. When resolution reports that a CLI was found outside PATH, its absolute path, quoted, replaces the leading CLI name.

`modelChoice` now appends the model id to each model that shares a display name with another, within the descriptor's 128-character bound, so two rows of one name can be told apart.
