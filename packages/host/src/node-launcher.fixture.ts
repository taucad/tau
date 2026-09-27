/**
 * Test fixture: a launcher over a real Node workspace with the gateway transport the old Node launcher built by
 * default. Tests only; hosts compose `createProjectHost`, or `createAgentLauncher` with `createNodeChatStore`.
 */

import { createGatewayModelTransport } from '@taucad/agent-host';
import type { ModelTransport, ToolRegistry, TurnPlacementFact, TurnPlacementPort } from '@taucad/agent-host';
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
 * A placement that places every attempt on the live workspace with the launcher's own tools, and settles it with a
 * `turn.finalized` naming no revision: for tests of something other than revisions. Every CAD run is placed (D13).
 *
 * @param root - The workspace the grant names.
 * @param tools - The attempt's tools.
 * @returns The port.
 */
const livePlacement = (root: string, tools: ToolRegistry): TurnPlacementPort => {
  const facts: TurnPlacementFact[] = [];
  const wakes = new Set<() => void>();
  return {
    admit: async ({ requestId, checkoutId }) => ({
      requestId,
      status: 'applied',
      placement: { checkoutId: checkoutId ?? 'live', mode: 'direct', root, tools },
    }),
    complete: async ({ requestId, key }) => {
      facts.push({
        kind: 'settled',
        key,
        row: {
          type: 'turn.finalized',
          runId: key.runId,
          attempt: key.attempt,
          turnId: key.turnId,
          chatId: key.chatId,
          projectId: 'project-1',
          changedPaths: [],
          trigger: 'turn',
          runIds: [key.runId],
        },
      });
      for (const wake of wakes) {
        wake();
      }
      wakes.clear();
      return { requestId, status: 'applied' };
    },
    abandon: async ({ requestId }) => ({ requestId, status: 'applied' }),
    acknowledge: async ({ requestId }) => ({ requestId, status: 'applied' }),
    reconcile: async ({ requestId }) => ({ requestId, status: 'applied', held: [] }),
    async *settlements({ signal }) {
      let next = 0;
      while (!signal.aborted) {
        while (next < facts.length) {
          yield facts[next++]!;
        }
        // oxlint-disable-next-line no-await-in-loop -- a listen waits for its next fact.
        await new Promise<void>((resolve) => {
          wakes.add(resolve);
          signal.addEventListener('abort', () => {
            resolve();
          });
        });
      }
    },
  };
};

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
    turnPlacement: rest.turnPlacement ?? livePlacement(workspaceRoot, rest.toolRegistry),
  });
};
