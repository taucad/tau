---
host: patch
---

Codex is found when the only copy on the machine is the one the ChatGPT desktop app bundles. On macOS, when `codex` is not on `PATH`, resolution tries `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex` and then the same path under `~/Applications`, and runs that file through `CODEX_PATH`; the 0.148.0 version floor still applies, and a `codex` on `PATH` still wins. `AcpAgentProfile` gains a per-platform `fallbackExecutables` list, and `resolveAcpAdapters` accepts a `platform` option.
