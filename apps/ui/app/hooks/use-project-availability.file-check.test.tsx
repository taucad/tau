// @vitest-environment jsdom
/**
 * A14: the "Preparing model" view's "Try again" reads `slow` from the session (plan § 4 A14; I15). A real registry on a
 * step clock, whose session's `revisions` child is a stand-in the row drives, under `SessionsProvider`: the row pins
 * the selector from the session's `availability` to the view, which the view's own rows mock.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { createActor } from 'xstate';
import type { ReactNode } from 'react';
import { StepClock } from '@taucad/xstate-testing/clock';
import { SessionsProvider } from '#hooks/use-sessions.js';
import { useFileCheckSlow } from '#hooks/use-project-availability.js';
import type { ProjectSessionMachineEvent } from '#machines/project-session.machine.js';
import { modelCheckPatienceMilliseconds } from '#machines/session-file-check.machine.js';
import { openSessionFileManagerStandIn } from '#runtime/session-file-manager.fixture.js';
import type { SessionRevisionsCallback, SessionRevisionsPorts } from '#runtime/session-revisions.js';
import { createSessionsRegistryLogic } from '#services/sessions-store.js';
import type { SessionWiring } from '#services/sessions-store.js';

const projectId = 'p1';

vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId }) }));
vi.mock('#services/project-agent-host-registration.js', () => ({
  registerProjectAgentHost: async () => ({ release: async () => undefined }),
}));

const flushTasks = async (): Promise<void> => {
  for (let turn = 0; turn < 5; turn += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each turn lets one more task land, in order
    await new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, 0);
    });
  }
};

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

/** A registry whose session's `revisions` child reports only when the row says so. */
const compose = () => {
  const children: Array<(event: ProjectSessionMachineEvent) => void> = [];
  const callback: SessionRevisionsCallback = ({ sendBack }) => {
    children.push(sendBack as (event: ProjectSessionMachineEvent) => void);
    return () => undefined;
  };
  const wiring: SessionWiring = {
    loadRevisions: async () => ({
      sessionRevisionsCallback: () => callback,
      createSessionRevisionsPorts: (ports: unknown) => ports as SessionRevisionsPorts,
    }),
    loadHostConnector: async () => ({ hostConnectorCallback: () => () => () => undefined }),
    registerCloseCut: () => () => undefined,
    registerProducer: () => () => undefined,
    focusedProject: { get: () => undefined, subscribe: () => () => undefined },
    documentVisible: { get: () => true, subscribe: () => () => undefined },
    chatSessions: {
      setRevisionFacts: () => undefined,
      publishProjectHostConnector: () => () => undefined,
    } as unknown as SessionWiring['chatSessions'],
    choices: () => {
      throw new Error('no chat attaches in this row');
    },
    rootSync: () => ({ syncProjectRoots: async () => undefined, close: () => undefined }),
  };
  const clock = new StepClock();
  const registry = createActor(
    createSessionsRegistryLogic({
      sharedWorker: () => undefined,
      openFileManager: (id) => openSessionFileManagerStandIn(id),
      wiring,
    }),
    { input: { budget: 8 }, clock },
  ).start();
  cleanups.push(() => {
    registry.stop();
  });
  return {
    registry,
    clock,
    report: (settled: boolean) => {
      children.at(-1)?.({ type: 'fileCheckChanged', settled, judged: true });
    },
  };
};

function SlowProbe(): ReactNode {
  return <output aria-label='slow'>{String(useFileCheckSlow())}</output>;
}

describe('the "Preparing model" view reads slow from the session (A14)', () => {
  it('should be slow once the session reports its check slow, and not once the check settles', async () => {
    const { registry, clock, report } = compose();
    registry.send({ type: 'open', projectId });
    await flushTasks();
    render(
      <SessionsProvider actor={registry}>
        <SlowProbe />
      </SessionsProvider>,
    );

    expect(registry.getSnapshot().context.status[projectId]?.availability).toBe('pending');
    expect(screen.getByRole('status', { name: 'slow' })).toHaveTextContent('false');

    act(() => {
      clock.advance(modelCheckPatienceMilliseconds);
    });

    expect(screen.getByRole('status', { name: 'slow' })).toHaveTextContent('true');

    act(() => {
      report(true);
    });

    expect(screen.getByRole('status', { name: 'slow' })).toHaveTextContent('false');
  });
});
