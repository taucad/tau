import { randomUUID } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { defineCommand } from 'citty';
import type { AgentChannelClient } from '@taucad/agent-host/channel-client';
import type { CommandAnswer } from '@taucad/agent-host/wire';

import {
  eventLine,
  isSettled,
  oneLine,
  openAgentChannel,
  pendingInterrupts,
  readPrompt,
  refusalText,
  replayChat,
  sendCommand,
} from '#commands/agent/client.js';
import type { ExternalRefusal } from '#commands/agent/client.js';
import { cliError, emit, exitCodes, writeStdout } from '#output.js';

const hostArgument = {
  type: 'string',
  description: 'Tau Host origin, such as http://127.0.0.1:7777 (defaults to TAU_HOST_URL)',
  required: false,
} as const;

const jsonArgument = {
  type: 'boolean',
  description: 'Write one versioned JSON result record to stdout instead of plain lines',
  required: false,
} as const;

const jsonlArgument = {
  type: 'boolean',
  description: 'Write one versioned JSON record per event, ending with an outcome record',
  required: false,
} as const;

const chatArgument = { type: 'positional', description: 'Chat id', required: true } as const;
const runArgument = { type: 'positional', description: 'Run id', required: true } as const;

/**
 * Run one command against a daemon and release the socket afterwards.
 *
 * @internal
 * @param host - The `--host` value, when the caller passed one.
 * @param body - What to do with the connected client.
 * @returns Whatever `body` returned.
 */
const withChannel = async <T>(
  host: string | undefined,
  body: (client: AgentChannelClient) => Promise<T>,
): Promise<T> => {
  const { client } = await openAgentChannel(host);
  try {
    return await body(client);
  } finally {
    client.close('tau-cli finished');
  }
};

/** An answer the host applied: recorded at a cursor, or naming the state it found. */
type AppliedAnswer = Exclude<CommandAnswer, { status: 'refused' }>;

/**
 * The state an answer that recorded nothing names, when it names one.
 *
 * @internal
 * @param answer - The host's answer.
 * @returns `details.state`, or nothing.
 */
const stateOf = (answer: AppliedAnswer): string | undefined => {
  const state = answer.effect === 'not-applied' ? answer.details['state'] : undefined;
  return typeof state === 'string' ? state : undefined;
};

/**
 * Write a command's answer as plain lines or as one JSON record.
 *
 * @internal
 * @param input - The verb sent, the run it named, the host's answer, and the machine-mode flag.
 * @returns A promise that settles once the result is flushed.
 */
const reportOperation = async (input: {
  readonly operation: string;
  readonly runId: string;
  readonly answer: AppliedAnswer;
  readonly json: boolean;
}): Promise<void> => {
  const { answer } = input;
  const state = stateOf(answer);
  const facts = {
    status: answer.status,
    ...(answer.effect === 'durable' ? { cursor: answer.cursor } : {}),
    ...(state === undefined ? {} : { state }),
  };
  if (input.json) {
    await emit({ kind: 'agent', ok: true, operation: input.operation, run: input.runId, ...facts });
    return;
  }
  const lines = [['operation', input.operation], ['run', input.runId], ...Object.entries(facts)];
  await writeStdout(lines.map(([key, value]) => `${String(key)}\t${String(value)}\n`).join(''));
};

/**
 * Replay a chat's durable events, optionally following until the run settles.
 *
 * @internal
 * @param input - The client, what to read, and how to render it.
 * @returns The last run state observed, and any typed refusal it carried.
 */
const streamChat = async (input: {
  readonly client: AgentChannelClient;
  readonly chatId: string;
  readonly from: number;
  readonly follow: boolean;
  readonly jsonl: boolean;
}): Promise<{ readonly state: string | undefined; readonly refusal: ExternalRefusal | undefined }> => {
  const { state, refusal } = await replayChat({
    client: input.client,
    chatId: input.chatId,
    from: input.from,
    follow: input.follow,
    onEvent: async (event) => {
      await (input.jsonl ? emit({ kind: 'event', chatId: input.chatId, event }) : writeStdout(`${eventLine(event)}\n`));
    },
  });
  if (input.jsonl) {
    await emit({ kind: 'outcome', ok: true, chatId: input.chatId, state: state ?? null });
  }
  return { state, refusal };
};

/**
 * The one exit a typed external-agent refusal takes on the scripted surface.
 *
 * A refusal names something the operator can do — log in, pick another model,
 * install the adapter — so it exits `refused` under the host's own code rather
 * than as a generic run failure (VSC4).
 *
 * @internal
 * @param refusal - The refusal the transcript carried, when it carried one.
 */
const throwRefused = (refusal: ExternalRefusal | undefined): void => {
  if (refusal !== undefined) {
    throw cliError(refusal.code, refusalText(refusal), exitCodes.refused);
  }
};

const listCommand = defineCommand({
  meta: {
    name: 'list',
    description: 'List the chats stored in a local workspace',
  },
  args: {
    workspace: {
      type: 'string',
      description: 'Workspace root whose .tau/chats directory is listed (defaults to the working directory)',
      required: false,
    },
    host: hostArgument,
    json: jsonArgument,
  },
  async run({ args }) {
    if ((args.host ?? process.env['TAU_HOST_URL'] ?? '') !== '') {
      throw cliError(
        'HOST_CHAT_LIST_UNSUPPORTED',
        'The agent channel has no command that lists chats, so a remote host cannot be listed. Run `tau agent list` in the workspace the host serves, or name a chat directly with `tau agent show <chat>`.',
        exitCodes.refused,
      );
    }

    const chatsRoot = join(resolve(args.workspace ?? process.cwd()), '.tau', 'chats');
    const entries = await readdir(chatsRoot, { withFileTypes: true }).catch(() => []);
    const chats: Array<{ chat: string; bytes: number; updatedAt: string }> = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- a bounded directory read stays ordered and serial.
      const log = await stat(join(chatsRoot, entry.name, 'events.jsonl')).catch(() => undefined);
      if (log) {
        chats.push({ chat: entry.name, bytes: log.size, updatedAt: new Date(log.mtimeMs).toISOString() });
      }
    }
    chats.sort((left, right) => left.chat.localeCompare(right.chat));

    if (args.json) {
      await emit({ kind: 'chats', ok: true, workspace: chatsRoot, chats });
      return;
    }
    await writeStdout(chats.map((row) => `${row.chat}\t${String(row.bytes)}\t${row.updatedAt}\n`).join(''));
  },
});

const showCommand = defineCommand({
  meta: {
    name: 'show',
    description: 'Print a chat transcript from the beginning and exit',
  },
  args: { chat: chatArgument, host: hostArgument, jsonl: jsonlArgument },
  async run({ args }) {
    await withChannel(args.host, async (client) => {
      await streamChat({ client, chatId: args.chat, from: 0, follow: false, jsonl: args.jsonl === true });
    });
  },
});

const tailCommand = defineCommand({
  meta: {
    name: 'tail',
    description: 'Stream a chat transcript from a cursor until its run settles',
  },
  args: {
    chat: chatArgument,
    from: {
      type: 'string',
      description: 'Cursor to resume from; the same cursor always replays the same events',
      required: false,
    },
    host: hostArgument,
    jsonl: jsonlArgument,
  },
  async run({ args }) {
    const from = args.from === undefined ? 0 : Number(args.from);
    if (!Number.isInteger(from) || from < 0) {
      throw cliError(
        'CURSOR_INVALID',
        `--from takes a non-negative event cursor, not "${args.from ?? ''}".`,
        exitCodes.usage,
      );
    }
    const { refusal } = await withChannel(args.host, async (client) =>
      streamChat({ client, chatId: args.chat, from, follow: true, jsonl: args.jsonl === true }),
    );
    throwRefused(refusal);
  },
});

const runCommand = defineCommand({
  meta: {
    name: 'run',
    description: 'Start a turn in a chat and follow it until it settles',
  },
  args: {
    chat: chatArgument,
    prompt: { type: 'positional', description: 'Prompt text, or "-" to read it from stdin', required: false },
    file: { type: 'string', description: 'Read the prompt from this file instead of the argument', required: false },
    detach: {
      type: 'boolean',
      description: 'Return as soon as the host has accepted the run instead of following it',
      required: false,
    },
    agent: {
      type: 'string',
      description: 'Run the turn on an external ACP agent the host advertises, such as codex or claude',
      required: false,
    },
    model: {
      type: 'string',
      description: "Model id for --agent, such as gpt-5.3-codex-spark; absent takes the adapter's default",
      required: false,
    },
    host: hostArgument,
    jsonl: jsonlArgument,
  },
  async run({ args }) {
    const prompt = await readPrompt({ prompt: args.prompt, file: args.file });
    const runId = randomUUID();
    const jsonl = args.jsonl === true;
    if (args.agent === undefined && args.model !== undefined) {
      throw cliError(
        'MODEL_WITHOUT_AGENT',
        "--model selects the model of an external agent, so it needs --agent. A Tau turn runs the host's own model row.",
        exitCodes.usage,
      );
    }

    const outcome = await withChannel(args.host, async (client) => {
      /* One key for this invocation: the channel re-sends it after a redial, and
       * a start that already landed answers `replayed` instead of a second run. */
      const started = await sendCommand(client, {
        type: 'start',
        commandId: randomUUID(),
        payload: {
          chatId: args.chat,
          runId,
          trigger: 'submit',
          message: { id: randomUUID(), role: 'user', content: prompt },
          ...(args.agent === undefined
            ? {}
            : {
                /* The host routes on `agent` before it composes anything, so the
                 * two Tau fields beside it are inert for this turn — the wire
                 * requires them, the external run never reads them. */
                config: {
                  agent: { kind: 'acp', id: args.agent, ...(args.model === undefined ? {} : { model: args.model }) },
                  systemPrompt: '',
                  toolChoice: 'auto',
                } as const,
              }),
        },
      });

      if (args.detach === true) {
        /* The only host this command can reach is a resident daemon it dialled,
         * and it has answered with an admitted run — which is exactly the
         * condition a detached run needs. A refusal never reaches here:
         * `sendCommand` throws it under the host's own code. */
        await reportOperation({ operation: 'start', runId, answer: started, json: jsonl });
        if (jsonl) {
          /* A `--jsonl` stream ends in an outcome record even when nothing was
           * followed; a missing one reads as truncation to a machine reader. */
          await emit({ kind: 'outcome', ok: true, chatId: args.chat, run: runId, status: started.status });
        }
        /* A detached caller followed nothing, so it saw no refusal either: the
         * run's own transcript is where a later `tau agent tail` reads one. */
        return { followed: false, state: stateOf(started), refusal: undefined };
      }
      /* The admission row's cursor is where this turn starts, so following it
       * replays this run rather than every turn the chat has ever held. */
      const from = started.effect === 'durable' ? started.cursor : 0;
      return { followed: true, ...(await streamChat({ client, chatId: args.chat, from, follow: true, jsonl })) };
    });

    const { state } = outcome;
    if (!outcome.followed) {
      return;
    }
    throwRefused(outcome.refusal);
    if (state === 'failed') {
      throw cliError(
        'RUN_FAILED',
        `Run ${runId} failed. Read the transcript with \`tau agent show ${args.chat}\`.`,
        exitCodes.error,
      );
    }
    if (state !== undefined && state !== 'completed') {
      throw cliError(
        'RUN_NOT_COMPLETED',
        `Run ${runId} ended as "${state}" and produced no result.`,
        exitCodes.unknown,
      );
    }
  },
});

const cancelCommand = defineCommand({
  meta: {
    name: 'cancel',
    description: 'Ask a host to cancel a run and report what state it reached',
  },
  args: { chat: chatArgument, run: runArgument, host: hostArgument, json: jsonArgument },
  async run({ args }) {
    const answer = await withChannel(args.host, async (client) =>
      sendCommand(client, { type: 'cancel', commandId: randomUUID(), payload: { chatId: args.chat, runId: args.run } }),
    );
    await reportOperation({ operation: 'cancel', runId: args.run, answer, json: args.json === true });
    /* A durable answer is the terminal row itself (I18); one that recorded
     * nothing names the state the run was already in. */
    const state = stateOf(answer);
    if (answer.effect === 'not-applied' && !isSettled(state)) {
      throw cliError(
        'CANCEL_NOT_SETTLED',
        `Cancellation was requested; run ${args.run} is still "${state ?? 'unknown'}". Watch it settle with \`tau agent tail ${args.chat}\`.`,
        exitCodes.unknown,
      );
    }
  },
});

const steerCommand = defineCommand({
  meta: {
    name: 'steer',
    description: 'Send mid-run guidance to a running turn',
  },
  args: {
    chat: chatArgument,
    run: runArgument,
    message: { type: 'positional', description: 'Guidance for the running turn', required: true },
    host: hostArgument,
    json: jsonArgument,
  },
  async run({ args }) {
    const answer = await withChannel(args.host, async (client) =>
      sendCommand(client, {
        type: 'steer',
        commandId: randomUUID(),
        payload: { chatId: args.chat, runId: args.run, message: args.message },
      }),
    );
    await reportOperation({ operation: 'steer', runId: args.run, answer, json: args.json === true });
  },
});

/**
 * Narrow a positional outcome to the three the wire accepts.
 *
 * @internal
 * @param value - The positional argument as typed.
 * @returns The same value, narrowed.
 */
const asInterruptOutcome = (value: string): 'approved' | 'denied' | 'cancelled' => {
  if (value === 'approved' || value === 'denied' || value === 'cancelled') {
    return value;
  }
  throw cliError(
    'INTERRUPT_OUTCOME_INVALID',
    `"${oneLine(value)}" is not an interrupt outcome. Pass approved, denied, or cancelled.`,
    exitCodes.usage,
  );
};

const respondCommand = defineCommand({
  meta: {
    name: 'respond',
    description: 'Resolve an approval a run is paused on',
  },
  args: {
    chat: chatArgument,
    run: runArgument,
    interrupt: { type: 'positional', description: 'Interrupt id from the transcript', required: true },
    outcome: { type: 'positional', description: 'approved, denied, or cancelled', required: true },
    option: {
      type: 'string',
      description: 'Exact option id the request offered, when it offered a list',
      required: false,
    },
    host: hostArgument,
    json: jsonArgument,
  },
  async run({ args }) {
    const outcome = asInterruptOutcome(args.outcome);

    const answer = await withChannel(args.host, async (client) => {
      const pending = await pendingInterrupts({ client, chatId: args.chat });
      if (!pending.some((request) => request.interruptId === args.interrupt)) {
        throw cliError(
          'INTERRUPT_NOT_PENDING',
          `Chat ${args.chat} has no unresolved interrupt "${oneLine(args.interrupt)}". Pending: ${pending.length === 0 ? 'none' : pending.map((request) => request.interruptId).join(', ')}.`,
          exitCodes.refused,
        );
      }
      return sendCommand(client, {
        type: 'resolve-interrupt',
        commandId: randomUUID(),
        payload: {
          chatId: args.chat,
          runId: args.run,
          interruptId: args.interrupt,
          outcome,
          ...(args.option === undefined ? {} : { optionId: args.option }),
        },
      });
    });

    await reportOperation({ operation: 'resolve-interrupt', runId: args.run, answer, json: args.json === true });
  },
});

/**
 * `tau agent` command family.
 *
 * Every command that reaches a host names it with `--host` (or `TAU_HOST_URL`)
 * and authorizes itself with `TAU_HOST_AGENT_TOKEN`. Signals take their default
 * disposition: a viewer holds nothing the daemon depends on, so detaching
 * abruptly is exactly what a resident run is built to survive.
 *
 * @example <caption>Drive a run on a local daemon</caption>
 * ```bash
 * export TAU_HOST_URL=http://127.0.0.1:7777
 * tau agent run chat-1 "extrude the plate to 6 mm"
 * tau agent tail chat-1 --from=0 --jsonl
 * tau agent respond chat-1 run-1 interrupt-1 approved --option=allow
 * ```
 */
export const agentCommand = defineCommand({
  meta: {
    name: 'agent',
    description: 'Drive agent runs on a Tau Host',
  },
  subCommands: {
    list: listCommand,
    show: showCommand,
    tail: tailCommand,
    run: runCommand,
    cancel: cancelCommand,
    steer: steerCommand,
    respond: respondCommand,
  },
});
