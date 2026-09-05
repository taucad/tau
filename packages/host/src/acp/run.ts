/**
 * The external-agent run kind: `ExternalAgentPort`, backed by ACP adapters.
 *
 * **The materialized branch is the confinement.** SP-4 Result 3 is the reason:
 * `session/set_mode` was accepted and the agent then wrote outside its session
 * `cwd` with no permission request, because the user's own CLI config
 * (`approval_policy = "never"`, trusted project) beats the ACP mode. Inheriting
 * a CLI's auth means inheriting its policy, so confinement has to be filesystem
 * placement: every external run works in
 * `<workspaceRoot>/.tau/workspaces/<runId>/tree`, a plain recursive copy of the
 * workspace excluding `.tau/`. Bringing that work back is DT1 porcelain and is
 * deliberately not in this wave.
 *
 * Product copy must not promise per-action approval for external agents.
 */

import { cp, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import type { McpServer } from '@agentclientprotocol/sdk';

import type { ExternalAgentPort, ExternalAgentTurn } from '@taucad/agent-host';
import type { JsonObject } from '@taucad/agent-host';

import { ensureBranchDirectory, runAcpSession } from '#acp/session.js';
import type { AcpWireFrame } from '#acp/spawn.js';
import type { AcpAdapter } from '#acp/registry.js';

/** Name the daemon's own MCP server carries inside an agent session. @public */
export const tauMcpServerName = 'tau';

/** Options for {@link createAcpExternalAgentPort}. @public */
export type AcpExternalAgentPortOptions = {
  /** Adapters this daemon resolved and probed. */
  readonly agents: readonly AcpAdapter[];
  /** Absolute workspace root; branches are materialized beneath its `.tau/`. */
  readonly workspaceRoot: string;
  /**
   * Host-local MCP endpoint (X4). Present, every session is offered the `tau`
   * server with a capability minted for *that run*; absent, the agent runs with
   * its own tools only.
   */
  readonly mcp?:
    | {
        readonly url: string;
        mint(input: { readonly runId: string; readonly chatId: string }): { readonly token: string };
      }
    | undefined;
  readonly onFrame?: ((frame: AcpWireFrame) => void) | undefined;
  readonly createId?: (() => string) | undefined;
};

/**
 * Absolute branch directory for one run.
 *
 * @param workspaceRoot - Absolute workspace root.
 * @param runId - Run whose branch this is.
 * @returns The branch path.
 * @public
 */
export const branchDirectory = (workspaceRoot: string, runId: string): string =>
  join(workspaceRoot, '.tau', 'workspaces', runId, 'tree');

/**
 * Copy the workspace into a fresh branch, excluding Tau's own directory.
 *
 * No git: a branch is a directory, and the log, the artifacts and the other
 * branches all live under `.tau/`, which must not recurse into itself.
 *
 * @param workspaceRoot - Absolute workspace root.
 * @param branch - Absolute branch directory to materialize.
 */
const materializeBranch = async (workspaceRoot: string, branch: string): Promise<void> => {
  await ensureBranchDirectory(branch);
  /* Entry by entry, not one recursive `cp` of the root: the branch lives *under*
   * `.tau/`, and `fs.cp` refuses a destination inside its own source (EINVAL)
   * regardless of the filter. Skipping `.tau` at the top level is the whole
   * exclusion anyway — nothing else can contain the branch. */
  const entries = await readdir(workspaceRoot);
  await Promise.all(
    entries
      .filter((entry) => entry !== '.tau')
      .map(async (entry) => cp(join(workspaceRoot, entry), join(branch, entry), { recursive: true })),
  );
};

/**
 * The user's prompt text, flattened out of the provider message.
 *
 * @param turn - The turn whose message carries the prompt.
 * @returns The text, or `undefined` when this turn only reattaches.
 */
const promptTextOf = (turn: ExternalAgentTurn): string | undefined => {
  const { content } = turn.message ?? {};
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return undefined;
  }
  const text = content
    .flatMap((block) =>
      block !== null && typeof block === 'object' && !Array.isArray(block) && typeof block['text'] === 'string'
        ? [block['text']]
        : [],
    )
    .join('\n');
  return text === '' ? undefined : text;
};

const stringField = (state: JsonObject | undefined, name: string): string | undefined => {
  const value = state?.[name];
  return typeof value === 'string' ? value : undefined;
};

/**
 * Build the external-agent port over a set of resolved ACP adapters.
 *
 * @param options - Adapters, workspace root, and the optional MCP endpoint.
 * @returns The port `createNodeAgentLauncher` routes external starts to.
 * @public
 *
 * @example <caption>Wire ACP agents into a launcher</caption>
 * ```typescript
 * import { createAcpExternalAgentPort } from '@taucad/host';
 * import type { AcpAdapter } from '@taucad/host';
 *
 * declare const agents: readonly AcpAdapter[];
 * const externalAgents = createAcpExternalAgentPort({ agents, workspaceRoot: process.cwd() });
 * console.log(externalAgents.list());
 * ```
 */
export const createAcpExternalAgentPort = (options: AcpExternalAgentPortOptions): ExternalAgentPort => {
  const createId = options.createId ?? randomUUID;
  return {
    list: () => options.agents.map((adapter) => adapter.id),
    run: async (turn) => {
      const adapter = options.agents.find((candidate) => candidate.id === turn.agentId);
      if (!adapter) {
        throw Object.assign(new Error(`This Tau Host cannot start the ${turn.agentId} agent.`), {
          code: 'EXTERNAL_AGENT_UNAVAILABLE',
        });
      }
      const acpSessionId = stringField(turn.state, 'acpSessionId');
      const branch = stringField(turn.state, 'cwd') ?? branchDirectory(options.workspaceRoot, turn.runId);
      await (acpSessionId === undefined
        ? materializeBranch(options.workspaceRoot, branch)
        : ensureBranchDirectory(branch));
      const capability = options.mcp?.mint({ runId: turn.runId, chatId: turn.chatId });
      const mcpServers: readonly McpServer[] = capability
        ? [
            {
              type: 'http',
              name: tauMcpServerName,
              url: options.mcp?.url ?? '',
              headers: [{ name: 'Authorization', value: `Bearer ${capability.token}` }],
            },
          ]
        : [];
      const prompt = promptTextOf(turn);
      await runAcpSession({
        adapter,
        branch,
        mcpServers,
        turn,
        createId,
        ...(acpSessionId === undefined ? {} : { acpSessionId }),
        ...(prompt === undefined ? {} : { prompt }),
        ...(options.onFrame ? { onFrame: options.onFrame } : {}),
      });
    },
  };
};
