/* oxlint-disable no-barrel-files/no-barrel-files -- library entry: the Terminal concern the desktop services host composes */
/**
 * `@taucad/desktop-terminal`: the desktop services host's `terminal` concern, one human PTY session per pane port
 * over the shell service, speaking the validated `@taucad/types/desktop-terminal` wire. Private and source-consumed:
 * the desktop app bundles it and binds its options to the services host's root allowlist and frames.
 */
export { createTerminalConcern, terminalAdmissionMilliseconds } from '#terminal-concern.js';
export type { TerminalConcern, TerminalConcernOptions, TerminalPort } from '#terminal-concern.js';
