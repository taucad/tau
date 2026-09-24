import type { CadAgentConfigInput, ModelProvider, TauAgentHostId } from '@taucad/chat';
import { getCadSystemPrompt } from '@taucad/chat/prompts';
import { getProviderFacingToolInputSchemas } from '@taucad/chat/schemas';
import type { ChatExecutionTarget } from '@taucad/chat/schemas';
import { modelSupportsInput } from '@taucad/chat';
import { generatePrefixedId } from '@taucad/utils/id';
import { idPrefix } from '@taucad/types/constants';
import { createCachedSystemPromptBlocks } from '@taucad/agent-host';
import type { AgentChannelClient } from '@taucad/agent-host';
import type { AgentHostClientOptions } from '#services/agent-host-client.js';
import { desktopWorkspaceRoot, openAgentHostChannel } from '#lib/agent-host-placement.js';
import type { ResolvedModel } from '#hooks/use-models.js';
import { admittedReasoning } from '#utils/model-reasoning.js';
import type {
  AgentHostAdmissionConfig,
  AgentHostExternalAgent,
  AgentHostExternalContext,
} from '#workers/agent-host.contract.js';
import { buildBrowserAgentHostSnapshotContext } from '#chat-clients/_internal/browser-agent-host-snapshot-context.js';
import type { TurnTrigger } from '#chat-clients/turn-intent.js';

/**
 * How one turn's wire body and host admission are composed.
 *
 * Extracted from `useCadChatClient` so the chat's turn host and the composer's
 * own verbs build one body from one place, rather than a copy each.
 */

export type BrowserHostAdmissionConfig = Omit<AgentHostAdmissionConfig, 'model'> & {
  readonly model: AgentHostClientOptions['model'];
};

/**
 * The admission a host-placed turn carries, in its two shapes.
 *
 * A Tau turn carries the browser-host config; an external-agent turn names the
 * agent and nothing else, because the agent brings its own model, its own tools
 * and the user's own CLI login (W4-ACP / X6).
 */
export type BrowserHostAdmission = TurnTrigger &
  (
    | { readonly config: BrowserHostAdmissionConfig }
    | { readonly agent: AgentHostExternalAgent; readonly context: AgentHostExternalContext }
  );

/**
 * The wire body one dispatch carries.
 *
 * The run id is minted here and travels as the admission's idempotency key, so
 * the same gesture retried with the same body is the same run end to end (V9).
 *
 * @param input - The turn's agent config, project, placement and host admission.
 * @returns The frozen `body` the transport parses.
 */
export const createRunBody = (input: {
  readonly agent: CadAgentConfigInput;
  readonly projectId: string;
  /** Which host writes this turn, and how it records what it wrote. */
  readonly execution?: ChatExecutionTarget | undefined;
  readonly browserHost?: ((runId: string) => BrowserHostAdmission) | undefined;
  /** Minted by the caller when it had to do async work for this same run. */
  readonly runId?: string | undefined;
}): Readonly<Record<string, unknown>> => {
  const runId = input.runId ?? generatePrefixedId(idPrefix.request);
  return Object.freeze({
    agent: input.agent,
    projectId: input.projectId,
    ...(input.execution === undefined ? {} : { execution: input.execution }),
    admission: Object.freeze({
      version: 1,
      idempotencyKey: runId,
    }),
    ...(input.browserHost === undefined ? {} : { browserHost: Object.freeze(input.browserHost(runId)) }),
  });
};

/**
 * Client-authored payloads (snapshot, context) are TS objects whose optional
 * fields surface as `undefined` properties; the admission wire and the durable
 * log speak strict JSON, which rejects them. One JSON round-trip normalizes.
 */
// oxlint-disable-next-line unicorn/prefer-structured-clone -- JSON serialization intentionally drops undefined fields.
const toStrictJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * The browser host's admission for one Tau turn.
 *
 * @param input - The turn's agent config, chat, run id and resolved model row.
 * @returns The prompt blocks, model wire, tool grant and context the host runs with.
 */
export const agentHostConfig = (input: {
  readonly agent: CadAgentConfigInput;
  readonly chatId: string;
  readonly runId: string;
  readonly resolvedModel: ResolvedModel;
}): BrowserHostAdmissionConfig => {
  const { agent, resolvedModel } = input;
  if (agent.execution.kind !== 'tau') {
    throw new TypeError('Browser agent host requires Tau execution.');
  }
  const { model } = resolvedModel;
  const prompt = getCadSystemPrompt(agent.kernel, agent.mode, agent.testingEnabled, {
    chatId: input.chatId,
    modelId: agent.execution.model,
    contextWindow: model?.details.contextWindow,
    knowledgeCutoff: model?.details.knowledgeCutoff,
    supportsImageInput: modelSupportsInput(model?.support, 'image'),
  });
  // One cache breakpoint per block that carries content. The workspace slot is
  // empty on this path, and emitting it anyway spent a breakpoint on nothing.
  const systemPromptBlocks = createCachedSystemPromptBlocks({
    staticPrompt: prompt.static,
    dynamicPrompt: prompt.dynamic,
  }) as AgentHostAdmissionConfig['systemPromptBlocks'];
  const snapshotContext = agent.snapshot ? buildBrowserAgentHostSnapshotContext(agent.snapshot) : undefined;
  const providerKind = requireProviderKind(model?.provider.id);
  /* The chat's level replaces the catalog default, clamped to what this model
   * offers — the picker reads the same helper, so what it shows is what runs. */
  const reasoning = admittedReasoning(model, agent.execution.effort);
  return {
    systemPrompt: [prompt.static, prompt.dynamic].join('\n\n'),
    systemPromptBlocks,
    model: {
      id: agent.execution.model,
      providerKind,
      contextWindow: model?.details.contextWindow ?? 128_000,
      ...(model?.details.maxTokens === undefined ? {} : { maxTokens: model.details.maxTokens }),
      ...(reasoning === undefined ? {} : { reasoning }),
      ...(model?.details.cost === undefined
        ? {}
        : {
            cost: {
              input: model.details.cost.inputTokens,
              output: model.details.cost.outputTokens,
              cacheRead: model.details.cost.cacheReadTokens,
              cacheWrite: model.details.cost.cacheWriteTokens,
            },
          }),
    },
    toolChoice: agent.toolChoice,
    allowedTools: getProviderFacingToolInputSchemas({
      toolChoice: agent.toolChoice,
      testingEnabled: agent.testingEnabled,
      modelSupport: model?.support,
    }).map(({ toolName }) => toolName),
    testingEnabled: agent.testingEnabled,
    snapshot: agent.snapshot === undefined ? undefined : toStrictJson(agent.snapshot),
    contextPayload: agent.contextPayload === undefined ? undefined : toStrictJson(agent.contextPayload),
    contextMessages: snapshotContext
      ? [
          {
            id: `tau:snapshot-context:${input.runId}`,
            role: 'user',
            content: snapshotContext,
            metadata: {
              tauInternal: {
                kind: 'snapshot-context',
                anchorId: input.chatId,
                pruning: 'replace-by-id',
              },
            },
          },
        ]
      : undefined,
  };
};

/**
 * The CAD context one external-agent turn carries (V12).
 *
 * @param input - The composer's agent configuration and the chat it runs in.
 * @returns The system prompt, skills and snapshot the daemon embeds.
 */
const externalAgentContext = (input: {
  readonly agent: CadAgentConfigInput;
  readonly chatId: string;
}): AgentHostExternalContext => {
  const { agent } = input;
  const prompt = getCadSystemPrompt(agent.kernel, agent.mode, agent.testingEnabled, { chatId: input.chatId });
  return {
    systemPrompt: [prompt.static, prompt.dynamic].join('\n\n'),
    ...(agent.snapshot === undefined ? {} : { snapshot: toStrictJson(agent.snapshot) }),
    ...(agent.contextPayload === undefined ? {} : { contextPayload: toStrictJson(agent.contextPayload) }),
  };
};

/**
 * Every Tau turn is a browser-host turn: the API-coordinated placement was
 * removed, not demoted.
 */
export const hostAdmission = (input: {
  readonly agent: CadAgentConfigInput;
  readonly chatId: string;
  readonly resolveModel: (modelId: string) => ResolvedModel;
  readonly trigger: TurnTrigger;
}): ((runId: string) => BrowserHostAdmission) | undefined => {
  if (input.agent.execution.kind === 'acp') {
    const { agentId, model, config } = input.agent.execution;
    return () => ({
      ...input.trigger,
      agent: {
        kind: 'acp',
        id: agentId,
        ...(model === undefined ? {} : { model }),
        ...(config === undefined ? {} : { config }),
      },
      /* The agent brings its own model, tools and login (X6), so none of the
       * Tau admission travels — but the CAD knowledge does. Composed by the
       * same helper a Tau turn uses, minus the model facts an external run has
       * no row for; the daemon sends it as embedded resources on the session's
       * first prompt (V12). */
      context: externalAgentContext({ agent: input.agent, chatId: input.chatId }),
    });
  }
  /* Every remaining kind is Tau: the union is exhausted above. */
  const resolvedModel = input.resolveModel(input.agent.execution.model);
  return (runId) => ({
    ...input.trigger,
    config: agentHostConfig({ agent: input.agent, chatId: input.chatId, runId, resolvedModel }),
  });
};

/**
 * Dial one daemon placement.
 *
 * Launcher 2 alone needs an argument beyond the host id: it is brokered per
 * *folder* — main grants a root and refuses everything else — so the desktop
 * placement resolves this project's absolute node path first. Every other
 * placement names its own workspace on the wire, and is dialled by id alone.
 *
 * @param hostId - The placement to dial.
 * @param projectId - Project whose node root launcher 2 is granted.
 * @returns An open channel client.
 */
export const dialAgentHost = async (hostId: TauAgentHostId, projectId: string): Promise<AgentChannelClient> =>
  hostId === 'desktop'
    ? openAgentHostChannel(hostId, { projectId, workspaceRoot: await desktopWorkspaceRoot(projectId) })
    : openAgentHostChannel(hostId);

const requireProviderKind = (provider: ModelProvider | undefined): ModelProvider => {
  if (!provider) {
    throw new Error('Browser agent host requires resolved model provider metadata.');
  }
  return provider;
};
