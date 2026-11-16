---
title: 'ACP Agent Policy'
description: 'Rules every external ACP agent profile and host must meet for install locations, discovery, probes, refusals, fix commands, sign-in and version floors.'
status: active
created: '2026-11-15'
updated: '2026-11-15'
related:
  - docs/research/acp-agent-install-paths-blueprint.md
  - docs/research/external-agent-acp-topology.md
  - docs/policy/testing-policy.md
  - docs/policy/compatibility-policy.md
  - docs/policy/library-api-policy.md
---

# ACP Agent Policy

Internal reference for adding or changing an external ACP agent profile (Claude Code, Codex, Grok Build and later ones) and for any host that discovers, probes or signs in to one.

## Rationale

An external agent runs the user's own vendor CLI under the user's own login. Vendors install that CLI in different places, a desktop app starts without the user's shell PATH, and adapters describe sign-in in their own terms. Tau's first three agents diverged by accident: one had app-bundle fallbacks, one had no fix commands, a slow probe was reported as "not installed", and one sign-in card offered Tau's own binary. A profile is the only per-agent knowledge in the tree, so it must be complete, and one conformance suite must hold every profile to the same rules.

## Scope

This policy covers `acpAgentProfiles`, discovery, the version probe, refusal codes, fix commands, re-discovery and sign-in commands, in the desktop app and in `tau serve`. It does not cover what happens inside a turn.

## Rules

### 1. One Profile, Complete

Declare everything Tau knows about an agent's install locations, its install, update and login commands, and its version floor in its entry of `acpAgentProfiles` (`packages/host/src/acp/registry.ts`). Every reviewed profile satisfies `ReviewedAcpAgentProfile`. Never add a table, switch or string keyed by agent id for these concerns in another tier; surfaces render the descriptor.

**Why**: Three partial tables in three files is how one agent came to have no fix commands and another a wrong one.

**Enforced by**: `ReviewedAcpAgentProfile` (compile time) and `packages/host/src/acp/registry.conformance.test.ts`.

| Field                                       | Rule                                                                                                              |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `cli`, `minimumCliVersion`, `versionSample` | Required. The sample is a real `--version` line                                                                   |
| `fallbackExecutables`                       | A key for `darwin`, `linux` and `win32`; an empty list carries a comment saying no location outside PATH is known |
| `installCommand`, `updateCommand`           | A `posix` and a `windows` line, from the vendor's documentation                                                   |
| `loginCommand`                              | Starts with `cli`                                                                                                 |

### 2. Declare Verified Install Locations

Search PATH first, then the profile's fallbacks in order. A fallback is a vendor installer directory, a Homebrew prefix or a vendor app bundle. Give each entry a comment that cites the vendor's document, the vendor's installer source, or a dated observation. Leave out a location nobody verified. Use `*` only as a whole path segment; it resolves to the newest version. Apply the version floor to a fallback exactly as to PATH.

**Why**: A guessed path is searched forever, and an unlisted vendor path refuses an installed agent.

CORRECT:

```typescript
fallbackExecutables: {
  // From x.ai/cli/install.sh:206 (BIN_DIR), read 2026-11-15.
  darwin: ['~/.grok/bin/grok', '~/.local/bin/grok'],
  linux: ['~/.grok/bin/grok', '~/.local/bin/grok'],
  // From x.ai/cli/install.ps1:374, read 2026-11-15.
  win32: ['~/.grok/bin/grok.exe'],
},
```

INCORRECT:

```typescript
// apps/desktop: a directory added to the app's PATH so one agent is found
const fallbackPathEntries = () => ['/opt/homebrew/bin', join(homedir(), '.grok/bin')];
```

An undocumented vendor location is allowed only as the last entry for its platform, with a dated observation, and is re-observed at each quarterly pin review.

### 3. Launch Parity

Resolve the same executable from Finder, the Dock, the Start menu, a `.desktop` entry, a terminal and `tau serve`. Never make discovery depend on the login-shell import.

**Why**: A desktop app starts with the launcher's PATH, not the user's shell PATH.

The process that runs a turn must give the adapter the same account variables that discovery saw. On the desktop, discovery runs in main, but turns spawn from the services utility, whose environment has no `HOME` or `USER`. So main hands each adapter its allowlisted values on `spawnEnv` (`withMainAgentEnvironment`).

**Why**: Claude Code finds its macOS keychain sign-in by `USER`. Without it, a signed-in CLI answered "not logged in" on every turn, while discovery listed it as available.

### 4. Run the File You Found, Never Through a Shell

Use the located file for the version probe, the session and `executableEnv`. Never start a CLI with `shell: true`. On Windows, never select a `.cmd` or `.bat` file. Locate a `*` fallback again before a spawn when its file is gone.

**Why**: A shell adds quoting and injection risk; Node does not spawn a shim without one; a versioned path moves when the vendor app updates.

### 5. Refuse With the Code That Is True

| Outcome                                                             | Code                                      | Fix command |
| ------------------------------------------------------------------- | ----------------------------------------- | ----------- |
| No file on PATH or at any fallback, or `ENOENT`                     | `CLI_NOT_FOUND`                           | install     |
| Parsed version below the floor                                      | `CLI_TOO_OLD`                             | update      |
| Timeout, signal, non-zero exit, permission or any other probe error | `EXTERNAL_AGENT_UNAVAILABLE`              | none        |
| Adapter package missing, or without a bin                           | `ADAPTER_NOT_INSTALLED`, `ADAPTER_NO_BIN` | none        |

Never report a failed probe as "not installed". Never refuse an agent because its model probe failed or its version line could not be parsed; log a warning for the latter.

CORRECT:

```typescript
if (error.killed) {
  return { id, code: 'EXTERNAL_AGENT_UNAVAILABLE', message: `${path} --version did not answer within ${budget} ms.` };
}
```

INCORRECT:

```typescript
catch (error) {
  return { id, code: 'CLI_NOT_FOUND', message: String(error) };
}
```

### 6. Log Every Refusal With Its Message

Log the agent id, the code and a message naming what was tried: the path or the locations searched, the elapsed time against the budget, the exit code or signal. `tau serve` prints the message and the fix command. Keep the message on the host; never put it on the descriptor or send it to telemetry.

**Why**: A code without its message cannot be diagnosed, and the message holds local paths.

### 7. Keep the Library Probe Budgets

Use the version and model probe budgets from `packages/host`. Never pass a smaller `probeTimeout` from a host.

**Why**: A host-local override made one surface refuse what another advertised.

### 8. Clear a Refusal When the User Fixes It

Where a host has a user-facing agent list, re-probe refused profiles on the next listing, at most once per 30 s, and re-post the adapters. Do not disturb running sessions.

### 9. Fix Commands Come From the Profile

Resolve one `fixCommand` on the host for the host's own platform and send it on the refused descriptor. Use vendor-documented commands only. Send none for a code the user cannot act on.

**Why**: The host knows its platform; a surface can only guess it.

### 10. Show a Sign-In Command That Works

List Tau's `cli-login` method first on every sign-in surface. Name the CLI by its bare name when it was found on PATH and by its quoted absolute path otherwise. Drop an advertised terminal command that runs the host's own runtime or names the adapter's module path. Quote every surfaced command for the host's shell. On POSIX, single-quote an argument that is empty or holds anything outside `[A-Za-z0-9_@%+=:,./-]`, writing each `'` inside it as `'\''`. On Windows, double-quote an argument that is empty or holds whitespace, `"`, `'`, `` ` `` or `$`, escape each `` ` ``, `"` and `$` inside it with a backtick, and write a quoted program as `& "..."` so PowerShell runs it. Never run a sign-in command.

**Why**: An adapter describes sign-in as its own process invocation, which is Tau's binary when Tau hosts the adapter.

CORRECT:

```text
claude auth login
'/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex' login
```

INCORRECT:

```text
/Applications/Tau.app/Contents/Frameworks/Tau Helper.app/Contents/MacOS/Tau Helper .../claude-agent-acp/dist/index.js --cli auth login --claudeai
```

### 11. Tie the Version Floor to the Adapter Pin

Change an adapter pin, its `minimumCliVersion` and, when the banner changed, its `versionSample` in the same commit.

### 12. Descriptor Evolution

Add a descriptor field only as optional, and land it in the wire schema, the API DTO and the UI one release before any host emits it. Do not add a refusal code for a condition an existing code describes.

**Why**: Every tier parses the descriptor strictly, so an older client drops the whole agent list when it meets an unknown field or code.

### 13. Conformance and Qualification

Every profile passes `registry.conformance.test.ts` and `login.conformance.test.ts` unmodified; adding a profile adds no test file. `login.adapter-contract.integration.test.ts` passes against each pinned adapter. Before a profile ships, and at each quarterly pin review, run the opt-in real-vendor smokes and record them in Tau Brain. State a platform with no recorded device run as unqualified in `apps/docs/content/docs/editor/external-agents.mdx`.

## Anti-Patterns

- Passing `probeTimeout` from a host to make boot faster.
- Showing an adapter's advertised terminal command without checking what it runs.
- Testing sign-in only against a fake agent whose auth methods differ from the real adapter's.
- Copying an install command from a blog post or from memory.

## Adding an Agent Checklist

- [ ] Profile entry with every field and an evidence comment on each fallback and command
- [ ] Adapter pin, if the agent needs one; no edit outside `registry.ts` except that dependency
- [ ] `versionSample` is a real line and the floor matches the adapter pin
- [ ] `pnpm nx test host --watch=false` passes, including both conformance files and the adapter contract test
- [ ] Opt-in smoke on at least one real install per supported platform recorded in Tau Brain, or the platform stated as unqualified
- [ ] The docs page lists the agent

## Known Limitations

- Installs under an npm prefix or a version manager (nvm, Volta, asdf, mise) are found through PATH only; the login-shell import covers them on the desktop.
- `tau serve` discovers at start; restart it after installing an agent.
- An update command is the vendor's primary one and may not upgrade a package-manager install.
- A web UI newer than a paired daemon shows a refused agent without a fix command until the daemon updates.

## References

- Research: `docs/research/acp-agent-install-paths-blueprint.md`, `docs/research/external-agent-acp-topology.md`
- Related: `docs/policy/testing-policy.md`, `docs/policy/compatibility-policy.md`
