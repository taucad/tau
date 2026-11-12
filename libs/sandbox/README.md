# @taucad/sandbox

Tau's OS sandbox launcher, process tree and contained shell provider. Private: `@taucad/native-process-core` bundles it into its published `dist/libs/sandbox/` and re-exports its surface, so nothing outside the workspace installs this name.

| Entry                                  | What it holds                                                                                                                                        |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@taucad/sandbox`                      | `launchInNativeSandbox`, `spawnInNativeSandbox`, the sandbox lease, `nativeSandboxPolicy`, the Linux child-resident sampler, the process-table reads |
| `@taucad/sandbox/shell`                | The contained shell launch-session seam (`@taucad/native-process-core/shell` re-exports it unchanged)                                                |
| `@taucad/sandbox/shell/srt-supervisor` | The per-launch supervisor entry; the default provider starts `./srt-supervisor.mjs` beside its own emitted module                                    |

The shell conformance rows (`sandbox:test:shell-conformance`), the Linux guest scripts under `scripts/` and the `shell-custody` TLA+ model under `specs/` live here.
