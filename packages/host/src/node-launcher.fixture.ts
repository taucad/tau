/**
 * Test fixture: a launcher over a real Node workspace with the gateway transport the old Node launcher built by
 * default. Tests only; hosts compose `createProjectHost`, or `createAgentLauncher` with `createNodeChatStore`.
 */

import { createGatewayModelTransport } from '@taucad/agent-host';
import type { ModelTransport } from '@taucad/agent-host';
import { createAgentLauncher } from '@taucad/agent-host/launcher';
import type { AgentLauncher, AgentLauncherOptions, CredentialState } from '@taucad/agent-host/launcher';
import { createNodeChatStore } from '@taucad/agent-host/node';

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
  });
};
