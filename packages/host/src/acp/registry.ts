/**
 * Which external ACP agents this daemon can start, and where their adapters are.
 *
 * OQ-X1 (pin-and-review): the adapters are exact-pinned, and **staged into
 * each distributed product without vendor binaries; the user's CLI runs**. The
 * desktop app and `packages/cli` (`dist-acp`) both copy each adapter's runtime
 * closure and follow none of its optional dependencies, so the `claude` and
 * `codex` an adapter would bundle are absent, and `executableEnv` points it at
 * the CLI resolution found on PATH (or, failing that, in a vendor app bundle)
 * instead. Native ACP CLIs run the user's installed executable directly; no path uses `npx` at runtime. An agent the
 * user has not installed is refused. The pins below are the reviewed set; the
 * review cadence is quarterly, because these adapters wrap vendor SDKs that
 * move fast (`docs/research/external-agent-acp-topology.md`,
 * `docs/research/agent-plugin-install-path-blueprint.md`).
 *
 * Resolution is relative to a caller-supplied module URL rather than this file:
 * `tau serve` passes its staged `dist-acp` root, the desktop app its own
 * `import.meta.url`, and a test a fixture path instead.
 *
 * The profile array is the **only** per-agent knowledge in the tree (V14): the
 * descriptor every other tier renders is built from it here, so adding an agent
 * is one entry, plus a pinned dependency only when an adapter is needed.
 *
 * The rules a profile and its discovery meet (install locations, launch
 * parity, refusal codes, fix commands, version floors) are in
 * `docs/policy/acp-agent-policy.md`; `registry.conformance.test.ts` holds every
 * profile to them.
 */

import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { promisify } from 'node:util';
import type { SessionConfigOption, SessionConfigSelectOption } from '@agentclientprotocol/sdk';

import { modelChoice } from '#acp/session.js';
import { discoveredModeOptions, grokNoAutoFallback } from '#acp/acp-modes.js';
import { openAcpSession } from '#acp/acp-session.js';
import { acpLocateContext, locateAcpCli } from '#acp/locate.js';
import type { AcpExecutableFileSystem } from '#acp/locate.js';
import type { AcpSession } from '#acp/session.js';
import { externalAgentDescriptorSchema } from '@taucad/agent-host/wire';
import type { ExternalAgentDescriptor, ExternalAgentRefusalCode } from '@taucad/agent-host/wire';

/**
 * One config option cut to the wire's keys: an adapter's own extras (codex-acp puts `_meta` on every mode value) would
 * fail the strict descriptor schema and drop the whole option, which left Codex with no Mode control.
 *
 * @param option - The option as the adapter reported it.
 * @returns The option with only the keys the wire schema knows.
 */
function wireConfigOption(option: SessionConfigOption): Record<string, unknown> {
  const base = {
    id: option.id,
    name: option.name,
    category: option.category,
    description: option.description,
    type: option.type,
    currentValue: option.currentValue,
  };
  if (option.type !== 'select') {
    return base;
  }
  const value = (entry: SessionConfigSelectOption) => ({
    value: entry.value,
    name: entry.name,
    description: entry.description,
  });
  return {
    ...base,
    options: option.options.map((entry) =>
      'group' in entry ? { group: entry.group, name: entry.name, options: entry.options.map(value) } : value(entry),
    ),
  };
}

const execFileAsync = promisify(execFile);

/** Milliseconds one `<cli> --version` probe may take before the agent is refused. @public */
export const acpCliProbeTimeout = 10_000;

/**
 * Milliseconds the model probe may take, per agent.
 *
 * Its own budget, spent in parallel with {@link acpCliProbeTimeout}'s: the
 * version probe measures a CLI that answers in milliseconds, while this one
 * opens a real vendor session (Codex took 6.1 s through a cold packaged
 * app.asar adapter on an M-series host),
 * and folding them into one number would either kill the model probe or make
 * every boot wait on the slower question (EQ1 A).
 *
 * @public
 */
export const acpModelProbeTimeout = 15_000;

/** One reviewed external agent: its adapter pin and everything Tau knows about it. @public */
export type AcpAgentProfile = {
  /** Stable agent id used on the wire (`config.agent.id`) and in the selector. */
  readonly id: string;
  /**
   * Product name every surface renders.
   *
   * The single source: the selector, the approval banner and the CLI all read
   * it off the descriptor, so adding an agent is one entry here and nothing
   * else (V14).
   */
  readonly displayName: string;
  /**
   * CLI whose *own* login the adapter inherits (X6). Probed once at start;
   * `undefined` skips the probe, which only a test override does.
   */
  readonly cli?: string | undefined;
  /**
   * Variables naming the agent's own configuration directory. Everything else
   * is dropped by {@link acpAdapterEnvironment}'s allowlist, so these are the
   * one carve-out — a user who moved `~/.codex` must still be found.
   */
  readonly configEnv: readonly string[];
  /**
   * Exact variables this adapter is always given, on top of the allowlist.
   *
   * Values, not passthrough names: `configEnv` forwards what the user set, this
   * states what Tau requires.
   */
  readonly spawnEnv?: Readonly<Record<string, string>> | undefined;
  /**
   * Variable through which the adapter is told which `cli` to run.
   *
   * Both module adapters bundle a vendor copy of their CLI and run it unless
   * told otherwise, so the CLI the version probe checked would not be the one
   * that runs. Resolution sets this variable to the absolute path it found
   * (`executablePath`), which keeps the probed executable and the executed one
   * the same file and lets staging omit the bundled copies.
   */
  readonly executableEnv?: string | undefined;
  /**
   * Where a vendor installs `cli` outside PATH, by platform: its installer
   * directory, a Homebrew prefix or its app bundle.
   *
   * Tried in order only when PATH has no `cli`, so a user's own install still
   * wins, and so a launch with the bare launchd PATH finds the same file a
   * terminal does. A leading `~/` is the user's home directory (`USERPROFILE`
   * on Windows); a `*` segment is the newest version directory there. The first
   * executable file found becomes `executablePath`, so the version floor, the
   * login and `executableEnv` apply to it unchanged.
   */
  readonly fallbackExecutables?: Readonly<Partial<Record<NodeJS.Platform, readonly string[]>>> | undefined;
  /**
   * Where this agent puts a tool call's *programmatic* name, as dotted paths
   * into the notification, tried in order.
   *
   * Absent — which both reviewed agents are — means `acpNativeToolNamePaths`:
   * ACP's own `name`, then Claude's `_meta.claudeCode.toolName`, then Codex's
   * `rawInput.tool`. It is one ordered chain rather than a per-agent switch
   * because the three never collide (V-W3 evidence), so an adapter that adopts
   * the standard field is served by the first entry with no entry here at all.
   * Override it only for an adapter that puts the name somewhere none reach.
   */
  readonly nativeToolName?: readonly string[] | undefined;
  /**
   * Milliseconds the model probe waits after `session/new` for this agent to
   * push its own model list, never past the probe's deadline.
   *
   * Absent for an agent whose `session/new` answer is its whole list, so its
   * probe never waits. Set only for an agent seen to push a list later.
   */
  readonly modelListGrace?: number | undefined;
  /**
   * Oldest CLI version this adapter is known to drive.
   *
   * The probe reads `--version` anyway; below this floor the CLI is refused
   * up front (`CLI_TOO_OLD`) instead of failing mid-turn with a vendor error.
   */
  readonly minimumCliVersion?: string | undefined;
  /**
   * A real `<cli> --version` line, with its source in a comment beside it.
   *
   * The conformance suite feeds it to the version probe, which must read an
   * `x.y.z` from it at or above {@link AcpAgentProfile.minimumCliVersion}: a
   * vendor that changes its banner then fails a test, not a user's discovery.
   */
  readonly versionSample?: string | undefined;
  /**
   * The vendor's own install command, shown on a `CLI_NOT_FOUND` refusal.
   *
   * Copied from the vendor's documentation, never written from memory. Tau
   * never runs it; the host picks the line for its own platform.
   */
  readonly installCommand?: AcpShellCommand | undefined;
  /** The vendor's own update command, shown on a `CLI_TOO_OLD` refusal. Tau never runs it. */
  readonly updateCommand?: AcpShellCommand | undefined;
  /**
   * Terminal command shown when the agent needs its own local login. Tau never executes it.
   *
   * It starts with {@link AcpAgentProfile.cli}, so a sign-in surface can name a
   * CLI found outside PATH by its absolute path instead.
   */
  readonly loginCommand?: string | undefined;
  /**
   * The arguments of {@link AcpAgentProfile.loginCommand} after `cli`, as the CLI receives them.
   *
   * Tau's own sign-in tab starts the resolved `cli` with exactly these, never a
   * shell line, and only after the user presses Enter (ACP agent policy rule 10).
   */
  readonly loginArgs?: readonly string[] | undefined;
  /**
   * Mode ids, best first, a new chat starts in (ruling PR5): `auto`, then the
   * most permissive mode that still keeps a vendor safety boundary, so the
   * agent edits workspace files without asking but does not lift every check.
   * Plan and bypass ids are excluded (`acp-modes.ts`). The first one the agent
   * or its model offers wins; none offered keeps the agent's own mode.
   */
  readonly defaultModePreference?: readonly string[] | undefined;
} & (
  | {
      /** Npm package holding the ACP adapter. */
      readonly package: string;
      /** Exact reviewed adapter version. */
      readonly version: string;
      readonly args?: undefined;
    }
  | {
      /** Installed CLI that implements ACP itself. */
      readonly cli: string;
      /** Arguments selecting the CLI's ACP stdio transport. */
      readonly args: readonly string[];
      readonly package?: undefined;
      readonly version?: undefined;
    }
);

/** A platform every reviewed profile declares install locations for. @public */
export type AcpSupportedPlatform = 'darwin' | 'linux' | 'win32';

/** One vendor command, as a POSIX shell line and a Windows PowerShell line. @public */
export type AcpShellCommand = {
  /** For a POSIX shell on macOS and Linux. */
  readonly posix: string;
  /** For PowerShell on Windows. */
  readonly windows: string;
};

/**
 * A profile complete enough to ship (ACP agent policy rule 1).
 *
 * The base {@link AcpAgentProfile} keeps these fields optional so a test can
 * build a partial adapter; every entry of {@link acpAgentProfiles} satisfies
 * this type instead, so a profile missing one fails to compile.
 *
 * @public
 */
export type ReviewedAcpAgentProfile = AcpAgentProfile & {
  readonly cli: string;
  readonly minimumCliVersion: string;
  readonly versionSample: string;
  /**
   * Every supported platform, in search order after PATH. An empty list is
   * allowed only where no vendor location outside PATH is known, and says so.
   */
  readonly fallbackExecutables: Readonly<Record<AcpSupportedPlatform, readonly string[]>>;
  readonly installCommand: AcpShellCommand;
  readonly updateCommand: AcpShellCommand;
  readonly loginCommand: string;
  readonly loginArgs: readonly string[];
  readonly defaultModePreference: readonly string[];
};

/**
 * The reviewed agent set.
 *
 * Every fallback and command carries its evidence (ACP agent policy rule 2):
 * a vendor document or installer line read on the date given, or a dated
 * observation on a real install. The vendor commands are the ones in the
 * blueprint's Finding 2 (`docs/research/acp-agent-install-paths-blueprint.md`).
 *
 * @public
 */
export const acpAgentProfiles: readonly ReviewedAcpAgentProfile[] = [
  {
    id: 'claude',
    displayName: 'Claude Code',
    package: '@agentclientprotocol/claude-agent-acp',
    version: '0.70.0',
    cli: 'claude',
    configEnv: ['CLAUDE_CONFIG_DIR'],
    /* Without it the adapter's Agent SDK looks for its own platform package,
     * which staging omits, and every `session/new` fails "native binary not
     * found". The user's `claude` is the login X6 inherits anyway. */
    executableEnv: 'CLAUDE_CODE_EXECUTABLE',
    /* The `claudeCodeVersion` the adapter's Agent SDK 0.3.232 was built against;
     * an older CLI is refused rather than fed flags it does not know. */
    minimumCliVersion: '2.1.232',
    /* `~/.local/bin/claude --version` on the operator's Mac (native installer), 2026-11-15. */
    versionSample: '2.1.299 (Claude Code)',
    fallbackExecutables: {
      darwin: [
        /* Native installer: code.claude.com/docs/en/setup (install, auto-update
         * and uninstall sections), read 2026-11-15; observed on the operator's Mac. */
        '~/.local/bin/claude',
        /* Homebrew cask `claude-code` under both default prefixes: the same setup page. */
        '/opt/homebrew/bin/claude',
        '/usr/local/bin/claude',
        /* Claude.app's bundled CLI. Observation, not vendor documentation
         * (Principal ruling PR1): `.../claude-code/2.1.325/485fdac4332e/claude.app/...`
         * answered `2.1.325 (Claude Code)` on the operator's Mac, 2026-11-15.
         * Last on purpose; re-observe at each quarterly pin review. */
        '~/Library/Application Support/Claude/claude-code/*/*/claude.app/Contents/MacOS/claude',
      ],
      /* Native installer: the setup page, read 2026-11-15. */
      linux: ['~/.local/bin/claude'],
      /* Native installer: the setup page, read 2026-11-15. */
      win32: ['~/.local/bin/claude.exe'],
    },
    /* From code.claude.com/docs/en/setup, read 2026-11-15. `claude update` does not
     * upgrade a Homebrew, WinGet or apk install (the same page). */
    installCommand: {
      posix: 'curl -fsSL https://claude.ai/install.sh | bash',
      windows: 'irm https://claude.ai/install.ps1 | iex',
    },
    updateCommand: { posix: 'claude update', windows: 'claude update' },
    /* From code.claude.com/docs/en/cli-reference, read 2026-11-15. */
    loginCommand: 'claude auth login',
    loginArgs: ['auth', 'login'],
    /* The claude-agent-acp 0.70.0 `buildAvailableModes` (dist/acp-agent.js:5393) offers `auto` only when
     * `ModelInfo.supportsAutoMode === true`; `acceptEdits` ("Auto-accept file edit operations") is
     * the most permissive mode left that still asks before commands. */
    defaultModePreference: ['auto', 'acceptEdits'],
  },
  {
    id: 'codex',
    displayName: 'Codex',
    package: '@agentclientprotocol/codex-acp',
    version: '1.7.0',
    cli: 'codex',
    configEnv: ['CODEX_HOME'],
    /* Run the CLI this pin probed, not the adapter's own bundled `@openai/codex`
     * copy. X6 already makes the user's `codex` login the credential plane, and
     * the probe already refuses the adapter when that CLI is absent — so the
     * bundled copy is a second Codex nobody checked, and its platform payload is
     * 258 MB that the packaged app would otherwise have to carry. */
    executableEnv: 'CODEX_PATH',
    /* The copy codex-acp 1.7.0 bundles; an older PATH binary is refused. */
    minimumCliVersion: '0.148.0',
    /* `codex --version` on the operator's Mac (Homebrew link into ChatGPT.app), 2026-11-15. */
    versionSample: 'codex-cli 0.169.0-alpha.11.1',
    fallbackExecutables: {
      darwin: [
        /* Installer script: chatgpt.com/codex/install.sh:16 (`BIN_DIR`), read 2026-11-15. */
        '~/.local/bin/codex',
        /* Homebrew cask `codex`, or the cask `chatgpt` link: openai/codex README,
         * read 2026-11-15; the link into ChatGPT.app observed on the operator's Mac. */
        '/opt/homebrew/bin/codex',
        '/usr/local/bin/codex',
        /* The ChatGPT desktop app ships its own Codex CLI inside the bundle and
         * leaves PATH alone, so a user who installed Codex only that way has
         * one. Observed on the operator's Mac, system-wide before per-user. */
        '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex',
        '~/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex',
      ],
      /* Installer script: chatgpt.com/codex/install.sh:16 (`BIN_DIR`), read 2026-11-15. */
      linux: ['~/.local/bin/codex'],
      /* Installer script: chatgpt.com/codex/install.ps1:992, read 2026-11-15. */
      win32: ['~/AppData/Local/Programs/OpenAI/Codex/bin/codex.exe'],
    },
    /* From the openai/codex README and learn.chatgpt.com/docs/codex/cli, read 2026-11-15. */
    installCommand: {
      posix: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
      windows: 'powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"',
    },
    /* Listed by `codex --help` on the operator's Mac, 2026-11-15. */
    updateCommand: { posix: 'codex update', windows: 'codex update' },
    loginCommand: 'codex login',
    loginArgs: ['login'],
    /* The codex-acp 1.7.0 `AgentMode` (dist/index.js:27297-27339) offers no `auto`: `agent`
     * ("Approve for me", kind `auto_review`) is its classifier-reviewed mode and its own default,
     * then `read-only` ("Ask for approval", still workspace-write). `agent-full-access` is a bypass. */
    defaultModePreference: ['auto', 'agent', 'read-only'],
  },
  {
    id: 'grok',
    displayName: 'Grok Build',
    cli: 'grok',
    /* Permission notifications are process-scoped: never share a leader with other chats. */
    args: ['--no-auto-update', 'agent', '--no-leader', 'stdio'],
    /* Grok 1.0.52 pushes `_x.ai/models/update` 69-157 ms after `session/new`, and when it
     * started on an expired but renewable sign-in only that push holds its full list
     * (raw JSON-RPC on the operator's Mac, 2026-11-15). */
    modelListGrace: 1000,
    configEnv: ['GROK_HOME'],
    /* Official @xai-official/grok release verified with an unauthenticated
     * initialize; includes per-session pluginDirs for Tau's system skills. */
    minimumCliVersion: '1.0.52',
    /* `~/.grok/bin/grok --version` on the operator's Mac (installer script), 2026-11-15. */
    versionSample: 'grok 1.0.52 (0920c8169e27)',
    /* The installer also links an `agent` binary beside `grok` in both
     * directories (observed 2026-11-15). Tau never searches for it: the CLI is
     * `grok`, and `agent` is a name other vendors' CLIs use too. */
    fallbackExecutables: {
      /* From x.ai/cli/install.sh:206 (`BIN_DIR`) and :625 (the `~/.local/bin` link),
       * read 2026-11-15; both observed on the operator's Mac. */
      darwin: ['~/.grok/bin/grok', '~/.local/bin/grok'],
      /* From x.ai/cli/install.sh:206 and :625, read 2026-11-15. */
      linux: ['~/.grok/bin/grok', '~/.local/bin/grok'],
      /* From x.ai/cli/install.ps1:38 and :374, read 2026-11-15. */
      win32: ['~/.grok/bin/grok.exe'],
    },
    /* From docs.x.ai/build/overview and /build/cli/reference, read 2026-11-15. */
    installCommand: {
      posix: 'curl -fsSL https://x.ai/cli/install.sh | bash',
      windows: 'irm https://x.ai/cli/install.ps1 | iex',
    },
    updateCommand: { posix: 'grok update', windows: 'grok update' },
    loginCommand: 'grok login',
    loginArgs: ['login'],
    /* Grok's Tau-owned permission select (`grokControlOptions`) offers `auto` only when Grok reports
     * it enabled; its other modes are `ask` (its own default) and `always-approve` (yolo). Without
     * `auto` the chat starts in `grokNoAutoFallback` (PR5 amendment, operator 2026-11-17T03:42Z). */
    defaultModePreference: ['auto', grokNoAutoFallback],
  },
];

/** A resolved adapter, ready to spawn. @public */
export type AcpAdapter = AcpAgentProfile & {
  /**
   * Absolute path of `cli` on the adapter's PATH, or in a `fallbackExecutables`
   * bundle when PATH has none, found at resolution.
   *
   * The version probe, a native spawn and `executableEnv` all use this one
   * file. `undefined` when no such file exists, which the probe then refuses.
   */
  readonly executablePath?: string | undefined;
  /**
   * Which step found `executablePath`: PATH, or a declared fallback.
   *
   * A CLI found only at a fallback is not on the user's terminal PATH either,
   * so its sign-in command names the absolute path, and a spawn locates it
   * again when the file has moved (`resolveAcpAdapterExecutable`).
   */
  readonly executableSource?: 'path' | 'fallback' | undefined;
  /** Models the discovery probe read; empty when it failed (V5). */
  readonly models?: ExternalAgentDescriptor['models'] | undefined;
  /** The model select's `currentValue`: what a turn naming no model runs. */
  readonly defaultModel?: string | undefined;
  /** The agent's own reasoning choices from the same discovery session. */
  readonly thoughtLevel?: ExternalAgentDescriptor['thoughtLevel'];
  /** Verified non-model controls from the discovery session. */
  readonly configOptions?: ExternalAgentDescriptor['configOptions'];
} & (
    | {
        readonly package: string;
        /** Absolute entry module, run with this process's own Node. */
        readonly modulePath: string;
      }
    | {
        /** Native ACP executable and arguments, inherited from its profile. */
        readonly cli: string;
        readonly args: readonly string[];
        readonly modulePath?: undefined;
      }
  );

/** Why one agent is not advertised. @public */
export type AcpAdapterRefusal = {
  readonly id: string;
  readonly code: ExternalAgentRefusalCode;
  readonly message: string;
};

/** What this installation can and cannot start. @public */
export type AcpAgentDiscovery = {
  readonly agents: readonly AcpAdapter[];
  readonly refused: readonly AcpAdapterRefusal[];
};

/** Environment variable carrying test-only adapter overrides. @public */
export const acpAdapterOverrideVariable = 'TAU_ACP_ADAPTER_OVERRIDE';

type PackageManifest = { readonly bin?: string | Readonly<Record<string, string>> };

const binaryEntry = (manifest: PackageManifest, id: string): string | undefined => {
  if (typeof manifest.bin === 'string') {
    return manifest.bin;
  }
  const entries = Object.entries(manifest.bin ?? {});
  return (entries.find(([name]) => name.includes(id)) ?? entries[0])?.[1];
};

/**
 * Test-only adapter overrides, as `<absolute module path>:<agent id>` entries.
 *
 * Guarded on `NODE_ENV === 'test'` **in code, not by convention**: a production
 * daemon that inherited this variable would otherwise spawn an arbitrary module
 * under the user's own CLI credentials.
 *
 * @param environment - Environment to read; defaults to this process's.
 * @returns Overrides by agent id.
 */
const adapterOverrides = (environment: NodeJS.ProcessEnv): ReadonlyMap<string, string> => {
  const raw = environment[acpAdapterOverrideVariable];
  if (!raw || environment['NODE_ENV'] !== 'test') {
    return new Map();
  }
  return new Map(
    raw
      .split(',')
      .flatMap((entry) => {
        const separator = entry.lastIndexOf(':');
        if (separator <= 0) {
          return [];
        }
        return [[entry.slice(separator + 1).trim(), resolvePath(entry.slice(0, separator).trim())] as const];
      })
      .filter(([id, path]) => id !== '' && path !== ''),
  );
};

/**
 * Resolve every pinned adapter that is actually installed.
 *
 * @param options - Module URL to resolve from, plus pin/environment overrides.
 * @returns Installed adapters and a typed refusal for each that is missing.
 * @public
 *
 * @example <caption>Resolve from the distributed daemon</caption>
 * ```typescript
 * import { resolveAcpAdapters } from '@taucad/host';
 *
 * const { agents } = resolveAcpAdapters({ resolveFrom: import.meta.url });
 * ```
 */
export const resolveAcpAdapters = (options: {
  readonly resolveFrom: string;
  readonly pins?: readonly AcpAgentProfile[] | undefined;
  readonly environment?: NodeJS.ProcessEnv | undefined;
  /** Platform whose `fallbackExecutables` apply; defaults to this process's. */
  readonly platform?: NodeJS.Platform | undefined;
  /** File probe for locating CLIs; the real file system unless a test confines it. */
  readonly fileSystem?: AcpExecutableFileSystem | undefined;
}): AcpAgentDiscovery => {
  const environment = options.environment ?? process.env;
  const locating = acpLocateContext({ environment, platform: options.platform, fileSystem: options.fileSystem });
  const overrides = adapterOverrides(environment);
  const require = createRequire(options.resolveFrom);
  const agents: AcpAdapter[] = [];
  const refused: AcpAdapterRefusal[] = [];
  for (const profile of options.pins ?? acpAgentProfiles) {
    const override = overrides.get(profile.id);
    if (override) {
      /* An override replaces the adapter *and* its CLI probe: the fixture speaks
       * ACP on its own and has no vendor CLI to interrogate. */
      agents.push({
        ...profile,
        args: undefined,
        cli: undefined,
        package: 'test-override',
        version: '0.0.0',
        modulePath: override,
      });
      continue;
    }
    /* Found once here, not per probe: discovery probes versions and models in
     * parallel, and both must start the same executable. A CLI found nowhere
     * stays unset, and the version probe refuses it without running anything. */
    const location = locateAcpCli(profile, locating);
    const pin =
      location?.found === true
        ? { ...profile, executablePath: location.executablePath, executableSource: location.executableSource }
        : profile;
    if (pin.args !== undefined) {
      agents.push(pin);
      continue;
    }
    try {
      const manifestPath = require.resolve(`${pin.package}/package.json`);
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- an npm manifest is JSON with an optional `bin` field.
      const manifest = require(manifestPath) as PackageManifest;
      const binary = binaryEntry(manifest, pin.id);
      if (!binary) {
        refused.push({
          id: pin.id,
          code: 'ADAPTER_NO_BIN',
          message: `${pin.package} declares no bin entry to run as an ACP adapter.`,
        });
        continue;
      }
      agents.push({ ...pin, modulePath: resolvePath(dirname(manifestPath), binary) });
    } catch (error) {
      refused.push({
        id: pin.id,
        code: 'ADAPTER_NOT_INSTALLED',
        message: `${pin.package}@${pin.version} is not installed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
  return { agents, refused };
};

/**
 * Whether one dotted version sorts before another, numerically per segment.
 *
 * @param installed - The version the CLI reported.
 * @param floor - The pin's minimum.
 * @returns `true` when `installed` is older than `floor`.
 */
const olderThan = (installed: string, floor: string): boolean => {
  const a = installed.split('.').map(Number);
  const b = floor.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) {
      return (a[index] ?? 0) < (b[index] ?? 0);
    }
  }
  return false;
};

/** What `execFile` attaches to a failed run. */
type ExecFileFailure = {
  readonly code?: unknown;
  readonly killed?: unknown;
  readonly signal?: unknown;
  readonly stderr?: unknown;
  readonly message?: unknown;
};

/**
 * The refusal one failed `--version` run earns (ACP agent policy rule 5).
 *
 * Only a missing file is `CLI_NOT_FOUND`, because that refusal tells the user
 * to install a CLI. A timeout, a signal, a non-zero exit or a permission
 * error means the CLI is there and did not answer, which is
 * `EXTERNAL_AGENT_UNAVAILABLE` and carries no fix command.
 *
 * @param run - The probed adapter, the file that was run, what `execFile`
 *   rejected with, and the budget and the time the run took, in milliseconds.
 * @returns The refusal, with a message naming the file, the time and the exit.
 */
const probeFailure = ({
  adapter,
  executable,
  error,
  budget,
  elapsed,
}: {
  readonly adapter: AcpAdapter;
  readonly executable: string;
  readonly error: unknown;
  readonly budget: number;
  readonly elapsed: number;
}): AcpAdapterRefusal => {
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- execFile rejects with an Error carrying these optional fields.
  const failure = (typeof error === 'object' && error !== null ? error : {}) as ExecFileFailure;
  const after = `after ${String(elapsed)} ms of its ${String(budget)} ms budget`;
  if (failure.code === 'ENOENT') {
    return {
      id: adapter.id,
      code: 'CLI_NOT_FOUND',
      message: `${executable} was gone when \`--version\` ran (ENOENT).`,
    };
  }
  const stderr = typeof failure.stderr === 'string' ? failure.stderr.trim().split('\n')[0]?.slice(0, 200) : undefined;
  const detail = stderr ? `: ${stderr}` : '.';
  const message =
    failure.killed === true
      ? `${executable} --version did not answer within ${String(budget)} ms (ended by ${String(failure.signal)} ${after}).`
      : typeof failure.signal === 'string'
        ? `${executable} --version was ended by ${failure.signal} ${after}${detail}`
        : typeof failure.code === 'number'
          ? `${executable} --version exited with code ${String(failure.code)} ${after}${detail}`
          : `${executable} --version could not run (${typeof failure.code === 'string' ? failure.code : String(failure.message ?? error)}) ${after}.`;
  return { id: adapter.id, code: 'EXTERNAL_AGENT_UNAVAILABLE', message };
};

/**
 * Probe each adapter's underlying CLI once.
 *
 * The adapter inherits the CLI's own login (X6), so an adapter whose CLI is not
 * installed would fail every turn with a vendor error the user cannot act on.
 * Refusing it up front is the honest advertisement, with the code that is true
 * (ACP agent policy rule 5): a CLI found nowhere is `CLI_NOT_FOUND` and is not
 * run at all; one below the floor is `CLI_TOO_OLD`; one that does not answer is
 * `EXTERNAL_AGENT_UNAVAILABLE`. A version line with no `x.y.z` is not a
 * refusal: the agent is advertised and a warning is logged.
 *
 * @param discovery - Resolved adapters.
 * @param options - Probe timeout, environment and locator overrides, and where warnings go.
 * @returns The subset whose CLI answered, plus refusals for the rest.
 * @public
 */
export const probeAcpAgents = async (
  discovery: AcpAgentDiscovery,
  options: {
    readonly probeTimeout?: number | undefined;
    readonly environment?: NodeJS.ProcessEnv | undefined;
    /** Platform whose `fallbackExecutables` apply to an adapter resolution did not locate. */
    readonly platform?: NodeJS.Platform | undefined;
    /** File probe for that search; the real file system unless a test confines it. */
    readonly fileSystem?: AcpExecutableFileSystem | undefined;
    /** Receives a warning for a version line the probe cannot read; `console.warn` by default. */
    readonly onWarning?: ((message: string) => void) | undefined;
  } = {},
): Promise<AcpAgentDiscovery> => {
  const environment = options.environment ?? process.env;
  const budget = options.probeTimeout ?? acpCliProbeTimeout;
  const warn =
    options.onWarning ??
    ((message: string) => {
      console.warn(message);
    });
  const probes = await Promise.all(
    discovery.agents.map(async (adapter): Promise<AcpAdapter | AcpAdapterRefusal> => {
      if (!adapter.cli) {
        return adapter;
      }
      /* Resolution normally located it already; an adapter built elsewhere is located here. */
      const location =
        adapter.executablePath === undefined
          ? locateAcpCli(
              adapter,
              acpLocateContext({ environment, platform: options.platform, fileSystem: options.fileSystem }),
            )
          : undefined;
      if (location?.found === false) {
        return { id: adapter.id, code: 'CLI_NOT_FOUND', message: location.message };
      }
      const executable = adapter.executablePath ?? location?.executablePath ?? adapter.cli;
      const started = performance.now();
      try {
        const { stdout } = await execFileAsync(executable, ['--version'], {
          timeout: options.probeTimeout ?? acpCliProbeTimeout,
          env: environment,
        });
        const line = String(stdout).trim().split('\n')[0] ?? '';
        const installed = /\d+\.\d+\.\d+/u.exec(line)?.[0];
        const elapsed = Math.round(performance.now() - started);
        if (installed === undefined && elapsed >= budget) {
          /* A CLI that traps the timeout's signal and exits 0 resolves with
           * nothing printed; that is a probe that did not answer (rule 5). */
          return probeFailure({ adapter, executable, error: { killed: true, signal: 'SIGTERM' }, budget, elapsed });
        }
        if (installed === undefined) {
          /* A vendor changing its banner must not remove a working agent; the
           * profile's `versionSample` guards the parser instead (D13). */
          warn(
            `${adapter.id}: ${executable} --version printed no x.y.z version (${JSON.stringify(line.slice(0, 120))}); the ${String(adapter.minimumCliVersion)} floor was not checked.`,
          );
          return adapter;
        }
        if (adapter.minimumCliVersion !== undefined && olderThan(installed, adapter.minimumCliVersion)) {
          return {
            id: adapter.id,
            code: 'CLI_TOO_OLD',
            message: `The ${adapter.cli} CLI at ${executable} is ${installed}; ${adapter.displayName} needs ${adapter.minimumCliVersion} or newer.`,
          };
        }
        return adapter;
      } catch (error) {
        return probeFailure({ adapter, executable, error, budget, elapsed: Math.round(performance.now() - started) });
      }
    }),
  );
  return {
    agents: probes.filter((probe): probe is AcpAdapter => !('code' in probe)),
    refused: [...discovery.refused, ...probes.filter((probe): probe is AcpAdapterRefusal => 'code' in probe)],
  };
};

/**
 * Read one agent's model list by opening a throwaway session (V5, EQ1 A).
 *
 * `initialize` + `session/new` in a scratch directory is the only way ACP
 * offers: `InitializeResponse` carries no model list, and the sanctioned list
 * is the `category: 'model'` select on a session's config options. The session
 * is closed again, so the probe leaves no thread behind that the user did not
 * start.
 *
 * A failure is **never** a refusal. Claude's `session/new` succeeds on an
 * account whose prompts fail for billing, and Codex's fails outright when the
 * user is logged out — so an agent whose probe fails keeps its row and simply
 * offers no list until the chat's first session reports one (EQ1 fallback B).
 *
 * @param adapter - The resolved adapter to interrogate.
 * @param modelProbeTimeout - Milliseconds before the probe is abandoned.
 * @returns The adapter, with models and reasoning choices when the probe answered.
 */
const probeAgentModels = async (adapter: AcpAdapter, modelProbeTimeout: number): Promise<AcpAdapter> => {
  const cwd = await mkdtemp(join(tmpdir(), 'tau-acp-probe-'));
  let identifier = 0;
  const nextId = (): string => {
    identifier += 1;
    return `probe-${identifier}`;
  };
  const opening = openAcpSession({ adapter, cwd, createId: nextId });
  /* Its own clock: an adapter that answers `--version` in 10 ms can still hang
   * its handshake, and the boot must not wait on one that will not settle. */
  let probeExpiry: NodeJS.Timeout | undefined;
  const deadline = Date.now() + modelProbeTimeout;
  const expired = new Promise<undefined>((resolve) => {
    probeExpiry = setTimeout(() => {
      resolve(undefined);
    }, modelProbeTimeout);
    probeExpiry.unref();
  });
  /**
   * Close a session that opened after the deadline.
   *
   * Abandoned, not leaked: the probe has already returned, so the only thing
   * left to do with a late session is end it and kill its child.
   *
   * @param pending - The open that lost the race.
   */
  const closeLate = async (pending: Promise<AcpSession>): Promise<void> => {
    try {
      const late = await pending;
      await late.close();
    } catch {
      /* The probe already gave up on this adapter; how it died adds nothing. */
    }
  };
  try {
    const session = await Promise.race([opening, expired]);
    if (!session) {
      // async-iife: bootstrap -- the probe's deadline has passed; the late close is cleanup, not an answer.
      void closeLate(opening);
      return adapter;
    }
    /* An agent that pushes its model list after the open gets a short wait for it; the rest never wait. */
    const modelListGrace = Math.min(adapter.modelListGrace ?? 0, deadline - Date.now());
    if (modelListGrace > 0) {
      let graceExpiry: NodeJS.Timeout | undefined;
      await Promise.race([
        session.modelListPushed,
        new Promise<void>((resolve) => {
          graceExpiry = setTimeout(resolve, modelListGrace);
        }),
      ]);
      clearTimeout(graceExpiry);
    }
    /* Read after the wait: `configOptions` holds a pushed list. */
    const choice = modelChoice(session.configOptions);
    const thoughtOption = session.configOptions?.find(
      (option): option is Extract<SessionConfigOption, { type: 'select' }> =>
        option.category === 'thought_level' && option.type === 'select',
    );
    const thoughtLevelOf = (option: Extract<SessionConfigOption, { type: 'select' }> | undefined) =>
      option === undefined
        ? undefined
        : externalAgentDescriptorSchema.shape.thoughtLevel.safeParse({
            ...wireConfigOption(option),
            category: 'thought_level',
          }).data;
    const thoughtLevel = thoughtLevelOf(thoughtOption);
    /* What a new chat will run: plan values gone, the mode set to the default its first turn chooses (PR5). */
    const configOptions = discoveredModeOptions(session.configOptions ?? [], adapter.defaultModePreference)
      .filter((option) => option.category !== 'model' && option.category !== 'thought_level')
      .flatMap((option) => {
        const parsed = externalAgentDescriptorSchema.shape.configOptions
          .unwrap()
          .element.safeParse(wireConfigOption(option));
        return parsed.success ? [parsed.data] : [];
      })
      .slice(0, 32);
    const models: Array<ExternalAgentDescriptor['models'][number]> = [];
    for (const model of choice?.models ?? []) {
      if (Date.now() >= deadline) {
        models.push(model);
        continue;
      }
      const options =
        model.id === choice?.currentValue
          ? session.configOptions
          : // oxlint-disable-next-line no-await-in-loop -- One ACP session must select its models in order.
            await Promise.race([session.probeModel(model.id).catch(() => undefined), expired]);
      const offered = options?.find(
        (option): option is Extract<SessionConfigOption, { type: 'select' }> =>
          option.category === 'thought_level' && option.type === 'select',
      );
      const modelThoughtLevel = thoughtLevelOf(offered);
      models.push({ ...model, ...(modelThoughtLevel === undefined ? {} : { thoughtLevel: modelThoughtLevel }) });
    }
    await session.close();
    return {
      ...adapter,
      ...(choice === undefined
        ? {}
        : {
            models,
            ...(choice.currentValue === undefined ? {} : { defaultModel: choice.currentValue }),
          }),
      ...(thoughtLevel === undefined ? {} : { thoughtLevel }),
      ...(configOptions.length === 0 ? {} : { configOptions }),
    };
  } catch {
    return adapter;
  } finally {
    if (probeExpiry) {
      clearTimeout(probeExpiry);
    }
    try {
      await rm(cwd, { recursive: true, force: true });
    } catch {
      /* A scratch directory that outlives the probe is litter, never a failure. */
    }
  }
};

/**
 * Probe every resolved adapter's model and reasoning choices, in parallel.
 *
 * @param discovery - Resolved adapters.
 * @param options - Probe timeout override.
 * @returns The same agents, decorated with whatever each probe answered.
 * @public
 */
export const probeAcpAgentModels = async (
  discovery: AcpAgentDiscovery,
  options: { readonly modelProbeTimeout?: number | undefined } = {},
): Promise<AcpAgentDiscovery> => ({
  ...discovery,
  agents: await Promise.all(
    discovery.agents.map(async (adapter) =>
      probeAgentModels(adapter, options.modelProbeTimeout ?? acpModelProbeTimeout),
    ),
  ),
});

/**
 * The one command that clears a refusal, for the host's own shell.
 *
 * @param profile - The refused agent's profile, if the set knows it.
 * @param code - Why it was refused.
 * @param platform - Host platform; `win32` takes the PowerShell line.
 * @returns The command, or `undefined` when no user command clears this code.
 */
const fixCommandOf = (
  profile: AcpAgentProfile | undefined,
  code: ExternalAgentRefusalCode,
  platform: NodeJS.Platform,
): string | undefined => {
  const commands =
    code === 'CLI_NOT_FOUND' ? profile?.installCommand : code === 'CLI_TOO_OLD' ? profile?.updateCommand : undefined;
  return platform === 'win32' ? commands?.windows : commands?.posix;
};

/**
 * The canonical descriptor every tier carries, for one discovery (VSC1).
 *
 * Refused agents are descriptors too: the row exists so a GUI can say
 * `CLI_TOO_OLD` instead of quietly offering less than the user installed (V9).
 * Their `displayName` comes from the profile, because a refusal names an agent
 * that resolution knew about. So does their `fixCommand` (ACP agent policy
 * rule 9): the profile's install command for `CLI_NOT_FOUND` and its update
 * command for `CLI_TOO_OLD`, in the line for this host's own shell. No other
 * code is one the user can clear with a command, so no other carries one. The
 * refusal's message stays here: it holds local paths.
 *
 * @param discovery - What this installation can and cannot start.
 * @param profiles - Profile set the discovery came from; defaults to the reviewed one.
 * @param platform - Platform whose shell the fix command is for; defaults to this process's.
 * @returns One descriptor per known agent, startable first.
 * @public
 *
 * @example <caption>Advertise what this machine has</caption>
 * ```typescript
 * import { discoverAcpAgents, externalAgentDescriptors } from '@taucad/host';
 *
 * const descriptors = externalAgentDescriptors(await discoverAcpAgents({ resolveFrom: import.meta.url }));
 * ```
 */
export const externalAgentDescriptors = (
  discovery: AcpAgentDiscovery,
  profiles: readonly AcpAgentProfile[] = acpAgentProfiles,
  platform: NodeJS.Platform = process.platform,
): readonly ExternalAgentDescriptor[] => [
  ...discovery.agents.map((adapter) => ({
    id: adapter.id,
    displayName: adapter.displayName,
    models: [...(adapter.models ?? [])],
    ...(adapter.defaultModel === undefined ? {} : { defaultModel: adapter.defaultModel }),
    ...(adapter.thoughtLevel === undefined ? {} : { thoughtLevel: adapter.thoughtLevel }),
    ...(adapter.configOptions === undefined ? {} : { configOptions: adapter.configOptions }),
  })),
  ...discovery.refused.map((refusal) => {
    const profile = profiles.find((candidate) => candidate.id === refusal.id);
    const fixCommand = fixCommandOf(profile, refusal.code, platform);
    return {
      id: refusal.id,
      displayName: profile?.displayName ?? refusal.id,
      models: [],
      refusal: refusal.code,
      ...(fixCommand === undefined ? {} : { fixCommand }),
    };
  }),
];

/**
 * Resolve, probe the CLIs and probe the models in one step.
 *
 * The two probes run **together**, not in sequence: they answer different
 * questions on different clocks, and a boot that added them up would wait
 * `acpCliProbeTimeout + acpModelProbeTimeout` on a machine where both hang.
 *
 * @param options - Module URL to resolve from, plus probe overrides.
 * @returns The agents this daemon may advertise, with their model lists.
 * @public
 */
export const discoverAcpAgents = async (options: {
  readonly resolveFrom: string;
  readonly pins?: readonly AcpAgentProfile[] | undefined;
  readonly environment?: NodeJS.ProcessEnv | undefined;
  /** A host never passes this (ACP agent policy rule 7); only a test shortens the budget. */
  readonly probeTimeout?: number | undefined;
  readonly modelProbeTimeout?: number | undefined;
  /** `false` skips the model probe entirely, which only a test does. */
  readonly probeModels?: boolean | undefined;
  /** Platform whose `fallbackExecutables` apply; defaults to this process's. */
  readonly platform?: NodeJS.Platform | undefined;
  /** File probe for locating CLIs; the real file system unless a test confines it. */
  readonly fileSystem?: AcpExecutableFileSystem | undefined;
  /** Receives a warning for a version line the probe cannot read; `console.warn` by default. */
  readonly onWarning?: ((message: string) => void) | undefined;
}): Promise<AcpAgentDiscovery> => {
  const resolved = resolveAcpAdapters(options);
  /* An agent whose CLI is not on this machine is refused by the version probe;
   * opening a session for it would only spawn something that cannot answer. */
  const located = {
    ...resolved,
    agents: resolved.agents.filter((adapter) => adapter.cli === undefined || adapter.executablePath !== undefined),
  };
  const [probed, withModels] = await Promise.all([
    probeAcpAgents(resolved, {
      probeTimeout: options.probeTimeout,
      environment: options.environment,
      platform: options.platform,
      fileSystem: options.fileSystem,
      onWarning: options.onWarning,
    }),
    options.probeModels === false
      ? located
      : probeAcpAgentModels(
          located,
          options.modelProbeTimeout === undefined ? {} : { modelProbeTimeout: options.modelProbeTimeout },
        ),
  ]);
  const models = new Map(withModels.agents.map((adapter) => [adapter.id, adapter]));
  /* The version probe decides *who* is advertised and the model probe decides
   * *what* they offer, so the surviving set is the version probe's. */
  return { refused: probed.refused, agents: probed.agents.map((adapter) => models.get(adapter.id) ?? adapter) };
};
