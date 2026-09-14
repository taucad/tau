/**
 * Engine-backed adapters. Node only: every module below spawns a process, so
 * this subpath is deliberately not reachable from the package's root barrel.
 *
 * The native Git *adapter* is not here, and neither is `NativeGitError`: both are
 * implementation details of `native-git-port.ts` (P56/AC23, review R9), which
 * catches that error and answers with a `RevisionPortError` before any caller
 * sees it. A disk host attaches through {@link createNativeGitRevisionPort}.
 */

export { runCommand, runGitCommand } from '#git-command.js';
export type { GitCommandResult } from '#git-command.js';
export { GitToolchainError, resolveGitToolchain } from '#git-toolchain.js';
export type { MissingGitTool } from '#git-toolchain.js';
export { createNativeGitRevisionPort } from '#native-git-port.js';
export type { NativeGitRemoteCredential, TauApiCredential } from '#native-git-port.js';
