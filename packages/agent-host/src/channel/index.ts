/* oxlint-disable no-barrel-files/no-barrel-files -- public browser-safe subpath barrel */

/**
 * `@taucad/agent-host/channel-client` — the client half of the T0 agent
 * channel, plus the two worker-channel bindings.
 *
 * Browser-safe: nothing here imports `node:`. The daemon-side assembly lives on
 * `@taucad/agent-host/launcher` instead.
 */

export { createAgentChannelClient } from '#channel/agent-channel-client.js';
export type { AgentChannelClient, AgentChannelClientOptions } from '#channel/agent-channel-client.js';
/* SC-G5: apps never import `@taucad/rpc`, so the close error a command rejects with is re-exported here. */
export { ChannelClosedError } from '@taucad/rpc';
export type { ChannelCloseCode, CloseInfo } from '@taucad/rpc';
export { agentChannelPort } from '#channel/endpoint.js';
export type { AgentChannelEndpoint } from '#channel/endpoint.js';
export { connectAgentWorkerChannel, serveAgentWorkerChannel } from '#channel/worker-channel.js';
export type { AgentWorkerChannelOptions } from '#channel/worker-channel.js';
export { connectTurnPlacementChannel, serveTurnPlacementChannel } from '#channel/turn-placement-channel.js';
export type {
  ConnectTurnPlacementChannelOptions,
  ServeTurnPlacementChannelOptions,
  TurnPlacementChannel,
  TurnPlacementChannelHandle,
  TurnPlacementSession,
  TurnPlacementToolPort,
} from '#channel/turn-placement-channel.js';
