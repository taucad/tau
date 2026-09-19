/* oxlint-disable no-barrel-files/no-barrel-files -- public Node-only subpath barrel */

/**
 * `@taucad/agent-host/node-launcher` — the daemon-side assembly of the host.
 *
 * Node-only: it opens files under a workspace root. The command *vocabulary*
 * it answers is browser-safe and ships from the root barrel instead, because
 * the WebSocket client half validates against the same schemas.
 */

export { createNodeAgentLauncher } from '#launchers/node/node-agent-launcher.js';
export { serveAgentChannel } from '#launchers/node/agent-channel.js';
export type { AgentChannelEndpoint, ServeAgentChannelOptions } from '#launchers/node/agent-channel.js';
export type {
  HostAuthoredLogEvent,
  NodeAgentLauncher,
  NodeAgentLauncherOptions,
} from '#launchers/node/node-agent-launcher.js';
export type {
  ExternalAgentLogEvent,
  ExternalAgentPort,
  ExternalAgentTurn,
  ExternalSessionState,
  ExternalTurnOutcome,
} from '#host/tau-agent-host.js';
