/**
 * The browser leadership binding (W6 RH-S7): one M2 actor per chat, whose effects are a Web Lock and the chat's
 * `BroadcastChannel`. Frames are parsed here only (EQ5); M2 sees `frame` events. Effects that open, claim or close
 * the chat's writer, and the lock's requests and releases, run one after another per chat: a relinquish never
 * overtakes the claim before it, a grant is released only after the writer it served is closed (finding 12), and a
 * request never races this worker's own release. A faulted chat is replaced on its next command (finding 6, D-092).
 */

import { createActor } from 'xstate';

import type { HostClock } from '#harness/session.js';
import type { LeadershipHost, LeadershipPort } from '#launchers/chat-store.js';
import { parseLeadershipFrame } from '#launchers/leadership/frames.js';
import type { LeadershipFrame } from '#launchers/leadership/frames.js';
import { firedLate, leadershipMachine } from '#launchers/leadership/leadership.machine.js';
import type { LeadershipEffectArgs, LockMode } from '#launchers/leadership/leadership.machine.js';
import { chatLeadershipNames } from '#launchers/leadership/names.js';
import type { SourceLiveEvent } from '#waist/ports.js';
import type { CommandAnswer, HostCommand } from '#wire/commands.schema.js';
import { agentWireVersion } from '#wire/frames.schema.js';
import type { ReadAnswer, ReadInput } from '#wire/frames.schema.js';

/** Whether the page is visible, and its changes (RH-R16); a change to visible is also a `pageshow`. @internal */
export type PageVisibility = Readonly<{
  visible: () => boolean;
  subscribe: (listener: (visible: boolean) => void) => () => void;
}>;

/** The actor clock M2's timers run on, and the time the frozen-time rule measures lateness by (W4 T9). @internal */
export type LeadershipClock = HostClock & Readonly<{ now: () => number }>;

/** M2's bounds (C1, C2, C5, C9, C10, C11). @internal */
export type LeadershipDelays = Readonly<{
  heartbeatInterval: number;
  heartbeatTimeout: number;
  recoveryDelay: number;
  claimBound: number;
  queuedWriteBound: number;
  /** C11: a forwarded admission a draining holder refused waits this long for its release or a successor. */
  closedHostBound: number;
}>;

const defaultDelays: LeadershipDelays = {
  heartbeatInterval: 1000,
  heartbeatTimeout: 3500,
  recoveryDelay: 3500,
  claimBound: 10_000,
  queuedWriteBound: 10_000,
  closedHostBound: 10_000,
};

/** What one worker's leadership needs. @internal */
export type BrowserLeadershipOptions = Readonly<{
  projectId: string;
  /** The worker's `tabId` (RH-R5). */
  sender: string;
  /** The composition root's build identity (RH-R7). */
  build: string;
  /** The writer's fence is per append (the provider leg), so a steal from a silent holder can serve (RH-R12). */
  canSteal: boolean;
  visibility?: PageVisibility | undefined;
  clock?: LeadershipClock | undefined;
  delays?: Partial<LeadershipDelays> | undefined;
}>;

/** How long a forwarded long poll is served before an empty batch answers it (the reader then reads again). */
const forwardedReadBound = 20_000;

type Lock = {
  readonly abort: AbortController;
  readonly release: () => void;
  /** Settles once the Web Lock request settled: the lock is free again, or was never taken. */
  readonly settled: Promise<void>;
  granted: boolean;
};

type Actor = ReturnType<typeof createActor<typeof leadershipMachine>>;

type Chat = Readonly<{
  actor: Actor;
  channel: BroadcastChannel;
  locks: Map<string, Lock>;
  writes: Map<string, (answer: CommandAnswer) => void>;
  reads: Map<string, Readonly<{ input: ReadInput; resolve: (answer: ReadAnswer) => void }>>;
  /** The per-chat order of writer effects. */
  chain: { current: Promise<void> };
  /** Aborts the reads this worker serves for other tabs when it stops leading. */
  serving: { current: AbortController };
}>;

const hostFault = (command: Pick<HostCommand, 'commandId'>, error: unknown): CommandAnswer => ({
  commandId: command.commandId,
  generation: 0,
  status: 'refused',
  effect: 'unknown',
  code: 'HOST_FAULT',
  message: error instanceof Error ? error.message : String(error),
});

/**
 * Bind leadership to Web Locks and `BroadcastChannel` for one worker.
 *
 * @param options - The worker's identity and the page's visibility.
 * @returns The binding a browser chat store hands its launcher.
 * @internal
 */
export const createBrowserLeadership =
  (options: BrowserLeadershipOptions) =>
  (host: LeadershipHost): LeadershipPort => {
    const chats = new Map<string, Chat>();
    let seq = 0;
    let closed = false;
    /* Without a clock, the worker's own timers, and `performance.now` for the late-fire measure. */
    const now = (): number => options.clock?.now() ?? performance.now();
    const delays = { ...defaultDelays, ...options.delays };
    const unsubscribe = options.visibility?.subscribe((visible) => {
      for (const chat of chats.values()) {
        if (chat.actor.getSnapshot().status !== 'active') {
          continue;
        }
        chat.actor.send({ type: 'visibility', visible });
        if (visible) {
          /* A page shown again (`pageshow`) may have been frozen: its heartbeat bounds start again. */
          chat.actor.send({ type: 'resume' });
        }
      }
    });

    /** Let a faulted chat's resources go, after the effects it already ordered (finding 6). */
    const retire = async (chat: Chat): Promise<void> => {
      chat.actor.stop();
      chat.channel.close();
      chat.serving.current.abort();
      const left = [...chat.locks.values()];
      chat.locks.clear();
      await chat.chain.current;
      for (const lock of left) {
        lock.release();
        lock.abort.abort();
      }
    };

    const open = (chatId: string): Chat => {
      const existing = chats.get(chatId);
      if (existing?.actor.getSnapshot().status === 'active') {
        return existing;
      }
      const names = chatLeadershipNames(options.projectId, chatId);
      const self = { chatId, sender: options.sender, wire: agentWireVersion, build: options.build };
      const channel = new BroadcastChannel(names.channel);
      const post = (kind: string, epoch: number, body: unknown): void => {
        const frame: LeadershipFrame = { ...self, kind, epoch, body };
        channel.postMessage(frame);
      };
      const locks = new Map<string, Lock>();
      const writes = new Map<string, (answer: CommandAnswer) => void>();
      const reads = new Map<string, Readonly<{ input: ReadInput; resolve: (answer: ReadAnswer) => void }>>();
      /* A replacement's effects, its first lock request included, run after its predecessor's releases. */
      const chain = { current: existing === undefined ? Promise.resolve() : retire(existing) };
      const serving = { current: new AbortController() };
      const deliver = (event: Parameters<Actor['send']>[0]): void => {
        if (actor.getSnapshot().status === 'active') {
          actor.send(event);
        }
      };
      const serial = (step: () => Promise<void>): void => {
        const previous = chain.current;
        chain.current = (async (): Promise<void> => {
          await previous;
          try {
            await step();
          } catch (error) {
            console.error('[agent-host leadership] an effect failed', chatId, error);
          }
        })();
      };

      const requestLock = ({ corr, mode }: Readonly<{ corr: string; mode: LockMode }>): void => {
        const abort = new AbortController();
        let release = (): void => undefined;
        const held = new Promise<void>((resolve) => {
          release = resolve;
        });
        let settle = (): void => undefined;
        const settled = new Promise<void>((resolve) => {
          settle = resolve;
        });
        const lock: Lock = { abort, release, settled, granted: false };
        locks.set(corr, lock);
        const request =
          mode === 'ifAvailable'
            ? { ifAvailable: true }
            : mode === 'steal'
              ? { steal: true }
              : { signal: abort.signal };
        /* After this chat's earlier effects: a release this worker already ordered frees the lock first. The request
         * itself is not awaited, so a queued wait never holds the chain. */
        serial(async () => {
          if (locks.get(corr) !== lock) {
            settle();
            return;
          }
          // async-iife: bootstrap -- a grant is held for as long as its callback runs; M2 hears the outcome as events.
          void (async (): Promise<void> => {
            try {
              await navigator.locks.request(names.lock, request, async (granted) => {
                if (locks.get(corr) !== lock) {
                  return;
                }
                if (granted === null) {
                  locks.delete(corr);
                  deliver({ type: 'lockUnavailable', corr });
                  return;
                }
                lock.granted = true;
                deliver({ type: 'lockGranted', corr });
                await held;
              });
            } catch {
              /* A steal of this grant, or a queued request that failed before it was granted. */
              if (locks.get(corr) !== lock) {
                return;
              }
              locks.delete(corr);
              deliver(lock.granted ? { type: 'lockLost', corr } : { type: 'lockUnavailable', corr });
            } finally {
              settle();
            }
          })();
        });
      };

      /* Finding 12: a grant goes only after the relinquish ordered before it closed the writer, so the next grantee
       * never finds the OPFS handle still open; a request not yet granted is withdrawn at once (RH-R16). */
      const releaseLock = ({ corr }: LeadershipEffectArgs['releaseLock']): void => {
        const lock = locks.get(corr);
        locks.delete(corr);
        if (lock === undefined) {
          return;
        }
        lock.abort.abort();
        serial(async () => {
          lock.release();
          /* The lock is free before anything later on the chain, the `released` heartbeat included. */
          await lock.settled;
        });
      };

      /** When the addressed epoch's heartbeat bound was last armed (`watchHolder`). */
      let watchedAt = now();
      const effects: { readonly [Name in keyof LeadershipEffectArgs]: (args: LeadershipEffectArgs[Name]) => void } = {
        requestLock,
        releaseLock,
        broadcast: ({ kind, epoch, body }) => {
          if (kind === 'hb' && body['state'] === 'released') {
            /* After the relinquish and the lock release ordered before it: a follower that hears it finds the writer
             * closed and the lock free (W6.r1 round 3). */
            serial(async () => {
              post(kind, epoch, body);
            });
            return;
          }
          post(kind, epoch, body);
        },
        readView: ({ corr }) => {
          serial(async () => {
            try {
              const view = await host.openView(chatId);
              deliver(
                view.kind === 'read'
                  ? { type: 'viewRead', corr, epoch: view.epoch }
                  : { type: 'viewRefused', corr, code: view.code },
              );
            } catch (error) {
              deliver({ type: 'viewFailed', corr, message: error instanceof Error ? error.message : String(error) });
            }
          });
        },
        claim: ({ epoch }) => {
          serial(async () => {
            host.assume(chatId, epoch);
            await host.claim(chatId);
          });
        },
        runLocal: ({ corr, command, epoch }) => {
          /* After the claim before it, but never holding the chain: a run's command may outlive many effects. */
          const after = chain.current;
          // async-iife: bootstrap -- M2 hears the answer as `executed`; nothing waits on this block itself.
          void (async (): Promise<void> => {
            await after;
            let answer: CommandAnswer;
            try {
              answer = await host.execute(command, epoch);
            } catch (error) {
              answer = hostFault(command, error);
            }
            if (actor.getSnapshot().status === 'active') {
              actor.send({ type: 'executed', corr, answer });
            } else {
              /* This chat's leadership faulted meanwhile: its own command's answer still reaches its caller. */
              writes.get(corr)?.(answer);
              writes.delete(corr);
            }
          })();
        },
        answer: ({ corr, answer }) => {
          writes.get(corr)?.(answer);
          writes.delete(corr);
        },
        readLocal: ({ corr }) => {
          const read = reads.get(corr);
          reads.delete(corr);
          if (read !== undefined) {
            // async-iife: bootstrap -- the read's answer goes to the reader parked on it.
            void (async (): Promise<void> => {
              try {
                read.resolve(await host.read(read.input));
              } catch (error) {
                console.error('[agent-host leadership] a read failed', chatId, error);
                read.resolve({ status: 'refused', chatId, reason: 'owner-fenced' });
              }
            })();
          }
        },
        serveRead: ({ corr, request, to, epoch }) => {
          const signal = AbortSignal.any([serving.current.signal, AbortSignal.timeout(forwardedReadBound)]);
          // async-iife: bootstrap -- the answer goes to the tab that asked, over the channel.
          void (async (): Promise<void> => {
            try {
              post('en', epoch, { to, corr, answer: await host.read({ ...request, signal }) });
            } catch (error) {
              console.error('[agent-host leadership] a forwarded read failed', chatId, error);
            }
          })();
        },
        answerRead: ({ corr, answer }) => {
          reads.get(corr)?.resolve(answer);
          reads.delete(corr);
        },
        relinquish: () => {
          serving.current.abort();
          serving.current = new AbortController();
          serial(async () => {
            await host.relinquish(chatId);
            await host.dropView(chatId);
          });
        },
        wakeReads: () => {
          host.wakeReads(chatId);
        },
        watchHolder: () => {
          watchedAt = now();
        },
        checkHolder: () => {
          deliver({ type: 'holderSilent', late: firedLate(watchedAt, now(), delays) });
        },
      };

      const { closedHostBound, ...machineDelays } = delays;
      const machine = leadershipMachine.provide({ actions: effects, delays: machineDelays });
      const actor: Actor = createActor(machine, {
        input: {
          chatId,
          sender: options.sender,
          build: options.build,
          wire: agentWireVersion,
          canSteal: options.canSteal,
          visible: options.visibility?.visible() ?? true,
          closedHostBound,
        },
        ...(options.clock === undefined ? {} : { clock: options.clock }),
      });
      const chat: Chat = { actor, channel, locks, writes, reads, chain, serving };
      chats.set(chatId, chat);
      channel.addEventListener('message', (message: MessageEvent<unknown>) => {
        const parsed = parseLeadershipFrame(message.data, self);
        if (parsed === undefined) {
          return;
        }
        if (parsed.kind === 'live') {
          /* The holder's run, for this worker's subscribers; a leader publishes its own. */
          if (!actor.getSnapshot().hasTag('leading')) {
            host.publishLive(parsed.event);
          }
          return;
        }
        deliver({ type: 'frame', message: parsed });
      });
      actor.start();
      return chat;
    };

    const corr = (label: string): string => {
      seq += 1;
      return `${label}:${options.sender}:${String(seq)}`;
    };

    return {
      execute: async (chatId, command) => {
        if (closed) {
          return hostFault(command, new Error('The agent host is closing.'));
        }
        const chat = open(chatId);
        const id = corr('w');
        const answered = new Promise<CommandAnswer>((resolve) => {
          chat.writes.set(id, resolve);
        });
        chat.actor.send({ type: 'command', corr: id, command });
        return answered;
      },
      read: async (input, local) => {
        if (closed) {
          return local();
        }
        const chat = open(input.chatId);
        const id = corr('r');
        const { signal, ...request } = input;
        const answered = new Promise<ReadAnswer>((resolve) => {
          chat.reads.set(id, { input, resolve });
        });
        /* The reader let go: answer from here at once, never waiting on another tab (D17). */
        signal?.addEventListener(
          'abort',
          () => {
            const read = chat.reads.get(id);
            chat.reads.delete(id);
            if (read !== undefined) {
              // async-iife: bootstrap -- the local answer goes to the reader that let go of the forward.
              void (async (): Promise<void> => {
                read.resolve(await local());
              })();
            }
          },
          { once: true },
        );
        chat.actor.send({ type: 'read', corr: id, request });
        return answered;
      },
      role: (chatId) => {
        const snapshot = chats.get(chatId)?.actor.getSnapshot();
        if (snapshot?.hasTag('leading') === true) {
          return { role: 'leader', epoch: (snapshot.context as { readonly epoch?: number }).epoch ?? 0 };
        }
        if (snapshot?.hasTag('following') === true) {
          return { role: 'follower', epoch: snapshot.context.heard?.epoch ?? 0 };
        }
        return { role: 'none', epoch: 0 };
      },
      stoppability: (chatId) => {
        const snapshot = chats.get(chatId)?.actor.getSnapshot();
        if (snapshot?.hasTag('leading') === true) {
          return 'stoppable';
        }
        if (snapshot?.matches({ following: 'alive' }) === true) {
          return snapshot.context.heard?.foreign === true ? 'other-build' : 'stoppable';
        }
        return 'background-window';
      },
      appended: (chatId, endCursor) => {
        chats.get(chatId)?.actor.send({ type: 'appended', endCursor });
      },
      fenced: (chatId) => {
        chats.get(chatId)?.actor.send({ type: 'fenced' });
      },
      quiescent: (chatId, quiescent) => {
        chats.get(chatId)?.actor.send({ type: 'quiescent', quiescent });
      },
      liveEvent: (event: SourceLiveEvent) => {
        const chat = chats.get(event.chatId);
        const snapshot = chat?.actor.getSnapshot();
        if (chat !== undefined && snapshot?.hasTag('leading') === true) {
          const frame: LeadershipFrame = {
            wire: agentWireVersion,
            build: options.build,
            kind: 'live',
            chatId: event.chatId,
            sender: options.sender,
            epoch: (snapshot.context as { readonly epoch?: number }).epoch ?? 0,
            body: { event },
          };
          chat.channel.postMessage(frame);
        }
      },
      reconcile: (chatId, request) => {
        if (!closed) {
          open(chatId).actor.send({ type: 'reconcile', wait: request.wait });
        }
      },
      close: async () => {
        closed = true;
        unsubscribe?.();
        const closing = [...chats.values()];
        chats.clear();
        for (const chat of closing) {
          chat.actor.send({ type: 'close' });
        }
        await Promise.all(closing.map(async (chat) => chat.chain.current));
        for (const chat of closing) {
          chat.actor.stop();
          chat.channel.close();
          chat.serving.current.abort();
          for (const lock of chat.locks.values()) {
            lock.release();
            lock.abort.abort();
          }
        }
      },
    };
  };
