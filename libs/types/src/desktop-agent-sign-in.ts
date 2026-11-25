import { z } from 'zod';

import { terminalLimits, terminalSizeSchema } from '#desktop-terminal.js';
import type { TerminalSize } from '#desktop-terminal.js';

/**
 * The desktop's external-agent sign-in tab wire (ACP agent policy rule 10, desktop Bash/Terminal blueprint D19/D20
 * amendment of 2026-11-16).
 *
 * The page names an agent and nothing else: main finds that agent in its own discovery and starts the agent's own CLI
 * with the profile's login arguments and the adapter's environment, never a shell, and only after the person presses
 * Enter (`start`). Preload holds the port and validates both directions. Output is terminal data for the person's
 * eyes: main relays it and keeps none of it, and the page draws it and keeps none of it.
 */

/** Fixed IPC routes between preload and main; the renderer never names a channel. @public */
export const desktopAgentSignInChannels = {
  /** Preload asks main for one sign-in port: `{ requestId, agentId }`. */
  open: 'tau:agent-sign-in:open',
  /** Main answers with the port, or `{ requestId, refusal }` and no port. */
  port: 'tau:agent-sign-in:port',
} as const;

/** Characters in an agent id, matching the descriptor's bound. @public */
export const agentSignInIdCharacters = 128;

/** @public */
export const agentSignInIdSchema = z.string().min(1).max(agentSignInIdCharacters);

/** Pane → main. @public */
export const agentSignInClientFrameSchema = z.discriminatedUnion('type', [
  /** The person pressed Enter on the filled-in command: start the CLI at this size. Sent at most once. */
  z.strictObject({ type: z.literal('start'), size: terminalSizeSchema }),
  z.strictObject({ type: z.literal('input'), data: z.string().min(1).max(terminalLimits.inputCharacters) }),
  z.strictObject({ type: z.literal('resize'), size: terminalSizeSchema }),
  z.strictObject({ type: z.literal('close') }),
]);

/** Why main will not start, or stopped, a sign-in. @public */
export const agentSignInRefusalCodes = [
  /** This computer's discovery lists no such agent, or the agent has no sign-in command. */
  'agent-not-found',
  /** The agent's CLI is no longer where it was found, or anywhere it is searched for. */
  'cli-not-found',
  /** A sign-in for this agent is already open. */
  'already-signing-in',
  /** The CLI could not be started in a terminal. */
  'pty-unavailable',
  'invalid-frame',
] as const;

/** @public */
export const agentSignInRefusalSchema = z.strictObject({
  code: z.enum(agentSignInRefusalCodes),
  message: z.string().max(2000),
});

/** Main → pane. @public */
export const agentSignInHostFrameSchema = z.discriminatedUnion('type', [
  /** What Enter will run, quoted for the host's shell; shown filled in, never run until `start`. */
  z.strictObject({ type: z.literal('ready'), commandLine: z.string().min(1).max(4096) }),
  z.strictObject({ type: z.literal('output'), data: z.string().max(terminalLimits.outputCharacters) }),
  z.strictObject({
    type: z.literal('exited'),
    exitCode: z.number().int().nullable(),
    signal: z.string().max(64).nullable(),
  }),
  z.strictObject({ type: z.literal('refused'), ...agentSignInRefusalSchema.shape }),
]);

/** @public */
export type AgentSignInClientFrame = z.infer<typeof agentSignInClientFrameSchema>;
/** @public */
export type AgentSignInHostFrame = z.infer<typeof agentSignInHostFrameSchema>;
/** @public */
export type AgentSignInRefusal = z.infer<typeof agentSignInRefusalSchema>;

/**
 * One sign-in tab's session as preload exposes it. Every method returns at once; the outcome arrives as host frames on
 * the listener, and every session ends with exactly one `exited` or `refused` frame.
 *
 * @public
 */
export type DesktopAgentSignInSession = {
  /** Run the filled-in command. Only the person's Enter or click calls this. */
  start(size: TerminalSize): void;
  input(data: string): void;
  resize(size: TerminalSize): void;
  /** End the sign-in; a running CLI is stopped. */
  close(): void;
};

/** The typed seam the desktop preload exposes as `window.tau.agentSignIn`. @public */
export type DesktopAgentSignInBridge = {
  open(agentId: string, listener: (frame: AgentSignInHostFrame) => void): DesktopAgentSignInSession;
};
