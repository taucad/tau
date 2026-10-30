/* oxlint-disable no-barrel-files/no-barrel-files -- package subpath entry */
/**
 * `@taucad/native-process-core/shell`: the contained shell launch-session seam (blueprint W2). Internal until the
 * host shell service (W3) consumes it; nothing here is part of the published API.
 
 */
export type {
  PreparedShell,
  ShellExecution,
  ShellPreparation,
  ShellRecovery,
  ShellResource,
  ShellExit,
  ShellFilesystem,
  ShellLaunch,
  ShellLaunchOutcome,
  ShellNetwork,
  ShellPipesProcess,
  ShellProcess,
  ShellProvider,
  ShellRequirement,
  ShellStdio,
  ShellTerminalProcess,
  ShellTerminalSize,
} from '#shell/shell-provider.js';
export { shellBaselineDenied } from '#shell/shell-baseline.js';
export type { ShellBaselineOptions } from '#shell/shell-baseline.js';
export { refusedShellEnvironment } from '#shell/shell-environment.js';
export {
  resolveShellExecutable,
  shellCommandArguments,
  shellInteractiveArguments,
  shellVersionCommand,
} from '#shell/shell-identity.js';
export type {
  ResolveShellExecutableOptions,
  ShellExecutable,
  ShellExecutableRefusal,
  ShellKind,
} from '#shell/shell-identity.js';
export { createSandboxShellProvider } from '#shell/srt-shell-provider.js';
export type { SandboxShellProviderOptions } from '#shell/srt-shell-provider.js';
export { createFakeShellProvider } from '#shell/shell-fake.js';
export type { FakeShellOptions, FakeShellPhase, FakeShellProvider, FakeShellScript } from '#shell/shell-fake.js';
