/**
 * Test fixture for the browser leadership binding alone (W6.r1 findings 2, 6 and 12; RH-A3): a scripted launcher, a
 * tab that plays another tab's leader over the real Web Lock and `BroadcastChannel`, and polling. Browser-safe, so the
 * Node tier (`leadership.test.ts`) and the browser tier (`leadership.browser.test.ts`) share it.
 */

import { createBrowserLeadership } from '#browser/leadership.js';
import type { BrowserLeadershipOptions } from '#browser/leadership.js';
import type { LeadershipHost, LeadershipPort } from '#launchers/chat-store.js';
import { chatLeadershipNames } from '#launchers/leadership/names.js';
import type { CommandAnswer, HostCommand } from '#wire/commands.schema.js';
import { agentWireVersion } from '#wire/frames.schema.js';

export const bindingDelays = {
  heartbeatInterval: 100,
  heartbeatTimeout: 400,
  recoveryDelay: 400,
  claimBound: 2000,
  queuedWriteBound: 2000,
  closedHostBound: 800,
} as const;

export const wait = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

export const until = async (check: () => boolean | Promise<boolean>, attempts = 300): Promise<void> => {
  for (let attempt = 0; attempt < attempts; attempt++) {
    // oxlint-disable-next-line no-await-in-loop -- polling is sequential by nature.
    if (await check()) {
      return;
    }
    // oxlint-disable-next-line no-await-in-loop -- see above.
    await wait(10);
  }
  throw new Error('The condition never held.');
};

export const heldLocks = async (): Promise<readonly string[]> => {
  const { held = [] } = await navigator.locks.query();
  return held.map((lock) => lock.name ?? '');
};

let projects = 0;
/** A project id no other case shares, so its locks and channels are its own. */
export const uniqueProject = (): string => {
  projects += 1;
  return `project-binding-${String(projects)}-${String(Date.now())}`;
};

export const applied = (commandId: string, generation: number): CommandAnswer => ({
  commandId,
  generation,
  status: 'applied',
  effect: 'durable',
  cursor: 0,
});

export const cancelCommand = (commandId: string, chatId: string): HostCommand => ({
  type: 'cancel',
  commandId,
  payload: { chatId, runId: 'run-1' },
});

export const startCommand = (commandId: string, chatId: string): HostCommand => ({
  type: 'start',
  commandId,
  payload: { trigger: 'submit', chatId, runId: 'run-1', message: { id: 'user-1', role: 'user', content: 'Go.' } },
});

/** What a leader draining its project answers a new run (T3). */
export const closedAnswer = (commandId: string): CommandAnswer => ({
  commandId,
  generation: 0,
  status: 'refused',
  effect: 'not-applied',
  code: 'HOST_CLOSED',
  message: 'This project host is closing and starts no new run.',
});

export type ScriptedHost = Readonly<{ host: LeadershipHost; calls: string[] }>;

/** A launcher that records what the binding asks of it; each step can be replaced. */
export const scriptedHost = (overrides: Partial<LeadershipHost> = {}): ScriptedHost => {
  const calls: string[] = [];
  const host: LeadershipHost = {
    openView: async () => {
      calls.push('openView');
      return { kind: 'read', epoch: 5 };
    },
    dropView: async () => {
      calls.push('dropView');
    },
    assume: () => {
      calls.push('assume');
    },
    claim: async () => {
      calls.push('claim');
    },
    relinquish: async () => {
      calls.push('relinquish');
    },
    execute: async (command, epoch) => {
      calls.push('execute');
      return applied(command.commandId, epoch);
    },
    read: async () => {
      throw new Error('No read is scripted.');
    },
    writing: () => false,
    wakeReads: () => undefined,
    publishLive: () => undefined,
    ...overrides,
  };
  return { host, calls };
};

const ports: LeadershipPort[] = [];

/** This tab's binding (`tab-b`) over `host`; `closePorts` closes it after the case. */
export const bindTab = (
  host: LeadershipHost,
  options: Readonly<{ project: string; canSteal?: boolean; clock?: BrowserLeadershipOptions['clock'] }>,
): LeadershipPort => {
  const port = createBrowserLeadership({
    projectId: options.project,
    sender: 'tab-b',
    build: 'build-1',
    canSteal: options.canSteal ?? true,
    delays: bindingDelays,
    ...(options.clock === undefined ? {} : { clock: options.clock }),
  })(host);
  ports.push(port);
  return port;
};

export const closePorts = async (): Promise<void> => {
  await Promise.all(ports.splice(0).map(async (port) => port.close()));
};

export type PlayedLeader = Readonly<{
  names: ReturnType<typeof chatLeadershipNames>;
  commands: ReadonlyArray<Readonly<{ corr: string; commandId: string }>>;
  stolen: () => boolean;
  heartbeat: () => void;
  answer: (corr: string, answer: CommandAnswer) => void;
  release: () => void;
  close: () => void;
}>;

/**
 * Another tab's leader (`tab-a`) at `epoch`, played by the case: it holds the chat's Web Lock and speaks on its channel.
 * A frozen leader is one the case stops speaking for.
 */
export const playLeader = async (project: string, chatId: string, epoch = 1): Promise<PlayedLeader> => {
  const names = chatLeadershipNames(project, chatId);
  let stolen = false;
  let letGo = (): void => undefined;
  const held = new Promise<void>((resolve) => {
    letGo = resolve;
  });
  const hold = async (): Promise<void> => {
    try {
      await navigator.locks.request(names.lock, async () => held);
    } catch {
      stolen = true;
    }
  };
  // ponytail: the lock is held for the case's whole run; `close` or `release` settles it.
  void hold();
  await until(async () => {
    const locks = await heldLocks();
    return locks.includes(names.lock);
  });
  const channel = new BroadcastChannel(names.channel);
  const commands: Array<Readonly<{ corr: string; commandId: string }>> = [];
  channel.addEventListener(
    'message',
    (message: MessageEvent<{ readonly kind: string; readonly body: { corr: string; commandId: string } }>) => {
      if (message.data.kind === 'cmd') {
        commands.push(message.data.body);
      }
    },
  );
  const post = (kind: string, body: unknown): void => {
    channel.postMessage({ wire: agentWireVersion, build: 'build-1', kind, chatId, sender: 'tab-a', epoch, body });
  };
  return {
    names,
    commands,
    stolen: () => stolen,
    heartbeat: () => {
      post('hb', { state: 'leading' });
    },
    answer: (corr: string, answer: CommandAnswer) => {
      post('ans', { to: 'tab-b', corr, answer });
    },
    /** Let the lock go, as a holder whose run ended does (EQ4). */
    release: () => {
      post('hb', { state: 'released' });
      letGo();
    },
    close: () => {
      channel.close();
      letGo();
    },
  };
};
