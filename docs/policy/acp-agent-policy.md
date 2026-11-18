---
title: 'ACP Agent Policy'
description: 'Rules every external ACP agent profile and host must meet for install locations, discovery, probes, refusals, fix commands, sign-in, version floors and default permission modes.'
status: active
created: '2026-11-15'
updated: '2026-11-17'
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

This policy covers `acpAgentProfiles`, discovery, the version probe, refusal codes, fix commands, re-discovery, sign-in commands and the permission mode a chat starts in, in the desktop app and in `tau serve`. It does not otherwise cover what happens inside a turn.

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
| `loginArgs`                                 | The words of `loginCommand` after `cli`, none needing quotes; `[cli, ...loginArgs]` spells `loginCommand`         |
| `defaultModePreference`                     | Mode ids, `auto` first, each with its adapter evidence (rule 14)                                                  |

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

List Tau's `cli-login` method first on every sign-in surface. Name the CLI by its bare name when it was found on PATH and by its quoted absolute path otherwise. Drop an advertised terminal command that runs the host's own runtime or names the adapter's module path. Quote every surfaced command for the host's shell. On POSIX, single-quote an argument that is empty or holds anything outside `[A-Za-z0-9_@%+=:,./-]`, writing each `'` inside it as `'\''`. On Windows, double-quote an argument that is empty or holds whitespace, `"`, `'`, `` ` `` or `$`, escape each `` ` ``, `"` and `$` inside it with a backtick, and write a quoted program as `& "..."` so PowerShell runs it.

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

Run a sign-in only in the desktop's sign-in tab, and only the profile's own:

- The page names an agent id and nothing else. Main finds the adapter in its own discovery and starts it with `acpLoginLaunch`: the located `executablePath` (located again, rule 4), the profile's `loginArgs` and the adapter's own environment (`acpAdapterEnvironment`, so `configEnv` such as `CLAUDE_CONFIG_DIR` applies). Never a shell, a renderer-supplied string or a command an adapter advertised.
- Open each sign-in as its own workbench tab beside the Terminal, one per agent; never inside the user's shell. Show the command filled in exactly as the card shows it (bare on `PATH`, the quoted path for a fallback, D10); start it only on the user's Enter or click.
- Tau code never parses, logs, stores or forwards the tab's input or output beyond drawing it; the vendor's page opens in the default browser, never in a Tau window.
- One running sign-in per agent; stop it when its tab, window or the app closes. The tab ends when the CLI exits and reports the exit code alone: a real exit 0 retries the refused turn once, as **Try again** would; a non-zero exit or a signal leaves the card with how it ended. Key the offer on the host that refused the turn, not on the composer. Add no polling.
- A surface with no local Terminal (a browser, a remote host) keeps the command to copy.

**Why**: The user completes the vendor's own flow in a process Tau starts but never reads, which keeps sign-in inside the vendor's terms (`docs/research/claude-code-acp-terms-review.md`, Finding 2) and lands the login where the agent reads it.

### 11. Tie the Version Floor to the Adapter Pin

Change an adapter pin, its `minimumCliVersion` and, when the banner changed, its `versionSample` in the same commit.

### 12. Descriptor Evolution

Add a descriptor field only as optional, and land it in the wire schema, the API DTO and the UI one release before any host emits it. Do not add a refusal code for a condition an existing code describes.

**Why**: Every tier parses the descriptor strictly, so an older client drops the whole agent list when it meets an unknown field or code.

### 13. Conformance and Qualification

Every profile passes `registry.conformance.test.ts` and `login.conformance.test.ts` unmodified; adding a profile adds no test file. `login.adapter-contract.integration.test.ts` passes against each pinned adapter. Before a profile ships, and at each quarterly pin review, run the opt-in real-vendor smokes and record them in Tau Brain. State a platform with no recorded device run as unqualified in `apps/docs/content/docs/editor/external-agents.mdx`.

### 14. Start in Auto, Never in Bypass

A new chat starts in the first mode of the profile's `defaultModePreference` that the agent or its current model offers. The list starts with `auto`, then the most permissive mode that still keeps a vendor safety boundary: the agent edits workspace files without asking but does not lift every check. Never list a plan mode or a bypass mode (`bypassModeIds`: Claude `bypassPermissions`, Codex `agent-full-access`, Grok `always-approve`). The one exception is `grokNoAutoFallback`, Grok's `always-approve` while Grok has not reported Auto as enabled (PR5 amendment, operator 2026-11-17T03:42Z). The host applies the rule before the prompt, keyed on mode ids (`packages/host/src/acp/acp-modes.ts`); no surface adds its own.

Keep a mode the person picked for as long as the agent offers it, through model switches and restarts. A chat Tau defaulted follows its model: it falls back when the model loses `auto` and returns to `auto` when it comes back. A chat whose record predates this rule keeps its mode. Filter plan values out of the mode menu and never apply one; show the adapter's mode names and descriptions unchanged.

| Agent       | Advertised                                                       | Starts in                                |
| ----------- | ---------------------------------------------------------------- | ---------------------------------------- |
| Claude Code | `auto` (supporting models), `default`, `acceptEdits`, `dontAsk`… | `auto`, else `acceptEdits`               |
| Codex       | `read-only`, `agent`, `agent-full-access`                        | `agent`                                  |
| Grok        | `ask`, `auto` (once enabled), `always-approve`                   | `auto`, else `always-approve` (operator) |

**Why**: Operator ruling PR5 (2026-11-17T03:25Z): a fresh chat that asks before writing `main.ts` is not acceptable, and plan mode is no longer relevant. It replaces, for new chats, the earlier rule of keeping the user's native permission mode.

**Enforced by**: `acp-modes.test.ts` (no profile lists a plan or bypass id but the ruled Grok fallback) and the `default permission mode (PR5)` cases in `acp-session.machine.test.ts` and `run.integration.test.ts`.

## Anti-Patterns

- Passing `probeTimeout` from a host to make boot faster.
- Showing an adapter's advertised terminal command without checking what it runs.
- Testing sign-in only against a fake agent whose auth methods differ from the real adapter's.
- Copying an install command from a blog post or from memory.
- Running a sign-in through a shell, or keying its launch to an agent id outside the profile.
- Defaulting a chat in the UI, or choosing a mode by agent id outside the profile.

## Adding an Agent Checklist

- [ ] Profile entry with every field and an evidence comment on each fallback and command
- [ ] Adapter pin, if the agent needs one; no edit outside `registry.ts` except that dependency
- [ ] `versionSample` is a real line and the floor matches the adapter pin
- [ ] `defaultModePreference` read from the adapter's own mode list, with no plan or bypass id
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
