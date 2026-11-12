# @taucad/shell-service

Tau's rooted shell service: one bounded, contained execution per agent `shell` call and the interactive PTY sessions of the human Terminal, over the sandbox shell provider chosen at composition. Private: `@taucad/host` bundles it into its published `dist/libs/shell-service/` and re-exports its surface from its root, so nothing outside the workspace installs this name.

| Entry                   | What it holds                                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@taucad/shell-service` | `createShellService`, `probeHostShell`, the approval key and prompt, the shell contract (`shellLimits`, `isShellError`, the input and output types) |

The service's conformance rows H01–H07 (`shell-service:test:shell-conformance`) live here. The rows that drive it through a real Tau agent host and the host's tool registry (H08–H10), the W7 qualification rows and the parity test against the chat schema stay in `@taucad/host`.
