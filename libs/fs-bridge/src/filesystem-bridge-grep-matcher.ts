/**
 * Where a `grep` matches lines, bounded so a pattern cannot hang the authority.
 *
 * A caller's regular expression can backtrack for longer than the universe
 * has left (`(a+)+$` against a long run of `a`), and a JavaScript `RegExp`
 * cannot be interrupted on the thread that runs it. So a caller's expression
 * never runs on the authority's thread: it runs in a dedicated worker, one per
 * `grep`, and every file it matches has a deadline. A worker that overruns is
 * terminated and the call fails `ETIMEDOUT`. A literal pattern (`fixedStrings`)
 * compiles to an escaped expression that cannot backtrack, so it stays on the
 * fast path, in-process.
 *
 * The worker is a web `Worker` from a `blob:` URL where the platform has one
 * (the authority's own browser worker; the app's CSP admits `worker-src blob:`).
 * A host on another platform — Node, Electron's main process — hands the
 * bridge a {@link GrepMatcherWorkerFactory}, so this library never imports a
 * platform's worker module. A host with neither refuses a non-literal pattern
 * with `ENOTSUP` rather than run it unbounded.
 */
import type { GrepMatch } from '#filesystem-bridge-protocol.js';

/** Milliseconds one file's lines may take to match before the matcher is stopped. @public */
export const grepMatchDeadline = 2000;

/** Milliseconds a matcher worker may take to start and compile the pattern. */
const matcherStartDeadline = 10_000;

/** Matches one file's lines. */
export type FileLineMatcher = {
  match(path: string, text: string): Promise<GrepMatch[]>;
  close(): void;
};

type MatchInput = {
  readonly path: string;
  readonly text: string;
  readonly expression: RegExp;
  readonly context: number;
  readonly maxLine: number;
  /** Most matches one file yields; collecting stops there. */
  readonly maxMatches: number;
};

/**
 * The lines of one file's text that the expression matches, with their
 * context, each line cut at `maxLine` characters, up to `maxMatches` of them:
 * an expression that matches every line of a large file must not build a match
 * per line on the authority.
 *
 * Self-contained on purpose: its source is the matcher worker's, so it may
 * name nothing outside itself and declares no named inner functions (a
 * transform that keeps function names would wrap them in a helper the worker
 * does not have).
 */
export const matchFileLines = ({ path, text, expression, context, maxLine, maxMatches }: MatchInput): GrepMatch[] => {
  const lines = text.split(/\r?\n/u);
  const matches: GrepMatch[] = [];
  for (let index = 0; index < lines.length && matches.length < maxMatches; index += 1) {
    const line = lines[index]!;
    const found = expression.exec(line);
    if (found === null) {
      continue;
    }
    matches.push({
      path,
      line: index + 1,
      column: found.index + 1,
      text: line.length > maxLine ? line.slice(0, maxLine) : line,
      ...(context === 0
        ? {}
        : {
            before: lines
              .slice(Math.max(0, index - context), index)
              .map((row) => (row.length > maxLine ? row.slice(0, maxLine) : row)),
            after: lines
              .slice(index + 1, index + 1 + context)
              .map((row) => (row.length > maxLine ? row.slice(0, maxLine) : row)),
          }),
    });
  }
  return matches;
};

/** The matcher worker's whole program: compile once, then match each file it is sent. */
const workerSource = (): string => `"use strict";
const matchFileLines = ${matchFileLines.toString()};
let expression;
self.onmessage = (event) => {
  const data = event.data;
  if (data.type === "compile") {
    expression = new RegExp(data.source, data.flags);
    self.postMessage({ type: "ready" });
    return;
  }
  self.postMessage({ type: "matched", id: data.id, matches: matchFileLines({ path: data.path, text: data.text, expression, context: data.context, maxLine: data.maxLine, maxMatches: data.maxMatches }) });
};
`;

/**
 * One matcher worker, as the bridge drives it: post a message, stop it.
 *
 * @public
 */
export type GrepMatcherChannel = {
  post(message: unknown): void;
  terminate(): void;
};

/**
 * What a matcher worker reports back: each message it posts, and a failure.
 *
 * @public
 */
export type GrepMatcherChannelEvents = {
  readonly onMessage: (data: unknown) => void;
  readonly onError: (error: unknown) => void;
};

/**
 * Starts a worker that runs `source`, a classic web-worker script: it sets
 * `self.onmessage` and answers with `self.postMessage`. A host whose platform
 * has no web `Worker` supplies one, shimming `self` over its own worker
 * module, so a `grep` pattern runs where it can be stopped.
 *
 * @public
 */
export type GrepMatcherWorkerFactory = (
  source: string,
  events: GrepMatcherChannelEvents,
) => GrepMatcherChannel | Promise<GrepMatcherChannel>;

type MatcherChannel = GrepMatcherChannel;
type ChannelEvents = GrepMatcherChannelEvents;

const codedError = (message: string, code: string): Error => Object.assign(new Error(message), { code });

const webChannel = (source: string, events: ChannelEvents): MatcherChannel => {
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  const worker = new Worker(url);
  worker.addEventListener('message', (event: MessageEvent<unknown>) => {
    events.onMessage(event.data);
  });
  worker.addEventListener('error', (event) => {
    events.onError(event);
  });
  return {
    post(message) {
      worker.postMessage(message);
    },
    terminate() {
      worker.terminate();
      URL.revokeObjectURL(url);
    },
  };
};

const openChannel = async (
  events: ChannelEvents,
  factory: GrepMatcherWorkerFactory | undefined,
): Promise<MatcherChannel> => {
  if (factory !== undefined) {
    return factory(workerSource(), events);
  }
  if (typeof globalThis.Worker === 'function') {
    return webChannel(workerSource(), events);
  }
  throw codedError('This authority has no worker to bound a grep pattern in; use fixedStrings.', 'ENOTSUP');
};

type Pending = {
  readonly id: number;
  readonly resolve: (matches: GrepMatch[]) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
};

/**
 * A matcher that runs `expression` in a worker of its own, one file at a
 * time, each under {@link grepMatchDeadline}. An overrun terminates the worker
 * and fails that file and every later one with `ETIMEDOUT`.
 *
 * @param input - The compiled expression (already known to compile), the
 *   context lines, the line cut, and the host's worker factory where the
 *   platform has no web `Worker`.
 * @returns The matcher; `close` terminates its worker.
 */
export const boundedLineMatcher = async ({
  expression,
  context,
  maxLine,
  maxMatches,
  worker,
}: Omit<MatchInput, 'path' | 'text'> & { readonly worker?: GrepMatcherWorkerFactory }): Promise<FileLineMatcher> => {
  let failure: Error | undefined;
  let pending: Pending | undefined;
  let ready: { resolve: () => void; reject: (error: Error) => void } | undefined;
  /* Set once the channel opens; its events arrive only after that. */
  const opened: { channel?: MatcherChannel } = {};
  const fail = (error: Error): void => {
    failure ??= error;
    opened.channel?.terminate();
    if (pending !== undefined) {
      clearTimeout(pending.timer);
      pending.reject(failure);
      pending = undefined;
    }
    ready?.reject(failure);
  };
  const channel = await openChannel(
    {
      onMessage(data) {
        const message = data as { type: string; id?: number; matches?: GrepMatch[] };
        if (message.type === 'ready') {
          ready?.resolve();
          return;
        }
        const settled = pending;
        if (settled !== undefined && settled.id === message.id && message.matches !== undefined) {
          clearTimeout(settled.timer);
          pending = undefined;
          settled.resolve(message.matches);
        }
      },
      onError(error) {
        fail(
          codedError(`The grep matcher stopped: ${String((error as { message?: unknown }).message ?? error)}`, 'EIO'),
        );
      },
    },
    worker,
  );
  opened.channel = channel;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      fail(codedError('The grep matcher did not start in time.', 'ETIMEDOUT'));
    }, matcherStartDeadline);
    ready = {
      resolve() {
        clearTimeout(timer);
        resolve();
      },
      reject(error) {
        clearTimeout(timer);
        reject(error);
      },
    };
    channel.post({ type: 'compile', source: expression.source, flags: expression.flags });
  });
  ready = undefined;

  let next = 0;
  let tail: Promise<void> = Promise.resolve();
  const matchOne = async (path: string, text: string): Promise<GrepMatch[]> =>
    new Promise<GrepMatch[]>((resolve, reject) => {
      if (failure !== undefined) {
        reject(failure);
        return;
      }
      const id = next;
      next += 1;
      const timer = setTimeout(() => {
        fail(
          codedError(
            `The grep pattern took longer than ${String(grepMatchDeadline)} ms on ${path}; its matcher was stopped.`,
            'ETIMEDOUT',
          ),
        );
      }, grepMatchDeadline);
      pending = { id, resolve, reject, timer };
      channel.post({ type: 'match', id, path, text, context, maxLine, maxMatches });
    });
  return {
    async match(path, text) {
      /* One file at a time, so each deadline measures that file alone. */
      const previous = tail;
      let release = (): void => undefined;
      tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      try {
        await previous;
        return await matchOne(path, text);
      } finally {
        release();
      }
    },
    close() {
      channel.terminate();
    },
  };
};

/**
 * A matcher on the calling thread, for an expression that cannot backtrack:
 * an escaped literal.
 *
 * @param input - The literal's expression, the context lines and the line cut.
 * @returns The matcher.
 */
export const literalLineMatcher = (input: Omit<MatchInput, 'path' | 'text'>): FileLineMatcher => ({
  async match(path, text) {
    return matchFileLines({ ...input, path, text });
  },
  close() {
    // Nothing to stop: it runs on the calling thread.
  },
});
