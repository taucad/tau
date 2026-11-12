# @taucad/desktop-terminal

The desktop services host's `terminal` concern: one human PTY session per pane port over the shell service, speaking the validated `@taucad/types/desktop-terminal` wire. Private and source-consumed: `apps/desktop` bundles it and binds its options to the services host's root allowlist and frames.

| Entry                      | What it holds                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `@taucad/desktop-terminal` | `createTerminalConcern`, `terminalAdmissionMilliseconds` and the `TerminalConcern`, `TerminalConcernOptions` and `TerminalPort` types |

The concern-level conformance rows (`desktop-terminal:test:terminal-conformance`, P01, R01–R03, T01–T10 over a port into the concern) live here. The rows that drive the same semantics through the real services host, its root allowlist frame and its `terminal` concern frame stay in `apps/desktop` (`desktop:test:terminal-conformance`).
