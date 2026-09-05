/* oxlint-disable no-barrel-files/no-barrel-files -- public browser-safe subpath barrel */

/**
 * `@taucad/agent-host/channel-client` — the client half of the T0 agent
 * channel, plus the two worker-channel bindings.
 *
 * Browser-safe: nothing here imports `node:`. The daemon-side assembly lives on
 * `@taucad/agent-host/node-launcher` instead.
 */

// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
export { AgentChannelError, createAgentChannelClient } from '#channel/agent-channel-client.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
export type {
  AgentChannelClient,
  AgentChannelClientOptions,
  AgentChannelCloseReason,
} from '#channel/agent-channel-client.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
export { agentChannelPort } from '#channel/endpoint.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
export type { AgentChannelEndpoint } from '#channel/endpoint.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
export { connectAgentWorkerChannel, serveAgentWorkerChannel } from '#channel/worker-channel.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
export type { AgentWorkerChannelOptions } from '#channel/worker-channel.js';
