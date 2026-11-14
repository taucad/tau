// @vitest-environment jsdom

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StepClock } from '@taucad/xstate-testing/clock';
import { UnloadProvider, useFlushOnClose, useFlushProducers } from '#hooks/use-flush-on-close.js';
import { SessionsProvider } from '#hooks/use-sessions.js';
import { startEnvironmentHost } from '#runtime/environment.fixture.js';
import type { EnvironmentHostFixture } from '#runtime/environment.fixture.js';
import { registerProjectSessionServices } from '#services/sessions-store.js';

/* A0.2: the desktop quit seam `environment` is composed with, captured so a row can ask the renderer to quit. */
const desktopQuit = {
  ask: undefined as ((attemptId: string) => void) | undefined,
  answers: [] as string[],
  seam: {
    onQuitRequested: (handler: (attemptId: string) => void) => {
      desktopQuit.ask = handler;
      return () => {
        desktopQuit.ask = undefined;
      };
    },
    reportQuiesced: (attemptId: string, forced: boolean) => {
      desktopQuit.answers.push(`${attemptId}:${String(forced)}`);
    },
  },
};
vi.mock('#components/nav/project-close-dialogs.js', () => ({ BudgetRefusedDialog: () => null }));
vi.mock('#services/project-agent-host-registration.js', () => ({
  registerProjectAgentHost: async () => ({ release: async () => undefined }),
}));

let visibility: DocumentVisibilityState = 'visible';

/* D26: `environment` is the one listener; each row composes it over the page with a sequencer of its own. */
let environment: EnvironmentHostFixture = startEnvironmentHost();
const startEnvironment = (options?: Parameters<typeof startEnvironmentHost>[0]): EnvironmentHostFixture => {
  environment.stop();
  environment = startEnvironmentHost(options);
  return environment;
};
beforeEach(() => {
  startEnvironment();
});
afterEach(() => {
  environment.stop();
});

function Registration({
  callback,
  stage,
}: {
  readonly callback: (phase: 'hidden' | 'pagehide') => void | Promise<void>;
  readonly stage: 'producer' | 'session';
}): undefined {
  useFlushOnClose(callback, { stage });
  return undefined;
}

describe('UnloadProvider', () => {
  beforeEach(() => {
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    });
  });

  it('awaits hidden producers before sessions and runs only prepared session work at pagehide', async () => {
    const sequence: string[] = [];
    const producer = Promise.withResolvers<void>();

    render(
      <UnloadProvider sequencer={environment.sequencer}>
        <Registration
          callback={(phase) => {
            sequence.push(`session:${phase}`);
          }}
          stage='session'
        />
        <Registration
          callback={async (phase) => {
            sequence.push(`producer:${phase}:start`);
            await producer.promise;
            sequence.push(`producer:${phase}:done`);
          }}
          stage='producer'
        />
      </UnloadProvider>,
    );

    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(sequence).toEqual(['producer:hidden:start']);

    producer.resolve();
    await waitFor(() => {
      expect(sequence).toEqual(['producer:hidden:start', 'producer:hidden:done', 'session:hidden']);
    });

    sequence.length = 0;
    globalThis.dispatchEvent(new Event('pagehide'));
    expect(sequence).toEqual(['session:pagehide']);
  });

  it('should await every producer on demand while the page is still visible, and run no session work', async () => {
    const sequence: string[] = [];
    const producer = Promise.withResolvers<void>();
    let flushProducers: (() => Promise<void>) | undefined;

    function FlushProducersProbe(): undefined {
      flushProducers = useFlushProducers();
      return undefined;
    }

    render(
      <UnloadProvider sequencer={environment.sequencer}>
        <Registration
          callback={(phase) => {
            sequence.push(`session:${phase}`);
          }}
          stage='session'
        />
        <Registration
          callback={async (phase) => {
            sequence.push(`producer:${phase}:start`);
            await producer.promise;
            sequence.push(`producer:${phase}:done`);
          }}
          stage='producer'
        />
        <FlushProducersProbe />
      </UnloadProvider>,
    );

    let settled = false;
    const flushing = (async () => {
      await flushProducers?.();
      settled = true;
    })();
    await Promise.resolve();
    expect(sequence).toEqual(['producer:hidden:start']);
    expect(settled).toBe(false);

    producer.resolve();
    await flushing;
    expect(sequence).toEqual(['producer:hidden:start', 'producer:hidden:done']);
  });

  it('should name each refusal once while retaining every original cause', async () => {
    const layout = new Error('Pane layout is not confirmed saved.');
    const view = new Error('View settings are not confirmed saved.');
    const grouped = new AggregateError([layout, view], `${layout.message} ${view.message}`);
    let flush = async (): Promise<void> => undefined;
    function Probe(): undefined {
      flush = useFlushProducers();
      return undefined;
    }
    render(
      <UnloadProvider sequencer={environment.sequencer}>
        <Registration
          stage='producer'
          callback={() => {
            throw layout;
          }}
        />
        <Registration
          stage='producer'
          callback={() => {
            throw grouped;
          }}
        />
        <Probe />
      </UnloadProvider>,
    );
    await expect(flush()).rejects.toMatchObject({
      message: `${layout.message} ${view.message}`,
      errors: [layout, grouped],
    });
  });

  it('keeps session teardown behind a failed producer and permits a successful retry', async () => {
    const reported = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const sequence: string[] = [];
      let offline = true;
      let flushProducers: (() => Promise<void>) | undefined;
      const Probe = (): undefined => {
        flushProducers = useFlushProducers();
        return undefined;
      };
      render(
        <UnloadProvider sequencer={environment.sequencer}>
          <Registration
            stage='producer'
            callback={async () => {
              sequence.push('producer');
              if (offline) {
                throw new Error('checked write unavailable');
              }
            }}
          />
          <Registration
            stage='session'
            callback={() => {
              sequence.push('session');
            }}
          />
          <Probe />
        </UnloadProvider>,
      );
      await expect(flushProducers?.()).rejects.toThrow('checked write unavailable');
      expect(sequence).toEqual(['producer']);
      visibility = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
      await waitFor(() => {
        expect(reported).toHaveBeenCalledTimes(1);
      });
      expect(sequence).toEqual(['producer', 'producer']);
      offline = false;
      await flushProducers?.();
      expect(sequence).toEqual(['producer', 'producer', 'producer']);
      document.dispatchEvent(new Event('visibilitychange'));
      await waitFor(() => {
        expect(sequence.at(-1)).toBe('session');
      });
    } finally {
      reported.mockRestore();
    }
  });
});

/*
 * A0.2 (row S26, D26): the eight `useFlushOnClose` registrations the app mounts today, with the stage each
 * declares. Seven are producers; the revision lifecycle's is the session stage — the close cut.
 */
const unloadRegistrations = [
  { site: 'routes/w.$workspace.$project/project-live-sessions.tsx', stage: 'producer' },
  { site: 'routes/w.$workspace.$project/entries-sync-host.tsx', stage: 'producer' },
  { site: 'routes/w.$workspace.$project/workbench-record-host.tsx', stage: 'producer' },
  { site: 'routes/w.$workspace.$project/view-settings-sync-host.tsx', stage: 'producer' },
  { site: 'hooks/use-revision-status.ts', stage: 'session' },
  { site: 'hooks/use-editor-document-session.tsx', stage: 'producer' },
  { site: 'hooks/active-chat-provider.tsx', stage: 'producer' },
  { site: 'components/global-chat-flush-guard.tsx', stage: 'producer' },
] as const;

/** Each registration's callback, as a step a row can hold open and release. */
const heldRegistrations = (sequence: string[]) =>
  unloadRegistrations.map(({ site, stage }) => {
    const gate = Promise.withResolvers<void>();
    return {
      site,
      stage,
      release: gate.resolve,
      callback: async (phase: 'hidden' | 'pagehide'): Promise<void> => {
        sequence.push(`${stage}:${site}:${phase}:start`);
        if (stage === 'producer') {
          await gate.promise;
        }
        sequence.push(`${stage}:${site}:${phase}:done`);
      },
    };
  });

describe('UnloadProvider — the unload order over the S26 registrations (A0.2 item 9)', () => {
  beforeEach(() => {
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    });
  });

  it('should name the eight registration sites with the stage each declares', async () => {
    const declared = await Promise.all(
      unloadRegistrations.map(async ({ site }) => {
        const source = await readFile(join(dirname(fileURLToPath(import.meta.url)), '..', site), 'utf8');
        return [...source.matchAll(/useFlushOnClose\([\s\S]*?\{ stage: '(producer|session)' \}\s*,?\s*\)/gu)].map(
          (match) => match[1],
        );
      }),
    );
    expect(declared).toEqual(unloadRegistrations.map(({ stage }) => [stage]));
  });

  it('should settle every producer on hidden before the session stage runs, and run only the session stage on pagehide', async () => {
    const sequence: string[] = [];
    const registrations = heldRegistrations(sequence);
    render(
      <UnloadProvider sequencer={environment.sequencer}>
        {registrations.map(({ site, stage, callback }) => (
          <Registration key={site} stage={stage} callback={callback} />
        ))}
      </UnloadProvider>,
    );

    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    await act(async () => {
      await Promise.resolve();
    });
    const producers = registrations.filter(({ stage }) => stage === 'producer');
    expect(sequence.toSorted()).toEqual(producers.map(({ site }) => `producer:${site}:hidden:start`).toSorted());

    /* Release them out of registration order; the session stage waits for the last. */
    for (const producer of producers.toReversed()) {
      expect(sequence.some((entry) => entry.startsWith('session:'))).toBe(false);
      // oxlint-disable-next-line no-await-in-loop -- one release per step, in order, is the point
      await act(async () => {
        producer.release();
        await Promise.resolve();
      });
    }
    await waitFor(() => {
      expect(sequence.at(-1)).toBe('session:hooks/use-revision-status.ts:hidden:done');
    });
    const firstSession = sequence.findIndex((entry) => entry.startsWith('session:'));
    const producerDone = sequence.filter((entry) => entry.startsWith('producer:') && entry.endsWith(':done'));
    expect(producerDone).toHaveLength(7);
    expect(sequence.slice(0, firstSession).filter((entry) => entry.endsWith(':done'))).toEqual(producerDone);

    sequence.length = 0;
    globalThis.dispatchEvent(new Event('pagehide'));
    expect(sequence).toEqual([
      'session:hooks/use-revision-status.ts:pagehide:start',
      'session:hooks/use-revision-status.ts:pagehide:done',
    ]);
  });
});

describe('the quit guard — producers before the close cut (A0.2 item 9, D26)', () => {
  const projectId = 'proj_quit_aaaaaaaaaaaaaaa';
  let releaseServices: (() => void) | undefined;

  beforeEach(() => {
    /* The order rows above leave the page hidden. */
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    });
  });

  afterEach(() => {
    releaseServices?.();
    releaseServices = undefined;
    desktopQuit.ask = undefined;
    desktopQuit.answers.length = 0;
  });

  it("should settle every producer registration before the registry takes a session's close cut", async () => {
    const sequence: string[] = [];
    const registrations = heldRegistrations(sequence);
    const { registry: started } = startEnvironment({
      registry: true,
      desktopQuit: desktopQuit.seam,
      clock: new StepClock(),
    });
    if (started === undefined) {
      throw new Error('the environment host spawns a registry');
    }
    releaseServices = registerProjectSessionServices(projectId, {
      cancelRuns: async () => undefined,
      flushProducers: async () => {
        sequence.push('session-service:flushProducers');
      },
      flushSync: async () => {
        sequence.push('session-service:close-cut');
      },
      closeRuntime: async () => undefined,
    });
    started.send({ type: 'open', projectId });
    render(
      <UnloadProvider sequencer={environment.sequencer}>
        {registrations.map(({ site, stage, callback }) => (
          <Registration key={site} stage={stage} callback={callback} />
        ))}
        <SessionsProvider actor={started}>
          <span>app</span>
        </SessionsProvider>
      </UnloadProvider>,
    );

    await act(async () => {
      desktopQuit.ask?.('quit-attempt');
      await Promise.resolve();
    });
    const producers = registrations.filter(({ stage }) => stage === 'producer');
    for (const producer of producers) {
      expect(sequence).not.toContain('session-service:close-cut');
      expect(started.getSnapshot().matches('ready')).toBe(true);
      // oxlint-disable-next-line no-await-in-loop -- one release per step, in order, is the point
      await act(async () => {
        producer.release();
        await Promise.resolve();
      });
    }
    await waitFor(() => {
      expect(desktopQuit.answers).toEqual(['quit-attempt:false']);
    });

    const cut = sequence.indexOf('session-service:close-cut');
    expect(cut).toBeGreaterThan(-1);
    expect(
      sequence.slice(0, cut).filter((entry) => entry.startsWith('producer:') && entry.endsWith(':done')),
    ).toHaveLength(7);
    /* Quit runs the producer stage itself; the session stage is the registry's close, not `hidden`'s. */
    expect(sequence.filter((entry) => entry.startsWith('session:'))).toEqual([]);
    expect(started.getSnapshot().matches('quiesced')).toBe(true);
  });
});
