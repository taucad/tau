/* oxlint-disable no-barrel-files/no-barrel-files -- library entry: the shell service @taucad/host re-exports and bundles */
/**
 * `@taucad/shell-service`: the rooted Node shell service, one bounded contained execution per agent call and the
 * interactive PTY sessions of the human Terminal, over the sandbox shell provider chosen at composition. Private:
 * `@taucad/host` bundles it and re-exports this surface from its root, so nothing outside the workspace imports this
 * name.
 */
export { createShellService, probeHostShell, shellApprovalKey, shellApprovalPrompt } from '#shell/shell-service.js';
export type {
  HostShell,
  ProbeHostShellOptions,
  ShellCheckout,
  ShellExecutionHolds,
  ShellHoldAnswer,
  ShellIdentity,
  ShellProbe,
  ShellProjectExecutions,
  ShellServiceOptions,
  ShellUnavailable,
  ShellUnavailableCode,
  TerminalAccess,
  TerminalRefusalCode,
  TerminalSession,
  TerminalSessionOutcome,
  TerminalSessionRequest,
} from '#shell/shell-service.js';
export { isShellError, shellLimits, shellLogDirectory, shellNotStartedCodes } from '#shell/shell-contract.js';
export type {
  ApprovedBy,
  PermissionMode,
  ShellAccess,
  ShellApprovalPayload,
  ShellApprovalRecord,
  ShellInput,
  ShellLog,
  ShellNotStartedCode,
  ShellOutput,
  ShellRunRequest,
  ShellStream,
} from '#shell/shell-contract.js';
