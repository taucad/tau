/**
 * The services host's `terminal` concern (desktop Bash/Terminal blueprint W5, D7, D21, I6–I9).
 *
 * One dedicated port per pane session, one human PTY per project and window. Main has already checked the sender
 * window and the admitted root before it minted the port; this end checks the root again, owns the session's whole
 * life and speaks only the validated wire in `@taucad/types/desktop-terminal`.
 *
 * - The session lives as long as its port: hiding the pane keeps the port, so the shell keeps its state. Closing the
 *   pane, a project change (the renderer drops the port), a revoked grant and quit tear it down, and each teardown
 *   awaits the provider's `exited`, so no descendant is still writing when it settles (I7, A09, A11).
 * - Output is acknowledged by byte offset; the pump stops pulling once 256 KiB are unacknowledged, and the provider's
 *   queue then pauses the PTY. Output of a session that was replaced or ended is never sent, so no late byte reaches
 *   another session or another project's pane.
 * - Extra access is approved against a host-minted, single-use, expiring request id bound to this port (D21). Allow
 *   ends the session and opens a fresh one under the new grant; typed input is never replayed into it.
 *
 * Imports no `electron`, like the rest of the services host.
 */

import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';

import type { ShellProbe, TerminalSession, TerminalSessionOutcome } from '@taucad/host';
import { terminalClientFrameSchema, terminalLimits } from '@taucad/types/desktop-terminal';
import type {
  TerminalAccess,
  TerminalClientFrame,
  TerminalExitReason,
  TerminalHostFrame,
  TerminalRefusal,
  TerminalSize,
} from '@taucad/types/desktop-terminal';

/** The transferred port, as Electron's `MessagePortMain` delivers it: every message is a `{ data }` envelope. */
export type TerminalPort = {
  postMessage(message: unknown): void;
  on(event: 'message' | 'close', listener: (message: unknown) => void): unknown;
  start(): void;
  close(): void;
};

/** Options for {@link createTerminalConcern}. */
export type TerminalConcernOptions = {
  /**
   * The desktop's shell, probed once by its composer and shared with the agent's `shell` tool. Absent, every session
   * is refused `sandbox-unavailable`; nothing ever falls back to an uncontained shell.
   */
  readonly shell?: (() => Promise<ShellProbe>) | undefined;
  /** Whether main's latest root allowlist still admits a project root. */
  readonly isTrustedRoot: (root: string) => boolean;
  /** The physical spelling a root is keyed by. */
  readonly canonicalRoot: (root: string) => string;
  readonly log: (event: string, detail?: unknown, level?: 'info' | 'warn') => void;
  /** How long a host-minted access request stays answerable. Milliseconds. */
  readonly accessRequestMilliseconds?: number;
  /** How long a fresh port may wait for its `open` frame before it is closed. Milliseconds. */
  readonly openMilliseconds?: number;
  /**
   * How long a start waits for main's root allowlist to admit its project before it is refused
   * `project-not-admitted`. Defaults to {@link terminalAdmissionMilliseconds}.
   */
  readonly admissionMilliseconds?: number;
  /** Wall clock, for request expiry. */
  readonly now?: () => number;
};

/** The concern, seen by the services host. */
export type TerminalConcern = {
  /** Serve one pane session on a port main minted with `{ projectRoot, windowId }`. */
  serve(port: TerminalPort, context: Readonly<Record<string, unknown>> | undefined): void;
  /** End every session whose project main no longer admits (a revoked grant). */
  revokeUntrusted(): void;
  /**
   * End every session and resolve once each shell and its descendants have stopped (quit). Starts stay held afterwards
   * until {@link TerminalConcern.releaseStarts} or the process exits.
   */
  closeAll(): Promise<void>;
  /**
   * Hold every shell start until {@link TerminalConcern.releaseStarts}: once quit has counted the sessions it asks
   * about, no new one can start and be stopped unasked (T15). A held pane stays starting; nothing is refused.
   * {@link TerminalConcern.closeAll} keeps a hold in place for the rest of quiesce and exit.
   */
  holdStarts(): void;
  /** Quit was called off: held starts go on. */
  releaseStarts(): void;
  /** Sessions whose shell is running or past the start hold, not ones still waiting to open or already ending. */
  sessions(): number;
};

const refusal = (code: TerminalRefusal['code'], message: string, recovery: string): TerminalRefusal => ({
  code,
  message,
  recovery,
});

const invalidFrame = refusal(
  'invalid-frame',
  'Terminal closed after an invalid message.',
  'Reopen the pane; nothing was sent to the shell.',
);

/** How a session ended, as far as the pane is told. */
type SessionEnd = Readonly<{ exitCode?: number | undefined; signal?: string | undefined }>;

const exitedFrame = (exit: SessionEnd, reason: TerminalExitReason): TerminalHostFrame => ({
  type: 'exited',
  exitCode: exit.exitCode ?? null,
  signal: exit.signal ?? null,
  reason,
});

/** Split decoded output into frames under the wire bound, never between the halves of a surrogate pair. */
const outputPieces = (text: string): string[] => {
  const pieces: string[] = [];
  let rest = text;
  while (rest.length > terminalLimits.outputCharacters) {
    let cut = terminalLimits.outputCharacters;
    const code = rest.codePointAt(cut - 1) ?? 0;
    if (code >= 0xd8_00 && code <= 0xdb_ff) {
      cut -= 1;
    }
    pieces.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest.length > 0) {
    pieces.push(rest);
  }
  return pieces;
};

/**
 * How long a Terminal start waits for main's root allowlist to admit its project, in milliseconds. Main admits a
 * just-created project to its own registry and connects the pane before the services host's `allowRoots` frame for
 * that project arrives; a start in that gap waits for the frame instead of being refused.
 *
 * The pane starts itself when it mounts, so this gap is the ordinary first moment of every project, not an edge case,
 * and the bound is how patient Tau is on the slowest machine rather than the fastest. Five seconds lost that race by
 * about a second on the stock Debian guest's first cold launch, where the frame arrived at +6.1 s: the person saw
 * "This project is not open in Tau" for a project they had just opened, with nothing to do but press Try again. The
 * pane says "Starting Terminal…" for the whole wait, and a project that genuinely is not open is a programming
 * mistake rather than a state anyone reaches, so patience costs the person nothing and impatience costs them the
 * Terminal.
 */
export const terminalAdmissionMilliseconds = 15_000;

/** How often a start retries the shell service while that service has not yet registered an admitted project. */
const terminalRegistrationRetryMilliseconds = 250;

/**
 * Create the services host's terminal concern.
 *
 * @param options - The shell getter, main's root predicate and diagnostics.
 * @returns The concern.
 */
export const createTerminalConcern = (options: TerminalConcernOptions): TerminalConcern => {
  const { log } = options;
  const accessRequestMilliseconds = options.accessRequestMilliseconds ?? 120_000;
  const openMilliseconds = options.openMilliseconds ?? 30_000;
  const admissionMilliseconds = options.admissionMilliseconds ?? terminalAdmissionMilliseconds;
  /** Resolved and replaced each time main's root allowlist changes; a start awaiting admission wakes on it. */
  let rootsChanged = Promise.withResolvers<void>();
  /**
   * Wait until main's allowlist admits `root`, its connection ends, or `deadline` (the start's admission bound) passes.
   * @returns Whether the root is admitted.
   */
  const awaitAdmission = async (root: string, isEnded: () => boolean, deadline: number): Promise<boolean> => {
    while (!options.isTrustedRoot(root)) {
      const remaining = deadline - now();
      if (remaining <= 0 || isEnded()) {
        return false;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      // oxlint-disable-next-line no-await-in-loop -- each wait is for main's next allowlist or the bound.
      await Promise.race([
        rootsChanged.promise,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, remaining);
        }),
      ]);
      clearTimeout(timer);
    }
    return true;
  };
  const now = options.now ?? Date.now;
  /** Live connections by `windowId\0projectRoot`: one PTY per project and window. */
  const live = new Map<string, Connection>();
  const connections = new Set<Connection>();
  /** Set while quit holds shell starts; every held start awaits it. */
  let startHold: PromiseWithResolvers<void> | undefined;
  const releaseStarts = (): void => {
    startHold?.resolve();
    startHold = undefined;
  };

  type Connection = {
    readonly projectRoot: string;
    /** A shell runs, or is starting past the start hold, and the connection is not ending. */
    isLive(): boolean;
    /** A start is waiting for main's allowlist to admit this project for the first time; nothing runs to revoke. */
    isAwaitingAdmission(): boolean;
    /** Ends the connection with one final frame, or none when the pane is already gone. */
    end(frame: TerminalHostFrame | undefined, reason?: TerminalExitReason): Promise<void>;
  };

  const serve: TerminalConcern['serve'] = (port, context) => {
    const requestedRoot = context?.['projectRoot'];
    const windowId = context?.['windowId'];
    if (typeof requestedRoot !== 'string' || typeof windowId !== 'string' || windowId === '') {
      log('terminal.context-refused', undefined, 'warn');
      port.close();
      return;
    }
    const projectRoot = options.canonicalRoot(requestedRoot);
    const key = `${windowId}\0${projectRoot}`;

    let ended: Promise<void> | undefined;
    /* Read through a call: the connection can end while any await below is pending. */
    const isEnded = (): boolean => ended !== undefined;
    let session: TerminalSession | undefined;
    let abort: AbortController | undefined;
    /**
     * A shell being opened, not yet this connection's: ending the connection cancels it and waits until it has
     * either refused or been stopped, so quit's `closeAll` never resolves before a shell it could not yet see.
     */
    let pendingOpen: { readonly controller: AbortController; readonly settled: Promise<void> } | undefined;
    /** Bumped whenever a session ends, so a pump of an earlier session can never send again. */
    let generation = 0;
    let sent = 0;
    let acknowledged = 0;
    let acknowledgement: PromiseWithResolvers<void> | undefined;
    let pendingAccess: { id: string; access: TerminalAccess; accessExpires: number } | undefined;
    let opening = false;
    /** Set while a start waits for its project's first admission (see `awaitAdmission`). */
    let awaitingAdmission = false;
    /** Inside {@link start} past the start hold: a shell is being opened that quit must count. */
    let starting = false;
    let claimed = false;
    /** Sessions opened on this port; a frame stamped with an earlier count was meant for a shell that is gone. */
    let opened = 0;
    let size: TerminalSize = { columns: 80, rows: 24 };
    const encoder = new TextEncoder();

    const post = (frame: TerminalHostFrame): void => {
      try {
        port.postMessage(frame);
      } catch {
        /* The pane is gone; its close event ends the session. */
      }
    };

    const wake = (): void => {
      acknowledgement?.resolve();
      acknowledgement = undefined;
    };

    /** Stop the live session and await every descendant (I7). Resolves with how it ended. */
    const stopSession = async (): Promise<SessionEnd> => {
      generation += 1;
      wake();
      const stopping = session;
      session = undefined;
      abort?.abort();
      abort = undefined;
      if (stopping === undefined) {
        return {};
      }
      try {
        await stopping[Symbol.asyncDispose]();
        return await stopping.exited;
      } catch (error) {
        log('terminal.dispose-failed', error instanceof Error ? error.message : String(error), 'warn');
        return {};
      }
    };

    const connection: Connection = {
      projectRoot,
      isLive: () => !isEnded() && (session !== undefined || starting),
      isAwaitingAdmission: () => awaitingAdmission,
      // oxlint-disable-next-line typescript/promise-function-async -- Promise identity is the repeated-close contract.
      end(frame, reason) {
        ended ??= (async (): Promise<void> => {
          clearTimeout(openTimer);
          pendingAccess = undefined;
          const exit = await stopSession();
          const opening = pendingOpen;
          if (opening !== undefined) {
            opening.controller.abort();
            await opening.settled;
          }
          if (claimed && live.get(key) === connection) {
            live.delete(key);
          }
          connections.delete(connection);
          if (frame !== undefined) {
            post(frame);
          } else if (reason !== undefined) {
            post(exitedFrame(exit, reason));
          }
          port.close();
          log('terminal.ended', { reason: reason ?? (frame?.type === 'refused' ? frame.code : 'disconnected') });
        })();
        return ended;
      },
    };
    connections.add(connection);

    const refuse = async (refused: TerminalRefusal): Promise<void> => connection.end({ type: 'refused', ...refused });

    /** Pump one session's output, acknowledged by offset, until it ends or another session replaces it. */
    const pump = async (owned: TerminalSession, mine: number): Promise<void> => {
      const decoder = new TextDecoder('utf-8');
      const current = (): boolean => mine === generation && !isEnded();
      try {
        for await (const chunk of owned.output) {
          if (!current()) {
            return;
          }
          const text = decoder.decode(chunk, { stream: true });
          const previous = sent;
          sent += chunk.byteLength;
          const pieces = outputPieces(text);
          for (const [index, data] of pieces.entries()) {
            post({ type: 'output', data, offset: index === pieces.length - 1 ? sent : previous });
          }
          /* Not pulling is the backpressure: the provider's queue pauses the PTY once it fills. */
          while (current() && sent - acknowledged > terminalLimits.unacknowledgedBytes) {
            acknowledgement ??= Promise.withResolvers<void>();
            // oxlint-disable-next-line no-await-in-loop -- each wait is for the pane's next acknowledgement.
            await acknowledgement.promise;
          }
        }
        if (!current()) {
          return;
        }
        const tail = decoder.decode();
        if (tail !== '') {
          post({ type: 'output', data: tail, offset: sent });
        }
        const exit = await owned.exited;
        if (!current()) {
          return;
        }
        session = undefined;
        await connection.end(exitedFrame(exit, 'shell-exited'));
      } catch (error) {
        if (current()) {
          log('terminal.output-failed', error instanceof Error ? error.message : String(error), 'warn');
          await connection.end(undefined, 'host-stopped');
        }
      }
    };

    /** Start one shell for this connection; refuses end the connection with the shell service's own words. */
    const openShell = async (size: TerminalSize, access: TerminalAccess | undefined): Promise<void> => {
      /* One admission bound for the whole start: main's allowlist, then the shell service's registration below. */
      const settleBy = now() + admissionMilliseconds;
      awaitingAdmission = true;
      const admitted = await awaitAdmission(projectRoot, isEnded, settleBy).finally(() => {
        awaitingAdmission = false;
      });
      if (isEnded()) {
        return;
      }
      if (!admitted) {
        await refuse(
          refusal(
            'project-not-admitted',
            'This project is not open in Tau.',
            'Open the project, then start the Terminal.',
          ),
        );
        return;
      }
      const probe = options.shell === undefined ? undefined : await options.shell().catch(() => undefined);
      if (isEnded()) {
        return;
      }
      if (probe === undefined) {
        await refuse(
          refusal(
            'sandbox-unavailable',
            'This computer cannot contain a shell in this Tau build.',
            'Use the typed Tau tools; Tau never starts an uncontained shell.',
          ),
        );
        return;
      }
      if (probe.status === 'unavailable') {
        await refuse(refusal(probe.code, probe.message, probe.recovery));
        return;
      }
      /* Until the shell is this connection's or refused, ending the connection cancels the open and waits for it. */
      const controller = new AbortController();
      const settled = Promise.withResolvers<void>();
      pendingOpen = { controller, settled: settled.promise };
      let refused: TerminalRefusal | undefined;
      try {
        refused = await openAndAdopt(probe.shell, controller, { settleBy, size, access });
      } finally {
        pendingOpen = undefined;
        settled.resolve();
      }
      if (refused !== undefined && !isEnded()) {
        await refuse(refused);
      }
    };

    /**
     * Open the shell, retrying while the shell service has not yet registered the project, then make it this
     * connection's. A shell that opens after the pane left is stopped here.
     * @returns The refusal to send, or `undefined` once the shell is this connection's or the pane has left.
     */
    const openAndAdopt = async (
      shell: Extract<ShellProbe, { status: 'available' }>['shell'],
      controller: AbortController,
      {
        settleBy,
        size,
        access,
      }: Readonly<{ settleBy: number; size: TerminalSize; access: TerminalAccess | undefined }>,
    ): Promise<TerminalRefusal | undefined> => {
      const openTerminal = async (): Promise<TerminalSessionOutcome> =>
        shell.openTerminal({
          projectRoot,
          size,
          signal: controller.signal,
          ...(access === undefined ? {} : { access }),
        });
      /*
       * Main's allowlist is not the shell service's: the service learns a project only when that project's agent host
       * starts, which the pane does not wait for. On the stock Debian guest the pane asked 1.8 s before it did (shell
       * conformance run 41176389935), and the person saw "This project is not open in Tau" for the project in front of
       * them. The same admission bound covers that second registry; a refusal for any other reason is final.
       */
      let outcome = await openTerminal();
      while (
        outcome.status === 'refused' &&
        outcome.code === 'project-not-admitted' &&
        now() < settleBy &&
        !isEnded()
      ) {
        // oxlint-disable-next-line no-await-in-loop -- each retry waits for the agent host to register the project.
        await new Promise<void>((resolve) => {
          setTimeout(resolve, terminalRegistrationRetryMilliseconds);
        });
        /* A pane that left, or a bound that passed, during the wait starts nothing more. */
        if (isEnded() || now() >= settleBy) {
          break;
        }
        // oxlint-disable-next-line no-await-in-loop -- one open attempt at a time.
        outcome = await openTerminal();
      }
      if (outcome.status === 'refused') {
        return refusal(outcome.code, outcome.message, outcome.recovery);
      }
      if (isEnded()) {
        /* The pane left while the shell started: stop it before anything can reach it. */
        controller.abort();
        await outcome.session[Symbol.asyncDispose]();
        return undefined;
      }
      session = outcome.session;
      abort = controller;
      opened += 1;
      sent = 0;
      acknowledged = 0;
      post({
        type: 'opened',
        session: {
          id: outcome.session.id,
          projectLabel: basename(projectRoot),
          access: {
            read: [...outcome.session.access.read],
            write: [...outcome.session.access.write],
            domains: [...outcome.session.access.domains],
          },
        },
      });
      log('terminal.opened', { granted: access !== undefined });
      // async-iife: bootstrap -- the pump ends the connection itself; nobody awaits a port's output.
      void pump(outcome.session, generation);
      return undefined;
    };

    /** Open a shell once quit holds no starts; a connection that ends while held opens nothing. */
    const start = async (size: TerminalSize, access: TerminalAccess | undefined): Promise<void> => {
      for (let hold = startHold; hold !== undefined; hold = startHold) {
        // oxlint-disable-next-line no-await-in-loop -- a released hold can be taken again by the next quit.
        await hold.promise;
        if (isEnded()) {
          return;
        }
      }
      starting = true;
      try {
        await openShell(size, access);
      } finally {
        starting = false;
      }
    };

    const handle = async (frame: TerminalClientFrame, epoch: number): Promise<void> => {
      if (isEnded()) {
        return;
      }
      /* Input, resizes and acknowledgements typed against an earlier (or not yet opened) shell are dropped, never
       * delivered to the session that replaced it: widening never replays input. */
      const stale = epoch !== opened || session === undefined;
      switch (frame.type) {
        case 'open': {
          if (opening) {
            await refuse(invalidFrame);
            return;
          }
          opening = true;
          clearTimeout(openTimer);
          if (live.has(key)) {
            await refuse(
              refusal(
                'session-limit',
                'This window already has a Terminal for this project.',
                'Use the open Terminal, or close it first.',
              ),
            );
            return;
          }
          live.set(key, connection);
          claimed = true;
          size = frame.size;
          await start(frame.size, undefined);
          return;
        }
        case 'input': {
          if (!stale) {
            session?.write(encoder.encode(frame.data));
          }
          return;
        }
        case 'resize': {
          size = frame.size;
          if (!stale) {
            session?.resize(frame.size);
          }
          return;
        }
        case 'ack': {
          if (stale) {
            return;
          }
          if (frame.offset < acknowledged || frame.offset > sent) {
            await refuse(invalidFrame);
            return;
          }
          acknowledged = frame.offset;
          wake();
          return;
        }
        case 'request-access': {
          if (stale) {
            return;
          }
          /* One outstanding request per session; a newer one replaces it, and the older id stops answering. */
          const accessExpires = now() + accessRequestMilliseconds;
          pendingAccess = { id: randomUUID(), access: frame.access, accessExpires };
          post({
            type: 'access-requested',
            requestId: pendingAccess.id,
            access: frame.access,
            expiresAt: new Date(accessExpires).toISOString(),
          });
          return;
        }
        case 'decide-access': {
          const pending = pendingAccess;
          if (pending === undefined || pending.id !== frame.requestId || now() > pending.accessExpires) {
            /* Not terminal: a stale answer must not cost the person their running shell. */
            post({
              type: 'refused',
              ...refusal('request-expired', 'That access request expired.', 'Request access again from the pane.'),
            });
            return;
          }
          pendingAccess = undefined;
          if (frame.decision === 'deny' || session === undefined) {
            return;
          }
          const exit = await stopSession();
          if (isEnded()) {
            return;
          }
          post(exitedFrame(exit, 'replaced'));
          await start(size, pending.access);
          break;
        }
        case 'close': {
          await connection.end(undefined, 'closed');
          break;
        }
      }
    };

    const abandonUnopened = (): void => {
      if (!opening) {
        void connection.end(undefined);
      }
    };
    const openTimer = setTimeout(abandonUnopened, openMilliseconds);
    openTimer.unref();

    /* Frames are handled in arrival order, each stamped with the session it was sent against. `close` and an invalid
     * frame act at once: neither waits behind a shell that is still starting. */
    let queue = Promise.resolve();
    port.on('message', (message: unknown) => {
      if (isEnded()) {
        return;
      }
      const parsed = terminalClientFrameSchema.safeParse((message as { readonly data?: unknown } | undefined)?.data);
      if (!parsed.success) {
        log('terminal.invalid-frame', undefined, 'warn');
        void refuse(invalidFrame);
        return;
      }
      const frame = parsed.data;
      if (frame.type === 'close') {
        void connection.end(undefined, 'closed');
        return;
      }
      const epoch = opened;
      const previous = queue;
      queue = (async (): Promise<void> => {
        await previous;
        try {
          await handle(frame, epoch);
        } catch (error) {
          log('terminal.frame-failed', error instanceof Error ? error.message : String(error), 'warn');
          void connection.end(undefined, 'host-stopped');
        }
      })();
    });
    port.on('close', () => {
      void connection.end(undefined);
    });
    port.start();
  };

  return {
    serve,
    revokeUntrusted() {
      for (const connection of connections) {
        /* A start still awaiting its project's first admission is not a revoked session; it waits on. */
        if (!options.isTrustedRoot(connection.projectRoot) && !connection.isAwaitingAdmission()) {
          void connection.end(undefined, 'project-changed');
        }
      }
      const changed = rootsChanged;
      rootsChanged = Promise.withResolvers<void>();
      changed.resolve();
    },
    async closeAll() {
      const ending = Promise.allSettled(
        [...connections].map(async (connection) => connection.end(undefined, 'host-stopped')),
      );
      /* Held starts wake to find their connection ended; a fresh hold stays for the rest of quiesce and exit, so a
       * pane that connects now opens nothing that would then be stopped unasked. Only a call-off removes it. */
      const woken = startHold;
      startHold = Promise.withResolvers<void>();
      woken?.resolve();
      await ending;
    },
    holdStarts() {
      startHold ??= Promise.withResolvers<void>();
    },
    releaseStarts,
    sessions: () => [...connections].filter((connection) => connection.isLive()).length,
  };
};
