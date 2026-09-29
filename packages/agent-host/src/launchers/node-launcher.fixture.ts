/**
 * Test fixture: a launcher over a real Node workspace, with the gateway transport the old Node launcher built by
 * default. Tests only; hosts compose `createAgentLauncher` with `createNodeChatStore` themselves.
 */

import { fakePlacement } from '#host/tau-agent-host.fixture.js';
import { createAgentLauncher } from '#launchers/agent-launcher.js';
import type { AgentLauncher, AgentLauncherOptions, CredentialState } from '#launchers/agent-launcher.js';
import { createNodeChatStore } from '#node.js';
import { createGatewayModelTransport } from '#transport/gateway-model-transport.js';
import type { ModelTransport } from '#waist/ports.js';

/** Options for {@link createNodeLauncher}. */
export type NodeLauncherFixtureOptions = Omit<AgentLauncherOptions, 'chats' | 'modelTransport' | 'credential'> &
  Readonly<{
    workspaceRoot: string;
    gatewayBaseUrl?: string | undefined;
    auth?: (() => string | undefined | Promise<string | undefined>) | undefined;
    fetch?: typeof globalThis.fetch | undefined;
    modelTransport?: ModelTransport | undefined;
    credential?: (() => CredentialState) | undefined;
  }>;

/**
 * Build a launcher over a Node workspace for a test.
 *
 * @param options - The workspace, transport inputs and launcher options.
 * @returns The launcher.
 */
export const createNodeLauncher = (options: NodeLauncherFixtureOptions): AgentLauncher => {
  const { workspaceRoot, gatewayBaseUrl, auth, fetch, modelTransport, credential, ...rest } = options;
  return createAgentLauncher({
    ...rest,
    chats: createNodeChatStore({ workspaceRoot }),
    modelTransport:
      modelTransport ??
      createGatewayModelTransport({
        baseUrl: gatewayBaseUrl ?? 'http://127.0.0.1:1/',
        ...(rest.model ? { model: rest.model } : {}),
        ...(auth ? { auth } : {}),
        ...(fetch ? { fetch } : {}),
      }),
    credential: credential ?? (() => ({ mode: 'session' })),
    /* Every CAD run is placed (D13): a test that names no placement gets the fake. */
    turnPlacement: rest.turnPlacement ?? fakePlacement({ registry: rest.toolRegistry }).port,
  });
};
