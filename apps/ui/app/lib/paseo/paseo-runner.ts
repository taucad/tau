/**
 * The Paseo run kind of the browser agent host.
 *
 * `@getpaseo/client` is browser-native, so the page holds the E2EE session
 * itself and the Tau API is out of the data path entirely (charter X3 / SP-10).
 * This is an {@link ExternalAgentPort} on the host's run-kind registry — the
 * same seam W4-ACP's adapters use on the daemon — so admission, the durable
 * log, `resume`, the interrupt inbox and cancellation all stay on the host and
 * there is no second projection layer (orchestrator ruling 6).
 *
 * What this file owns is exactly what is Paseo-specific: opening the SDK
 * session, driving one turn, and keeping the `(epoch, seq)` cursor and the
 * send-exactly-once state on the run's own durable marker instead of the
 * `paseo_run_execution` table W4-PASEO dropped.
 */
import type { PaseoAgentHandle, PaseoAgentStream, PaseoClient } from '@getpaseo/client';
import type { McpServerConfig } from '@getpaseo/protocol/agent-types';
import type { ExternalAgentPort, ExternalAgentTurn, JsonObject } from '@taucad/agent-host';
import {
  advancePaseoCursor,
  decidePaseoPromptSend,
  isPaseoFrameNew,
  projectPaseoItem,
  timelineCarriesPrompt,
} from '#lib/paseo/paseo-timeline.js';
import type { PaseoCursor, PaseoSendState, PaseoToolCalls } from '#lib/paseo/paseo-timeline.js';

/** How a run reaches its daemon, and which agent it selected. @public */
export type PaseoRunSelection = Readonly<{
  connectionId: string;
  /** The template agent the user picked in the selector. */
  agentId: string;
}>;

/** Durable state this runner keeps on the run's marker. @public */
type PaseoRunState = Readonly<{
  /** The run-scoped agent actually created, never the template. */
  paseoAgentId?: string;
  paseoSendState?: PaseoSendState;
  paseoCursorEpoch?: string;
  paseoCursorSeq?: number;
}>;

const readState = (state: JsonObject | undefined): PaseoRunState => ({
  ...(typeof state?.['paseoAgentId'] === 'string' ? { paseoAgentId: state['paseoAgentId'] } : {}),
  ...(typeof state?.['paseoSendState'] === 'string'
    ? { paseoSendState: state['paseoSendState'] as PaseoSendState }
    : {}),
  ...(typeof state?.['paseoCursorEpoch'] === 'string' ? { paseoCursorEpoch: state['paseoCursorEpoch'] } : {}),
  ...(typeof state?.['paseoCursorSeq'] === 'number' ? { paseoCursorSeq: state['paseoCursorSeq'] } : {}),
});

const cursorOf = (state: PaseoRunState): PaseoCursor | undefined =>
  state.paseoCursorEpoch !== undefined && state.paseoCursorSeq !== undefined
    ? { epoch: state.paseoCursorEpoch, seq: state.paseoCursorSeq }
    : undefined;

const promptOf = (turn: ExternalAgentTurn): string => {
  const content = turn.message?.content;
  const text = Array.isArray(content)
    ? content
        .flatMap((part) =>
          typeof part === 'object' && part !== null && !Array.isArray(part) && part['type'] === 'text'
            ? [String(part['text'] ?? '')]
            : [],
        )
        .join('\n')
    : typeof content === 'string'
      ? content
      : '';
  if (text === '') {
    throw Object.assign(new Error('A Paseo turn needs a user prompt.'), { code: 'PASEO_PROMPT_EMPTY' });
  }
  return text;
};

/** A queue that hands live stream frames to the turn loop in arrival order. */
class FrameQueue {
  readonly #values: PaseoAgentStream[] = [];
  readonly #waiters: Array<(value: PaseoAgentStream) => void> = [];

  public push(value: PaseoAgentStream): void {
    const waiter = this.#waiters.shift();
    if (waiter) {
      waiter(value);
    } else {
      this.#values.push(value);
    }
  }

  public async next(signal: AbortSignal): Promise<PaseoAgentStream> {
    const value = this.#values.shift();
    if (value !== undefined) {
      return value;
    }
    if (signal.aborted) {
      throw new Error('PASEO_ABORTED');
    }
    return new Promise<PaseoAgentStream>((resolve, reject) => {
      const onAbort = (): void => {
        const index = this.#waiters.indexOf(waiter);
        if (index !== -1) {
          this.#waiters.splice(index, 1);
        }
        reject(new Error('PASEO_ABORTED'));
      };
      const waiter = (next: PaseoAgentStream): void => {
        signal.removeEventListener('abort', onAbort);
        resolve(next);
      };
      this.#waiters.push(waiter);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }
}

/** Options for {@link createPaseoRunnerPort}. @public */
export type CreatePaseoRunnerPortOptions = {
  /** Opens (or reuses) the page's SDK client for one paired connection. */
  readonly clientFor: (connectionId: string) => Promise<PaseoClient>;
  /**
   * MCP servers this run may offer the agent — Tau's own, minted by a paired
   * `tau serve` on the daemon's machine. Absent means the agent runs with no
   * Tau tools, which the selector says out loud rather than failing the turn.
   */
  readonly mcpServersFor?: (
    turn: ExternalAgentTurn,
  ) => Promise<Record<string, McpServerConfig> | undefined> | Record<string, McpServerConfig> | undefined;
  readonly createId: () => string;
};

/**
 * Build the Paseo {@link ExternalAgentPort} the browser worker registers.
 *
 * @param options - Client factory, selector inventory, MCP wiring, id factory.
 * @returns The port, keyed `paseo` on the host's runner registry.
 */
export const createPaseoRunnerPort = (options: CreatePaseoRunnerPortOptions): ExternalAgentPort => ({
  /* No `list`: a Paseo agent lives on the user's daemon behind an E2EE relay,
   * so the only way to enumerate is to open the session. This port refuses in
   * `run`, where it genuinely knows. */
  run: async (turn) => {
    const selection = turn.agent as unknown as PaseoRunSelection & { readonly connectionId?: string };
    if (typeof selection.connectionId !== 'string' || selection.connectionId === '') {
      throw Object.assign(new Error('A Paseo turn needs the connection it was selected on.'), {
        code: 'PASEO_CONNECTION_MISSING',
      });
    }
    const client = await options.clientFor(selection.connectionId);
    let state = readState(turn.state);
    const openToolCalls: PaseoToolCalls = new Map();
    let cursor = cursorOf(state);

    const remember = async (next: PaseoRunState): Promise<void> => {
      state = { ...state, ...next };
      await turn.remember({ ...next } as JsonObject);
    };

    const agent = await resolveRunAgent({ client, turn, state, options, remember });
    const queue = new FrameQueue();
    const unsubscribe = agent.timeline.subscribe((frame) => {
      queue.push(frame);
    });

    /** Drain the canonical timeline up to its head, projecting as we go. */
    const drain = async (): Promise<void> => {
      for (;;) {
        // oxlint-disable-next-line no-await-in-loop -- canonical cursor pagination is strictly sequential.
        const page = await agent.timeline.refetch({
          direction: cursor ? 'after' : 'tail',
          ...(cursor ? { cursor } : {}),
          limit: 200,
          projection: 'canonical',
        });
        const advanced = advancePaseoCursor(page, cursor);
        for (const { cursor: next, item } of advanced) {
          const events = projectPaseoItem(item, { agentId: agent.id, createId: options.createId, openToolCalls });
          if (events.length > 0) {
            // oxlint-disable-next-line no-await-in-loop -- durable ordering requires sequential appends.
            await turn.append(events);
          }
          cursor = next;
        }
        // oxlint-disable-next-line no-await-in-loop -- the cursor advances only after its page is durable.
        await remember({ paseoCursorEpoch: cursor?.epoch, paseoCursorSeq: cursor?.seq });
        if (!page.hasNewer || page.entries.length === 0) {
          return;
        }
      }
    };

    try {
      await drain();
      await deliverPrompt({ agent, turn, state, remember, drain });

      while (!turn.signal.aborted) {
        // oxlint-disable-next-line no-await-in-loop -- live frames define the execution order.
        const frame = await queue.next(turn.signal);
        const { event } = frame;
        if (event.type === 'timeline') {
          if (!isPaseoFrameNew(frame, cursor)) {
            continue;
          }
          const events = projectPaseoItem(event.item, {
            agentId: agent.id,
            createId: options.createId,
            openToolCalls,
          });
          if (events.length > 0) {
            // oxlint-disable-next-line no-await-in-loop -- durable ordering requires sequential appends.
            await turn.append(events);
          }
          cursor = { epoch: frame.epoch, seq: frame.seq };
          // oxlint-disable-next-line no-await-in-loop -- the cursor advances only after its events are durable.
          await remember({ paseoCursorEpoch: cursor.epoch, paseoCursorSeq: cursor.seq });
          continue;
        }
        if (event.type === 'permission_requested') {
          // oxlint-disable-next-line no-await-in-loop -- one decision at a time, in UI order.
          const outcome = await turn.approve({
            prompt: event.request.title ?? event.request.name,
            payload: { requestId: event.request.id, name: event.request.name, kind: event.request.kind },
          });
          // oxlint-disable-next-line no-await-in-loop -- the agent may not proceed before it is answered.
          await agent.respondToPermission(
            event.request.id,
            outcome === 'approved' ? { behavior: 'allow' } : { behavior: 'deny' },
          );
          continue;
        }
        if (event.type === 'turn_completed' || event.type === 'turn_failed' || event.type === 'turn_canceled') {
          // oxlint-disable-next-line no-await-in-loop -- terminal replay must drain before the turn ends.
          await drain();
          if (event.type === 'turn_failed') {
            throw Object.assign(new Error(event.error), { code: 'PASEO_TURN_FAILED' });
          }
          return;
        }
      }
    } finally {
      unsubscribe();
    }
  },
});

/** Resolve — or create — the run-scoped agent, never reusing the template. */
const resolveRunAgent = async (input: {
  readonly client: PaseoClient;
  readonly turn: ExternalAgentTurn;
  readonly state: PaseoRunState;
  readonly options: CreatePaseoRunnerPortOptions;
  readonly remember: (next: PaseoRunState) => Promise<void>;
}): Promise<PaseoAgentHandle> => {
  if (input.state.paseoAgentId) {
    return input.client.agents.ref(input.state.paseoAgentId);
  }
  /* A previous attempt may have created the agent and died before remembering
   * it; the label is the only durable link back, so look before creating. */
  const recovered = await input.client.agents.list({
    filter: { labels: { tauRunId: input.turn.runId } },
    page: { limit: 2 },
  });
  if (recovered.entries.length > 1) {
    throw Object.assign(new Error(`Multiple Paseo agents claim Tau run ${input.turn.runId}.`), {
      code: 'PASEO_RUN_AMBIGUOUS',
    });
  }
  const [existing] = recovered.entries;
  if (existing) {
    await input.remember({ paseoAgentId: existing.agent.id });
    return input.client.agents.ref(existing.agent.id);
  }

  const templateResult = await input.client.agents.ref(input.turn.agentId).refresh();
  const template = templateResult?.agent;
  if (!template) {
    throw Object.assign(new Error('The selected Paseo agent was not found.'), { code: 'PASEO_AGENT_MISSING' });
  }
  if (!template.model) {
    throw Object.assign(new Error('The selected Paseo agent has no model configured.'), {
      code: 'PASEO_AGENT_UNCONFIGURED',
    });
  }
  const mcpServers = await input.options.mcpServersFor?.(input.turn);
  const created = await input.client.agents.create({
    cwd: template.cwd,
    title: `Tau · ${template.title ?? template.provider}`,
    config: {
      provider: `${template.provider}/${template.model}`,
      ...(template.currentModeId ? { modeId: template.currentModeId } : {}),
      ...(template.thinkingOptionId ? { thinkingOptionId: template.thinkingOptionId } : {}),
      ...(mcpServers ? { mcpServers } : {}),
    },
    labels: { tauRunId: input.turn.runId, tauTemplateAgentId: input.turn.agentId },
    requestId: input.turn.runId,
  });
  await input.remember({ paseoAgentId: created.id, paseoSendState: 'pending' });
  return created;
};

/** Send this run's prompt exactly once, or refuse when that cannot be proved. */
const deliverPrompt = async (input: {
  readonly agent: PaseoAgentHandle;
  readonly turn: ExternalAgentTurn;
  readonly state: PaseoRunState;
  readonly remember: (next: PaseoRunState) => Promise<void>;
  readonly drain: () => Promise<void>;
}): Promise<void> => {
  if (!input.turn.message) {
    // A resume: the prompt was delivered by the attempt that admitted the run.
    return;
  }
  const page = await input.agent.timeline.refetch({ direction: 'tail', limit: 200, projection: 'canonical' });
  const decision = decidePaseoPromptSend(
    input.state.paseoSendState ?? 'pending',
    timelineCarriesPrompt(page, input.turn.runId),
  );
  if (decision === 'ambiguous') {
    throw Object.assign(new Error('Paseo prompt delivery is ambiguous after a reconnect; refusing to send twice.'), {
      code: 'PASEO_SEND_AMBIGUOUS',
    });
  }
  if (decision === 'reconcile') {
    await input.remember({ paseoSendState: 'sent' });
    await input.drain();
    return;
  }
  await input.remember({ paseoSendState: 'sending' });
  await input.agent.send(promptOf(input.turn), { messageId: input.turn.runId });
  await input.remember({ paseoSendState: 'sent' });
};
