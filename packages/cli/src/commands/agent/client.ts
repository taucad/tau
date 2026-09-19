/**
 * Host resolution, the agent-channel dial, and the cursored read that every
 * `tau agent` command shares.
 *
 * There is no host registry and no discovery: a scripted caller names the
 * daemon it means with `--host` (or `TAU_HOST_URL`) and authorizes itself with
 * `TAU_HOST_AGENT_TOKEN` — exactly the two facts `tau serve` reports when it
 * starts. Anything less is refused rather than guessed at.
 */

import { readFile } from 'node:fs/promises';
import { text as readStream } from 'node:stream/consumers';

import type {
  AgentChannelResponse,
  AgentLogEvent,
  EventLogBatch,
  ExternalAgentLogin,
  ProviderMessage,
} from '@taucad/agent-host';
import type { AgentChannelClient } from '@taucad/agent-host/channel-client';

import { cliError, exitCodes, sanitize } from '#output.js';
import type { CliError } from '#output.js';

/** Largest prompt accepted from a file or from stdin. Bytes. */
const promptByteLimit = 1_048_576;

/** How long a follow waits before asking for the next page. Milliseconds. */
const pollInterval = 200;

/** Run states past which nothing more will be appended for that run. */
const terminalStates = new Set(['completed', 'failed', 'cancelled']);

/**
 * The one refusal for "this command needs a host and you did not name one".
 *
 * @internal
 * @param missing - The fact the caller left out.
 * @returns A `HOST_NOT_SPECIFIED` refusal, exit 3.
 */
const hostNotSpecified = (missing: string): CliError =>
  cliError(
    'HOST_NOT_SPECIFIED',
    `${missing} A Tau Host is named explicitly: pass --host <url> (or set TAU_HOST_URL) and export TAU_HOST_AGENT_TOKEN with the token that \`tau serve\` was started with.`,
    exitCodes.refused,
  );

/**
 * Resolve the daemon origin this invocation addresses.
 *
 * @internal
 * @param host - The `--host` value, when the caller passed one.
 * @returns The daemon origin.
 */
export const resolveHostUrl = (host: string | undefined): URL => {
  const named = host ?? process.env['TAU_HOST_URL'];
  if (named === undefined || named === '') {
    throw hostNotSpecified('No Tau Host was named.');
  }

  try {
    return new URL(named);
  } catch {
    throw cliError(
      'HOST_URL_INVALID',
      `"${named}" is not a URL. Pass the origin \`tau serve\` printed, such as --host http://127.0.0.1:7777.`,
      exitCodes.usage,
    );
  }
};

/**
 * Read the agent-channel bearer from the environment.
 *
 * The token is never a command-line argument: `argv` is world-readable on every
 * platform this CLI runs on, which is why `tau serve` takes it the same way.
 *
 * @internal
 * @returns The bearer token.
 */
export const resolveHostToken = (): string => {
  const token = process.env['TAU_HOST_AGENT_TOKEN'];
  if (token === undefined || token === '') {
    throw hostNotSpecified('TAU_HOST_AGENT_TOKEN is not set.');
  }
  return token;
};

/**
 * Open one agent channel to a daemon, or refuse with the reason it failed.
 *
 * Node's global `WebSocket` cannot set request headers, so the admission bearer
 * has nowhere to ride on it; `ws` is used for that one reason.
 *
 * @internal
 * @param host - The `--host` value, when the caller passed one.
 * @returns A connected client, and the origin it is connected to.
 */
export const openAgentChannel = async (
  host: string | undefined,
): Promise<{ readonly client: AgentChannelClient; readonly url: URL }> => {
  const url = resolveHostUrl(host);
  const token = resolveHostToken();
  const socketUrl = new URL('/agent', url);
  socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:';

  /* Loaded here, not at module scope: `ws` and the channel client are the
   * expensive half of this module, and `tau tui` paints before it dials. */
  const [ws, { createAgentChannelClient }] = await Promise.all([
    import('ws'),
    import('@taucad/agent-host/channel-client'),
  ]);
  const socket = new ws.WebSocket(socketUrl.href, { headers: { authorization: `Bearer ${token}` } });
  /* Wrapped before `open`, deliberately: the daemon posts its channel hello the
   * instant the upgrade completes, and `ws` drops a frame nobody listens for. */
  const client = createAgentChannelClient(socket, { sessionKey: 'tau-agent' });
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw /\b401\b|\b403\b/u.test(detail)
      ? cliError(
          'HOST_UNAUTHORIZED',
          `${socketUrl.origin} refused this agent token (${sanitize(detail)}). TAU_HOST_AGENT_TOKEN must be the token that host was started with.`,
          exitCodes.refused,
        )
      : cliError(
          'HOST_UNREACHABLE',
          `No agent channel answered at ${socketUrl.origin} (${sanitize(detail)}). Start one with \`tau serve --trust-projects --agentPort=<port>\`.`,
          exitCodes.error,
        );
  }
  return { client, url };
};

/**
 * Narrow a channel answer to the run projection a command asked for.
 *
 * @internal
 * @param answer - Whatever the daemon replied with.
 * @returns The `result` frame.
 */
export const expectResult = (answer: AgentChannelResponse): Extract<AgentChannelResponse, { type: 'result' }> => {
  if (answer.type !== 'result') {
    throw cliError(
      'HOST_ANSWER_UNEXPECTED',
      `The host answered a "${answer.type}" frame where a run projection was expected.`,
      exitCodes.error,
    );
  }
  return answer;
};

/**
 * Read one bounded replay page.
 *
 * @internal
 * @param input - The connected client, the chat, and the cursor to read from.
 * @returns The page the daemon served.
 */
export const readPage = async (input: {
  readonly client: AgentChannelClient;
  readonly chatId: string;
  readonly cursor: number;
  /**
   * Reconnect rather than merely read.
   *
   * `attach` is the one command that recovers a run a daemon restart left
   * hanging — an external run's `resumeExternal` is reachable from nowhere else
   * — so a follow sends it once, for its first page, and reads the rest with
   * `tail`. Sending it on every poll would ask the daemon to re-recover a run it
   * is already executing.
   */
  readonly attach?: boolean;
}): Promise<EventLogBatch> => {
  const { agentChannelTailBatchLimit } = await import('@taucad/agent-host');
  const answer = await input.client.execute({
    type: input.attach === true ? 'attach' : 'tail',
    chatId: input.chatId,
    cursor: input.cursor,
    limit: agentChannelTailBatchLimit,
  });
  if (answer.type !== 'tail' && answer.type !== 'attach') {
    throw cliError(
      'HOST_ANSWER_UNEXPECTED',
      `The host answered a "${answer.type}" frame where a replay page was expected.`,
      exitCodes.error,
    );
  }
  return answer.batch;
};

/**
 * Whether a run state means nothing more will be appended for that run.
 *
 * @internal
 * @param state - A `run.lifecycle` state, or nothing seen yet.
 * @returns `true` once the run has settled.
 */
export const isSettled = (state: string | undefined): boolean => state !== undefined && terminalStates.has(state);

/*
 * Whether anyone is still reading stdout.
 *
 * A reader that closes early (`… | head -c 20`) is only observable to a writer
 * when a write fails, and a quiet follow may have nothing to write for minutes
 * — so this asks with a zero-length write, which reaches the pipe and reports
 * EPIPE without emitting a byte. Without it, `tail | head` never ends.
 */
const sinkAlive = async (): Promise<boolean> =>
  new Promise<boolean>((resolve) => {
    process.stdout.write('', (error) => {
      resolve((error as NodeJS.ErrnoException | undefined)?.code !== 'EPIPE');
    });
  });

/**
 * Replay a chat from a cursor, optionally following it until its run settles.
 *
 * Each page is awaited before the next is asked for, so the daemon is never
 * asked to buffer ahead of the consumer, and a reader that closes its pipe
 * stops the loop instead of leaving it polling forever.
 *
 * A follow opens with `attach`, never `tail`: reconnecting is the one act that
 * recovers a run a daemon restart left hanging, and a follower is exactly the
 * client that wants it. A `show` (or the interrupt scan behind `respond`) reads
 * with `tail`, because reading a transcript must not restart anything.
 *
 * @internal
 * @param input - The client, the chat, where to start, whether to keep
 * following, and the per-event sink.
 * @returns The cursor reached, the last run state, and any typed refusal it carried.
 */
export const replayChat = async (input: {
  readonly client: AgentChannelClient;
  readonly chatId: string;
  readonly from: number;
  readonly follow: boolean;
  readonly onEvent: (event: AgentLogEvent) => Promise<void>;
}): Promise<{
  readonly cursor: number;
  readonly state: string | undefined;
  readonly refusal: ExternalRefusal | undefined;
}> => {
  let cursor = input.from;
  let state: string | undefined;
  let login: ExternalAgentLogin | undefined;
  let refusal: ExternalRefusal | undefined;
  let attach = input.follow;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- a cursored replay is sequential by definition.
    const batch = await readPage({ client: input.client, chatId: input.chatId, cursor, attach });
    attach = false;
    for (const event of batch.events) {
      if (event.type === 'run.lifecycle') {
        state = event.state;
      }
      login = externalLoginOf(event) ?? login;
      const coded = externalRefusalOf(event);
      refusal = coded === undefined ? refusal : { ...coded, ...(login === undefined ? {} : { login }) };
      // oxlint-disable-next-line no-await-in-loop -- each record is flushed before the next is written.
      await input.onEvent(event);
    }
    cursor = batch.nextCursor;

    const caughtUp = batch.events.length === 0 || cursor >= batch.endCursor;
    // oxlint-disable-next-line no-await-in-loop -- the reader is re-checked on every pass.
    if ((caughtUp && (!input.follow || isSettled(state))) || !(await sinkAlive())) {
      return { cursor, state, refusal };
    }
    if (caughtUp) {
      // oxlint-disable-next-line no-await-in-loop -- let the daemon append before asking again.
      await new Promise((resolve) => {
        setTimeout(resolve, pollInterval);
      });
    }
  }
};

/**
 * The interrupts a chat has raised and nobody has resolved.
 *
 * `pendingInterrupts` lives on the launcher, not on the wire, so the durable
 * `interrupt.recorded` records are the only source a client has — and they are
 * a complete one, because a resolution is durable too.
 *
 * @internal
 * @param input - The client and the chat to inspect.
 * @returns Every unresolved interrupt, oldest first.
 */
export const pendingInterrupts = async (input: {
  readonly client: AgentChannelClient;
  readonly chatId: string;
}): Promise<ReadonlyArray<{ readonly interruptId: string; readonly runId: string; readonly reason: string }>> => {
  const requested = new Map<string, { interruptId: string; runId: string; reason: string }>();
  await replayChat({
    ...input,
    from: 0,
    follow: false,
    onEvent: async (event) => {
      if (event.type !== 'interrupt.recorded') {
        return;
      }
      if (event.phase === 'resolved') {
        requested.delete(event.interruptId);
        return;
      }
      requested.set(event.interruptId, {
        interruptId: event.interruptId,
        runId: event.runId,
        reason: event.reason,
      });
    },
  });
  return [...requested.values()];
};

/**
 * Collapse untrusted display text onto one line.
 *
 * @internal
 * @param text - Text from a host, a model, or a tool.
 * @returns The same text with escapes stripped and line breaks folded.
 */
export const oneLine = (text: string): string =>
  sanitize(text)
    .replaceAll(/[\t\n\r]+/gu, ' ')
    .trim();

/**
 * Whether a decoded JSON value can be read by key.
 *
 * @internal
 * @param value - Any decoded JSON value.
 * @returns `true` for a plain object.
 */
export const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A typed external-agent refusal, with whatever the user needs to act on it. @internal */
export type ExternalRefusal = {
  /** One of `externalAgentRefusalCodes` (VSC4), or any later code a host adds. */
  readonly code: string;
  readonly message: string;
  readonly login?: ExternalAgentLogin | undefined;
};

/** The external agent a durable record names. @internal */
export type ExternalAgentFacts = { readonly agentId: string; readonly model?: string | undefined };

/**
 * The typed refusal a terminal lifecycle carried, if it named a code (VSC4).
 *
 * A code, not a code *list*: the host owns the vocabulary and D14 keeps an older
 * reader able to read a newer writer's value, so a surface that renders whatever
 * code it is handed never has to be taught a new one.
 *
 * @internal
 * @param event - One durable record.
 * @returns The refusal, or nothing.
 */
export const externalRefusalOf = (event: AgentLogEvent): ExternalRefusal | undefined =>
  event.type === 'run.lifecycle' && event.state === 'failed' && event.detail?.code !== undefined
    ? { code: event.detail.code, message: event.detail.message }
    : undefined;

/**
 * The login facts an interrupt carried, if it carried any (V11).
 *
 * Duck-typed rather than parsed with the published schema: this module is on
 * `tau tui`'s first-paint path, and importing a Zod schema to read one literal
 * discriminant would load the whole wire barrel before the app draws.
 *
 * @internal
 * @param event - One durable record.
 * @returns The login payload, or nothing.
 */
export const externalLoginOf = (event: AgentLogEvent): ExternalAgentLogin | undefined => {
  if (event.type !== 'interrupt.recorded' || event.phase !== 'requested' || !isRecord(event.payload)) {
    return undefined;
  }
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the discriminant is checked, and the host writes this shape.
  return event.payload['kind'] === 'external-agent-login'
    ? (event.payload as unknown as ExternalAgentLogin)
    : undefined;
};

/**
 * The external agent and model a durable message was admitted with.
 *
 * @internal
 * @param event - One durable record.
 * @returns The agent facts, or nothing for a Tau turn.
 */
export const externalAgentOf = (event: AgentLogEvent): ExternalAgentFacts | undefined => {
  const message =
    event.type === 'message.appended'
      ? event.message
      : event.type === 'message.envelope-replaced'
        ? event.replacement
        : undefined;
  const marker = message?.metadata?.tauInternal;
  if (!isRecord(marker) || marker['kind'] !== 'external-agent' || typeof marker['agentId'] !== 'string') {
    return undefined;
  }
  return { agentId: marker['agentId'], ...(typeof marker['model'] === 'string' ? { model: marker['model'] } : {}) };
};

/**
 * The one rendering of a typed refusal, shared by `tau agent` and `tau tui`.
 *
 * Tau never brokers the credential (X6): an authentication refusal is answered
 * by naming the command the *user* runs in their own terminal, or the page the
 * agent is waiting on — never by a flow this process drives.
 *
 * @internal
 * @param refusal - The code the host returned, its message, and any login facts.
 * @returns The refusal as display lines, newest fact last.
 */
export const refusalText = (refusal: ExternalRefusal): string => {
  const { login } = refusal;
  const lines = [`${refusal.code}: ${oneLine(refusal.message)}`];
  if (login?.url !== undefined) {
    const code = login.code === undefined ? '' : ` and enter ${oneLine(login.code)}`;
    lines.push(`Open ${oneLine(login.url)}${code} to finish signing in to ${oneLine(login.agentId)}.`);
  }
  for (const method of login?.authMethods ?? []) {
    lines.push(
      method.terminalCommand === undefined
        ? `${oneLine(method.name)}: sign in to ${oneLine(login?.agentId ?? '')} yourself — Tau never handles the credential.`
        : `Run \`${oneLine(method.terminalCommand)}\` in your own terminal, then start the turn again.`,
    );
  }
  return lines.join('\n');
};

/**
 * One status glyph per tool-call status, with its ANSI-16 role.
 *
 * DESIGN's colour law holds in the terminal: the colour is on the leading
 * symbol and the text beside it stays neutral, and the glyph carries the
 * meaning on its own so `NO_COLOR` loses nothing.
 */
const callGlyphs = new Map<string, { readonly glyph: string; readonly ansi?: string }>([
  ['pending', { glyph: '○' }],
  ['in_progress', { glyph: '●', ansi: '36' }],
  ['completed', { glyph: '✓', ansi: '32' }],
  ['failed', { glyph: '✗', ansi: '31' }],
]);

const glyphAnsi = new Map([...callGlyphs.values()].map(({ glyph, ansi }) => [glyph, ansi]));

/**
 * Paint one leading glyph, unless the terminal or the user says not to.
 *
 * @param glyph - The status symbol.
 * @returns The glyph, coloured only where colour is welcome.
 */
const paintGlyph = (glyph: string): string => {
  const ansi = glyphAnsi.get(glyph);
  if (ansi === undefined || process.env['NO_COLOR'] !== undefined || !process.stdout.isTTY) {
    return glyph;
  }
  return `\u001B[${ansi}m${glyph}\u001B[0m`;
};

const messageText = (message: ProviderMessage): string => {
  if (message.role === 'tool-input' || message.role === 'tool-output') {
    /* One titled line per call: the emitter's own title when it wrote one, its
     * tool name otherwise. The body stays out of plain output — `--jsonl` is
     * where the whole record lives. */
    const status =
      message.role === 'tool-output' ? (message.isError ? 'failed' : 'completed') : (message.call?.status ?? 'pending');
    return `${callGlyphs.get(status)?.glyph ?? '○'} ${message.call?.title ?? message.toolName}`;
  }
  return `${message.role} ${typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}`;
};

const summaryOf = (event: AgentLogEvent): string => {
  if (event.type === 'message.appended' || event.type === 'message.envelope-replaced') {
    /* A replacement carries the whole message, so it prints like the append it
     * supersedes rather than as a blank row. Attribution is durable truth, so
     * it rides the line the record produced: a chat whose agent has since
     * moved still says who answered this turn. */
    const message = event.type === 'message.appended' ? event.message : event.replacement;
    const agent = externalAgentOf(event);
    const by = agent === undefined ? '' : ` [${agent.agentId}${agent.model === undefined ? '' : ` ${agent.model}`}]`;
    return `${messageText(message)}${by}`;
  }
  if (event.type === 'run.lifecycle') {
    /* `state` cannot say why a turn ended short (V6), so the executor's own
     * reason and the refusal code travel beside it rather than replacing it. */
    return [event.state, event.stopReason, event.detail?.code].filter((part) => part !== undefined).join(' ');
  }
  if (event.type === 'interrupt.recorded') {
    return `${event.phase} ${event.interruptId} ${event.reason}`;
  }
  return '';
};

/**
 * Render one durable event as a single plain-output line.
 *
 * @internal
 * @param event - One durable record.
 * @returns A tab-separated `sequence`, `type` and summary line.
 */
export const eventLine = (event: AgentLogEvent): string => {
  /* `oneLine` strips escape sequences, so the glyph is painted after it — the
   * untrusted half of the line can never carry colour of its own. */
  const summary = oneLine(summaryOf(event));
  const glyph = summary.slice(0, 1);
  const painted = glyphAnsi.has(glyph) ? `${paintGlyph(glyph)}${summary.slice(1)}` : summary;
  return `${String(event.sequence)}\t${event.type}\t${painted}`;
};

const readPromptSource = async (input: {
  readonly fromStdin: boolean;
  readonly inline: string | undefined;
  readonly file: string | undefined;
}): Promise<string> => {
  if (input.fromStdin) {
    return readStream(process.stdin);
  }
  if (input.file === undefined) {
    return input.inline ?? '';
  }
  try {
    return await readFile(input.file, 'utf8');
  } catch {
    throw cliError(
      'PROMPT_FILE_NOT_FOUND',
      `Prompt file not found: ${input.file}. Check the path, or pass the prompt as an argument.`,
      exitCodes.refused,
    );
  }
};

/**
 * Resolve the prompt for a run from its argument, a file, or stdin.
 *
 * @internal
 * @param input - The positional prompt (`-` for stdin) and the `--file` value.
 * @returns The prompt text.
 */
export const readPrompt = async (input: {
  readonly prompt: string | undefined;
  readonly file: string | undefined;
}): Promise<string> => {
  const fromStdin = input.prompt === '-';
  const inline = fromStdin ? undefined : input.prompt;
  const named = [inline, input.file, fromStdin ? '-' : undefined].filter((source) => source !== undefined);
  if (named.length !== 1) {
    throw cliError(
      'PROMPT_SOURCE_AMBIGUOUS',
      'Name exactly one prompt source: a positional prompt, --file <path>, or "-" to read stdin.',
      exitCodes.usage,
    );
  }

  const text = await readPromptSource({ fromStdin, inline, file: input.file });

  if (Buffer.byteLength(text) > promptByteLimit) {
    throw cliError(
      'PROMPT_TOO_LARGE',
      `A prompt may be at most ${String(promptByteLimit)} bytes; this one is ${String(Buffer.byteLength(text))}.`,
      exitCodes.usage,
    );
  }
  if (text.trim() === '') {
    throw cliError('PROMPT_EMPTY', 'The prompt is empty. A run needs something to answer.', exitCodes.usage);
  }
  return text;
};
