/* oxlint-disable no-barrel-files/no-barrel-files -- public browser-safe subpath barrel */

/**
 * `@taucad/agent-host/launcher` — the server half of the agent channel, in any process (W6 RH-S2).
 *
 * Browser-safe: nothing here imports `node:`. A host builds one launcher per project over a platform's chat store,
 * from `@taucad/agent-host/node` or `@taucad/agent-host/browser`, and serves each connection with
 * `serveAgentChannel`. The client half ships from `@taucad/agent-host/channel-client`.
 */

export { createAgentLauncher, credentialPrincipal } from '#launchers/agent-launcher.js';
export type { AgentLauncher, AgentLauncherOptions, CredentialState } from '#launchers/agent-launcher.js';
export type { ChatStore } from '#launchers/chat-store.js';
export { serveAgentChannel } from '#launchers/agent-channel.js';
export type { ServeAgentChannelOptions } from '#launchers/agent-channel.js';
export type { AgentChannelEndpoint } from '#channel/endpoint.js';
export type {
  ExternalAgentLogEvent,
  ExternalAgentPort,
  ExternalAgentTurn,
  ExternalSessionState,
  ExternalTurnOutcome,
} from '#host/external-agent.js';
