/* oxlint-disable no-barrel-files/no-barrel-files -- package subpath entry */
/**
 * `@taucad/native-process-core/shell`: the contained shell launch-session seam (blueprint W2). Internal until the
 * host shell service (W3) consumes it; nothing here is part of the published API.
 *
 * @packageDocumentation
 */
export type {
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
