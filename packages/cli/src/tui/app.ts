/**
 * The one Ink application behind `tau tui`.
 *
 * It owns no transcript and no second loop: the durable events it renders are
 * the same cursored pages `tau agent show|tail` reads, through the same channel
 * client, and every action it offers is a channel command the scripted commands
 * already send. What it adds is a keyboard: a prompt line, an approval answer,
 * a cancel, and a detach.
 *
 * JSX is deliberately absent. `createElement` keeps this a plain `.ts` module,
 * so the package needs no `jsx` compiler option, no `.tsx` in its build or
 * typecheck globs, and no second lint dialect for one component tree.
 */

import { randomUUID } from 'node:crypto';

import type { AgentLogEvent, ProjectionSourceHealth } from '@taucad/agent-host';
import type { AgentChannelClient } from '@taucad/agent-host/channel-client';
import { Box, Text, render, useApp, useInput, useStdin, useStdout } from 'ink';
import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';

import {
  answerLine,
  attachChat,
  eventLine,
  externalAgentOf,
  externalLoginOf,
  externalRefusalOf,
  isRecord,
  isSettled,
  oneLine,
  openAgentChannel,
  readNext,
  refusalText,
  sendCommand,
} from '#commands/agent/client.js';
import type { ExternalAgentFacts, ExternalRefusal } from '#commands/agent/client.js';
import { exitCodeFor, exitCodes, sanitize } from '#output.js';

/** Most transcript rows kept in memory; the oldest are dropped (P5). */
const rowLimit = 2000;

/** Rows the chrome occupies: status, approval, prompt, and hint lines. */
const chromeRows = 5;

/** Terminal height assumed when the stream reports none. */
const fallbackRows = 24;

/** The keyboard waits this long for a settling run to release admission. */
const admissionTimeout = 20_000;

/** One choice the pending request offered, exactly as it named it. */
type ApprovalOption = {
  readonly optionId: string;
  readonly name: string;
  readonly kind: string | undefined;
};

/** The approval a run is paused on. */
type Approval = {
  readonly interruptId: string;
  readonly runId: string;
  readonly prompt: string;
  readonly options: readonly ApprovalOption[];
};

/** One rendered transcript row, keyed by its durable epoch and sequence. */
type Row = { readonly key: string; readonly text: string };

/** Everything the view derives from the durable log. */
type Session = {
  readonly rows: readonly Row[];
  readonly state: string | undefined;
  readonly runId: string | undefined;
  readonly approval: Approval | undefined;
  /** The external agent the last admitted turn actually ran on. */
  readonly agent: ExternalAgentFacts | undefined;
  /** The typed refusal the last terminal run carried (VSC4). */
  readonly refusal: ExternalRefusal | undefined;
};

const emptySession: Session = {
  rows: [],
  state: undefined,
  runId: undefined,
  approval: undefined,
  agent: undefined,
  refusal: undefined,
};

/**
 * Read the options an approval request offered.
 *
 * `interrupt.recorded.payload` is `JsonValue` on the wire — an ACP permission
 * request puts its choices in `context.options`, a channel `interrupt` command
 * puts nothing there — so this parses rather than trusts, and offers nothing
 * when the request offered nothing.
 *
 * @internal
 * @param payload - The `requested` record's payload.
 * @returns Every option that named an id, in the order the request listed them.
 */
const approvalOptions = (payload: unknown): readonly ApprovalOption[] => {
  const context = isRecord(payload) ? payload['context'] : undefined;
  const offered = isRecord(context) ? context['options'] : undefined;
  if (!Array.isArray(offered)) {
    return [];
  }
  return offered.flatMap((option: unknown) => {
    if (!isRecord(option) || typeof option['optionId'] !== 'string') {
      return [];
    }
    const { name, kind } = option;
    return [
      {
        optionId: option['optionId'],
        name: oneLine(typeof name === 'string' ? name : option['optionId']),
        kind: typeof kind === 'string' ? kind : undefined,
      },
    ];
  });
};

/**
 * Fold one durable event into the view's facts.
 *
 * @internal
 * @param session - The facts so far.
 * @param event - One durable record.
 * @returns The facts after the event, with its row appended.
 */
const applyEvent = (session: Session, event: AgentLogEvent): Session => {
  /* `eventLine` already collapses and sanitizes the untrusted half; tabs are
   * the plain-output separator and would measure wrong in a laid-out cell. */
  const rows = [
    ...session.rows,
    {
      key: `${event.leaderEpoch}:${String(event.sequence)}`,
      text: eventLine(event).replaceAll('\t', '  '),
    },
  ];
  /* Who ran a turn and how it was refused are facts of *that* run: a chat whose
   * next turn is an ordinary Tau one must not inherit the last agent, or the
   * keyboard would go on refusing to steer a run that steers perfectly well. */
  const sameRun = session.runId === event.runId;
  const startsRun =
    (event.type === 'message.appended' && event.message.role === 'user') ||
    (event.type === 'run.lifecycle' && event.state === 'admitted');
  /* A prior turn can settle after the next has been admitted. Its record is a
   * transcript row, never a new keyboard target. The user marker precedes
   * admission, so it must select the new run early enough to retain its agent. */
  if (session.runId !== undefined && !sameRun && !startsRun) {
    return { ...session, rows };
  }
  const base = {
    ...session,
    rows,
    runId: event.runId,
    state: sameRun ? session.state : undefined,
    approval: sameRun ? session.approval : undefined,
    agent: externalAgentOf(event) ?? (sameRun ? session.agent : undefined),
    refusal: sameRun ? session.refusal : undefined,
  };

  if (event.type === 'run.lifecycle') {
    const coded = externalRefusalOf(event);
    return {
      ...base,
      state: event.state,
      /* The login facts arrive on the interrupt *before* the failure, so the
       * refusal keeps them and takes the host's own code and words. */
      refusal:
        coded === undefined
          ? base.refusal
          : { ...coded, ...(base.refusal?.login === undefined ? {} : { login: base.refusal.login }) },
    };
  }
  if (event.type !== 'interrupt.recorded') {
    return base;
  }
  const login = externalLoginOf(event);
  if (event.phase === 'resolved') {
    return { ...base, approval: session.approval?.interruptId === event.interruptId ? undefined : session.approval };
  }
  /* A login is not a decision: nothing there is approved or denied, so it never
   * becomes the approval that takes over the keyboard. */
  if (login !== undefined) {
    return { ...base, refusal: { code: 'EXTERNAL_AGENT_AUTH_REQUIRED', message: oneLine(event.reason), login } };
  }
  return {
    ...base,
    approval: {
      interruptId: event.interruptId,
      runId: event.runId,
      prompt: oneLine(event.reason),
      options: approvalOptions(event.payload),
    },
  };
};

/**
 * Fold one replay page, then bound the resident transcript.
 *
 * A whole page becomes one state update, so a burst of events costs one
 * repaint rather than one per record.
 *
 * @internal
 * @param session - The facts so far.
 * @param events - The page the daemon served.
 * @returns The facts after the page, with at most {@link rowLimit} rows.
 */
const applyPage = (session: Session, events: readonly AgentLogEvent[]): Session => {
  let next = session;
  for (const event of events) {
    next = applyEvent(next, event);
  }
  return next.rows.length > rowLimit ? { ...next, rows: next.rows.slice(-rowLimit) } : next;
};

/**
 * The option `y` or `n` will send, chosen only from what the request offered.
 *
 * An ACP permission request names its choices by kind (`allow_once`,
 * `reject_always`, …). When none matches — or none was offered — the answer
 * carries no option id at all, exactly as `tau agent respond` does without
 * `--option`. Inventing one would answer a question nobody asked.
 *
 * @internal
 * @param approval - The pending request.
 * @param approved - Whether the operator is approving.
 * @returns The offered option, or nothing.
 */
const chosenOption = (approval: Approval, approved: boolean): ApprovalOption | undefined =>
  approval.options.find((option) => option.kind?.startsWith(approved ? 'allow' : 'reject') === true);

/** The external agent every turn this invocation starts is admitted with. */
type AgentSelection = { readonly id: string; readonly model?: string | undefined };

/** One answered-refusal retry whose keypress may also carry a later cancel request. */
type PendingAdmission = {
  readonly stop: AbortController;
  readonly kind: 'start' | 'resolve';
  cancelRequested: boolean;
};

/**
 * Send a cancel only after its target run is known.
 *
 * @param client - The connected agent channel.
 * @param chatId - The chat containing the run.
 * @param runId - The exact run to cancel.
 * @returns The host's cancel answer as a notice.
 */
const cancelRun = async (client: AgentChannelClient, chatId: string, runId: string): Promise<string> => {
  const answer = await sendCommand(client, { type: 'cancel', commandId: randomUUID(), payload: { chatId, runId } });
  return `cancel: ${answerLine(answer)}`;
};

/** What a mounted app needs to reach its chat. */
type AppProps = {
  /** Absent until the channel is open: the first frame paints before the dial. */
  readonly client: AgentChannelClient | undefined;
  readonly origin: string;
  readonly chatId: string;
  readonly from: number;
  readonly agent?: AgentSelection | undefined;
};

/**
 * The whole component tree: a status line, the transcript, and a prompt.
 *
 * @internal
 * @param props - The connected client and the chat to follow.
 * @returns The rendered frame.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- React components are PascalCase; the rule's tsx exception does not reach this JSX-free module.
const TauTui = ({ client, origin, chatId, from, agent }: AppProps): ReactElement => {
  const { exit } = useApp();
  const { stdout, write } = useStdout();
  const { setRawMode } = useStdin();
  const [session, setSession] = useState<Session>(emptySession);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState(`Connecting to ${origin}…`);
  const [rows, setRows] = useState(stdout.rows > 0 ? stdout.rows : fallbackRows);
  const pendingAdmission = useRef<PendingAdmission | undefined>(undefined);

  useEffect(() => () => pendingAdmission.current?.stop.abort(), []);

  /* One follow from its own cursor, one long-poll read at a time (SC-R14).
   * Unlike `tau agent tail` this never stops at settlement: the next prompt
   * starts the next run in the same chat, and the operator is still watching. */
  useEffect(() => {
    if (client === undefined) {
      return undefined;
    }
    setNotice(`Following ${chatId}.`);
    const stop = new AbortController();
    const follow = async (): Promise<void> => {
      try {
        const { emptyChatLedger } = await import('@taucad/agent-host');
        // `attach` records a run a daemon restart left hanging; rows come only from `read`.
        await attachChat(client, chatId);
        let ledger = { ...emptyChatLedger, position: { cursor: from } };
        let sourceHealth: ProjectionSourceHealth | undefined;
        for (;;) {
          // oxlint-disable-next-line no-await-in-loop -- a cursored replay is sequential by definition.
          const page = await readNext({ client, chatId, ledger, sourceHealth, signal: stop.signal });
          ledger = page.ledger;
          sourceHealth = page.sourceHealth;
          if (stop.signal.aborted) {
            return;
          }
          if (page.reset) {
            // The log is not the one this view was reading: refold it from cursor 0 (W3 CL-R13).
            setSession(emptySession);
          } else if (page.events.length > 0) {
            setSession((current) => applyPage(current, page.events));
          }
        }
      } catch (error) {
        if (!stop.signal.aborted) {
          setNotice(`The channel stopped: ${oneLine(error instanceof Error ? error.message : String(error))}`);
        }
      }
    };
    // async-iife: bootstrap -- an effect body cannot await; its cleanup ends the outstanding read.
    void follow();
    return () => {
      stop.abort();
    };
  }, [client, chatId, from]);

  /*
   * Job control. Between `SIGTSTP` and `SIGCONT` the shell owns the terminal, so
   * raw mode is handed back before the process stops and taken again when it
   * resumes. Ink writes a frame only when it differs from the last one, and
   * resuming changes the screen rather than the frame — an empty external write
   * is the public way to make it repaint what it already holds.
   */
  useEffect(() => {
    const suspend = (): void => {
      setRawMode(false);
      process.kill(process.pid, 'SIGSTOP');
    };
    const resume = (): void => {
      setRawMode(true);
      write('');
    };
    process.on('SIGTSTP', suspend);
    process.on('SIGCONT', resume);
    return () => {
      process.off('SIGTSTP', suspend);
      process.off('SIGCONT', resume);
    };
  }, [setRawMode, write]);

  // Ink re-measures its own width; the visible row count is this view's to keep.
  useEffect(() => {
    const measure = (): void => {
      setRows(stdout.rows > 0 ? stdout.rows : fallbackRows);
    };
    stdout.on('resize', measure);
    return () => {
      stdout.off('resize', measure);
    };
  }, [stdout]);

  /* Every action reports what the daemon said it did — never what this view
   * asked for (D12). A failure is a notice, not a crash: the run outlives it. */
  const act = useCallback((label: string, body: () => Promise<string>): void => {
    setNotice(`${label}…`);
    const report = async (): Promise<void> => {
      try {
        setNotice(await body());
      } catch (error) {
        setNotice(`${label} failed: ${oneLine(error instanceof Error ? error.message : String(error))}`);
      }
    };
    // async-iife: bootstrap -- a keypress handler is synchronous; the answer arrives as a notice.
    void report();
  }, []);

  const submit = useCallback((): void => {
    const prompt = draft.trim();
    if (prompt === '' || client === undefined) {
      return;
    }
    if (pendingAdmission.current !== undefined) {
      setNotice('Waiting for the previous command to be admitted. The prompt is kept.');
      return;
    }
    const running = isSettled(session.state) ? undefined : session.runId;
    /* No external protocol Tau speaks has a steering frame, so the host refuses
     * `steer` on an external run outright. Sending it anyway to be told so would
     * lose the prompt; the draft is kept, and the host's own code is the answer. */
    if (running !== undefined && session.agent !== undefined) {
      setNotice(
        `EXTERNAL_AGENT_UNSUPPORTED: ${session.agent.agentId} cannot be steered mid-turn. The prompt is kept — send it once this run settles.`,
      );
      return;
    }
    setDraft('');
    const started = randomUUID();
    // One key per keystroke: the channel re-sends it after a redial, never a second one (SC-R6).
    const commandId = randomUUID();
    const label = running === undefined ? 'start' : 'steer';
    act(label, async () => {
      const admission: PendingAdmission | undefined =
        running === undefined ? { stop: new AbortController(), kind: 'start', cancelRequested: false } : undefined;
      if (admission !== undefined) {
        pendingAdmission.current = admission;
      }
      let admitted = false;
      try {
        const answer = await sendCommand(
          client,
          running === undefined
            ? {
                type: 'start',
                commandId,
                payload: {
                  chatId,
                  runId: started,
                  trigger: 'submit',
                  message: { id: randomUUID(), role: 'user', content: prompt },
                  /* The same literal `tau agent run --agent` sends: the host routes
                   * on `agent` before it composes anything, so the two Tau fields
                   * beside it are inert for this turn. */
                  ...(agent === undefined
                    ? {}
                    : {
                        config: {
                          agent: {
                            kind: 'acp',
                            id: agent.id,
                            ...(agent.model === undefined ? {} : { model: agent.model }),
                          },
                          systemPrompt: '',
                          toolChoice: 'auto',
                        } as const,
                      }),
                },
              }
            : { type: 'steer', commandId, payload: { chatId, runId: running, message: prompt } },
          admission === undefined
            ? undefined
            : AbortSignal.any([
                admission.stop.signal,
                AbortSignal.timeout(admissionTimeout), // Start settling retry ceiling
              ]),
        );
        /* The admission row may reach this view's read after the answer does, and
         * `c` in the meantime must cancel the run this keystroke started — not
         * report that no run exists. An applied start is a durable admission; rows
         * the view already read for this run are newer than that. */
        if (running === undefined) {
          admitted = answer.effect === 'durable';
          if (admitted) {
            const selectStarted = (current: Session): Session =>
              current.runId === started
                ? current
                : {
                    ...current,
                    runId: started,
                    state: 'admitted',
                    agent: undefined,
                    approval: undefined,
                    refusal: undefined,
                  };
            sessionRef.current = selectStarted(sessionRef.current);
            setSession(selectStarted);
          }
          if (admission?.cancelRequested === true && admitted) {
            try {
              const cancelled = await cancelRun(client, chatId, started);
              return `start: ${answerLine(answer)}; ${cancelled}`;
            } catch (error) {
              return `start: ${answerLine(answer)}; cancel failed: ${oneLine(error instanceof Error ? error.message : String(error))}`;
            }
          }
        }
        return `${label}: ${answerLine(answer)}`;
      } catch (error) {
        if (running === undefined && !admitted && exitCodeFor(error) !== exitCodes.unknown) {
          setDraft((current) => (current === '' ? prompt : current));
        }
        throw error;
      } finally {
        if (pendingAdmission.current === admission) {
          pendingAdmission.current = undefined;
        }
      }
    });
  }, [act, agent, chatId, client, draft, session.agent, session.runId, session.state]);

  const cancel = useCallback((): void => {
    const pending = pendingAdmission.current;
    if (pending?.kind === 'start') {
      pending.cancelRequested = true;
      pending.stop.abort();
      setNotice('Cancel requested; waiting for the start answer.');
      return;
    }
    pending?.stop.abort();
    const { runId } = sessionRef.current;
    if (runId === undefined || client === undefined) {
      setNotice('No run has started in this chat yet.');
      return;
    }
    act('cancel', async () => {
      return cancelRun(client, chatId, runId);
    });
  }, [act, chatId, client]);

  const resolve = useCallback(
    (approved: boolean): void => {
      const { approval } = sessionRef.current;
      if (approval === undefined || client === undefined) {
        return;
      }
      if (pendingAdmission.current !== undefined) {
        return;
      }
      const option = chosenOption(approval, approved);
      const label = approved ? 'approve' : 'deny';
      act(label, async () => {
        const admission: PendingAdmission = { stop: new AbortController(), kind: 'resolve', cancelRequested: false };
        pendingAdmission.current = admission;
        try {
          const answer = await sendCommand(
            client,
            {
              type: 'resolve-interrupt',
              commandId: randomUUID(),
              payload: {
                chatId,
                runId: approval.runId,
                interruptId: approval.interruptId,
                outcome: approved ? 'approved' : 'denied',
                ...(option === undefined ? {} : { optionId: option.optionId }),
              },
            },
            AbortSignal.any([
              admission.stop.signal,
              AbortSignal.timeout(admissionTimeout), // Approval settling retry ceiling
            ]),
          );
          return `${label}: ${answerLine(answer)}`;
        } finally {
          if (pendingAdmission.current === admission) {
            pendingAdmission.current = undefined;
          }
        }
      });
    },
    [act, chatId, client],
  );

  useInput((input, key) => {
    /* A paused run needs an answer before it needs a prompt, so while an
     * approval is pending the letters are the only thing the keyboard does. */
    if (sessionRef.current.approval !== undefined) {
      switch (input) {
        case 'y':
        case 'n': {
          resolve(input === 'y');
          break;
        }
        case 'c': {
          cancel();
          break;
        }
        case 'q': {
          exit();
          break;
        }
        default: {
          break;
        }
      }
      return;
    }
    if (key.return) {
      submit();
      return;
    }
    if (key.escape) {
      setDraft('');
      return;
    }
    if (key.backspace || key.delete) {
      setDraft((current) => [...current].slice(0, -1).join(''));
      return;
    }
    // oxlint-disable-next-line capitalized-comments -- Ponytail debt markers intentionally use the lowercase `ponytail:` tag.
    // ponytail: the command letters are live only on an empty prompt, so a prompt
    // cannot begin with `q` or `c` — press space first, or add a leading `/`
    // command line if that ever grates.
    if (draft === '' && (input === 'q' || input === 'c')) {
      if (input === 'q') {
        exit();
      } else {
        cancel();
      }
      return;
    }
    if (input !== '' && !key.ctrl && !key.meta) {
      // Pasted text is as untrusted as a transcript row.
      setDraft((current) => current + sanitize(input));
    }
  });

  const running = !isSettled(session.state) && session.runId !== undefined;
  const visible = session.rows.slice(-Math.max(1, rows - chromeRows));
  const { approval } = session;
  /* What the log recorded beats what this invocation asked for: a chat whose
   * last turn ran elsewhere still says who answered it. */
  const attribution = session.agent ?? (agent === undefined ? undefined : { agentId: agent.id, model: agent.model });
  const status = [
    origin,
    chatId,
    ...(attribution === undefined
      ? []
      : [[attribution.agentId, attribution.model].filter((part) => part !== undefined).join(' · ')]),
    `run ${session.state ?? 'none'}`,
    approval === undefined ? 'no approval pending' : `approval ${approval.interruptId}`,
    `${String(session.rows.length)} rows`,
  ].join(' · ');
  const answers =
    approval === undefined
      ? ''
      : ['y', 'n']
          .map((letter) => {
            const option = chosenOption(approval, letter === 'y');
            /* The id is the agent's own text: sanitized for display, sent verbatim. */
            return `${letter} sends ${option === undefined ? 'no option id' : `${option.name} (${sanitize(option.optionId)})`}`;
          })
          .join(', ');
  const hints =
    approval === undefined
      ? `enter ${running ? (session.agent === undefined ? 'steers' : 'keeps draft until this external run settles') : 'starts'} · q quit (the run keeps going) · c cancel — both on an empty prompt`
      : 'y approve · n deny · c cancel · q quit';

  return createElement(
    Box,
    { flexDirection: 'column' },
    createElement(Text, { key: 'status', dimColor: true, wrap: 'truncate' }, status),
    ...visible.map((row) => createElement(Text, { key: row.key, wrap: 'truncate' }, row.text)),
    approval === undefined
      ? undefined
      : createElement(
          Text,
          { key: 'approval', bold: true, wrap: 'truncate' },
          `Approval needed: ${approval.prompt} — ${answers}`,
        ),
    /* One rendering, shared with `tau agent`: the code, and the thing the user
     * can do about it. Tau never runs the login command it names (X6). */
    ...(session.refusal === undefined
      ? []
      : refusalText(session.refusal)
          .split('\n')
          .map((line, index) =>
            createElement(Text, { key: `refusal-${String(index)}`, bold: true, wrap: 'truncate' }, line),
          )),
    createElement(
      Text,
      { key: 'prompt', 'aria-label': 'Prompt', wrap: 'truncate' },
      `> ${draft === '' ? (approval === undefined ? '(type a prompt)' : '(answer the approval first)') : draft}`,
    ),
    createElement(Text, { key: 'notice', dimColor: true, wrap: 'truncate' }, `${notice} · ${hints}`),
  );
};

/** What {@link runTui} needs; the streams default to this process's own. */
export type TuiOptions = {
  readonly host: string | undefined;
  readonly chatId: string;
  readonly from: number;
  /** External ACP agent every turn is admitted with; absent runs Tau's own. */
  readonly agent?: AgentSelection | undefined;
  readonly stdin?: NodeJS.ReadStream;
  readonly stdout?: NodeJS.WriteStream;
};

/**
 * Dial a host, run the TUI, and leave the terminal as it was found.
 *
 * Quitting detaches: the socket closes and the run keeps going, which is
 * exactly what a resident daemon is built for. Job control lives in the
 * component, which is where Ink's raw-mode and repaint handles are.
 *
 * @internal
 * @param options - The host, the chat, the cursor, and the streams to drive.
 * @returns A promise that settles once the app has unmounted.
 */
export const runTui = async (options: TuiOptions): Promise<void> => {
  const stdin = options.stdin ?? process.stdin;
  const stdout = options.stdout ?? process.stdout;
  /* The origin is only known for certain once the dial succeeds; until then the
   * first frame names what the caller asked for, or says it is resolving one. */
  const props = {
    origin: options.host ?? 'the configured host',
    chatId: options.chatId,
    from: options.from,
    ...(options.agent === undefined ? {} : { agent: options.agent }),
  };
  /* The first frame is painted before the channel is dialled (P2): the dial —
   * and the socket stack behind it — is the slow half of startup, and a
   * "connecting" frame is an honest first paint.
   *
   * `patchConsole` replaces the global console for the app's lifetime, and does
   * it with `new console.Console(…)` — which is not a constructor in every host
   * that can import this module (a Vitest worker, for one). Nothing on this
   * command's path writes to the console, so there is nothing to patch. */
  const instance = render(createElement(TauTui, { ...props, client: undefined }), {
    stdin,
    stdout,
    exitOnCtrlC: true,
    patchConsole: false,
  });
  let client: AgentChannelClient | undefined;

  const detach = (): void => {
    instance.unmount();
  };
  process.on('SIGINT', detach);
  process.on('SIGTERM', detach);

  try {
    const opened = await openAgentChannel(options.host);
    client = opened.client;
    instance.rerender(createElement(TauTui, { ...props, origin: opened.url.origin, client }));
    await instance.waitUntilExit();
  } finally {
    process.off('SIGINT', detach);
    process.off('SIGTERM', detach);
    instance.unmount();
    /* Ink drops raw mode as it unmounts; this is the belt for the braces, and
     * the one line that matters when an exit path is not Ink's own. */
    if (stdin.isTTY && stdin.isRaw) {
      stdin.setRawMode(false);
    }
    client?.close('tau tui detached');
  }
};
