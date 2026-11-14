import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { projectManifestSchemaUrl } from '@taucad/types';
import type { Project } from '@taucad/types';
import type { ProjectSessionCloseReason } from '#machines/project-session.machine.js';
import { ProjectRouteRetryContext } from '#routes/w.$workspace.$project/project-route-state.js';
import type { ProjectRouteState } from '#types/project-route-state.types.js';
import type { PendingProjectRecoveryReason } from '#types/pending-project-operation.types.js';
import { StepClock } from '@taucad/xstate-testing/clock';
import { startFocusHost } from '#runtime/app-runtime-focus.fixture.js';
import type { FocusHostFixture } from '#runtime/app-runtime-focus.fixture.js';
import { createSessionsActor, registerProjectSessionServices } from '#services/sessions-store.js';

const navigate = vi.fn();
vi.mock('react-router', () => ({ useNavigate: () => navigate }));

const send = vi.fn();
const focusSend = vi.fn();
/* Deliberately not 30 minutes: the idle copy must state the registry's window, not a literal. */
const idleWindowMilliseconds = 45 * 60 * 1000;
/* A row composes a real registry and focus here; the others read the doubles. */
const composed: { sessions: unknown; focus: unknown } = { sessions: undefined, focus: undefined };
vi.mock('#hooks/use-sessions.js', () => ({
  useSessions: () =>
    composed.sessions ?? { send, getSnapshot: () => ({ context: { idleWindowMilliseconds, status: {} } }) },
  useFocus: () => composed.focus ?? { focus: { send: focusSend }, bindings: {} },
}));

/* The registry's agent-host region is a real browser probe; unmocked it rejects in jsdom and every close fails. */
vi.mock('#services/project-agent-host-registration.js', () => ({
  registerProjectAgentHost: async () => ({ release: async () => undefined }),
}));

const restoreProject = vi.fn(async () => true);
vi.mock('#hooks/use-project-manager.js', () => ({ useProjectManager: () => ({ restoreProject }) }));

const { ProjectRouteNotice, describeProjectRouteNotice } =
  await import('#routes/w.$workspace.$project/project-route-notices.js');

const projectId = 'proj_0123456789ABCDEFGHIJK';
const project: Project = {
  $schema: projectManifestSchemaUrl,
  id: projectId,
  name: 'planetary-gear',
  description: '',
  tags: [],
  assets: { main: { entryPath: 'main.ts' } },
};

type NoticeExpectation = {
  readonly state: ProjectRouteState;
  /** Undefined where the state has no heading: the editor and the loader. */
  readonly title: string | undefined;
  readonly primaryAction: string | undefined;
  readonly live: 'status' | 'alert' | undefined;
};

/*
 * The blueprint's copy table, one row per state kind. `satisfies` over the
 * union's kinds is the exhaustive check: a new member fails typecheck here
 * until its row exists.
 */
const expectations = {
  resolving: { state: { kind: 'resolving' }, title: undefined, primaryAction: undefined, live: 'status' },
  editor: {
    state: { kind: 'editor', projectId, project },
    title: undefined,
    primaryAction: undefined,
    live: undefined,
  },
  closed: {
    state: { kind: 'closed', projectId, project, reason: 'user' },
    title: 'Project closed',
    primaryAction: 'Reopen project',
    live: undefined,
  },
  trashed: {
    state: { kind: 'trashed', projectId, project },
    title: 'Project is in Trash',
    primaryAction: 'Restore project',
    live: undefined,
  },
  missing: {
    state: { kind: 'missing', slugs: { workspaceSlug: 'rifont', projectSlug: 'planetary-gear' } },
    title: 'Project not found',
    primaryAction: 'Go to projects',
    live: undefined,
  },
  conflict: {
    state: { kind: 'conflict', projectId },
    title: 'Two folders claim this project',
    primaryAction: 'Open project library',
    live: undefined,
  },
  unavailable: {
    state: { kind: 'unavailable', projectId },
    title: 'Storage unavailable',
    primaryAction: 'Try again',
    live: 'alert',
  },
  recovering: {
    state: { kind: 'recovering', projectId },
    title: 'Finishing setup',
    primaryAction: undefined,
    live: 'status',
  },
  'recovery-failed': {
    state: { kind: 'recovery-failed', projectId, reason: 'workspace-unavailable' },
    title: 'Setup paused',
    primaryAction: 'Try again',
    live: 'alert',
  },
  'native-kernel': {
    state: { kind: 'native-kernel', projectId, project, kernelName: 'PicoGK' },
    title: 'PicoGK needs Tau Desktop',
    primaryAction: 'Get Tau Desktop',
    live: undefined,
  },
  'access-error': {
    state: { kind: 'access-error', projectId, error: new Error('worker did not respond within 8000 ms') },
    title: "Couldn't check this project",
    primaryAction: 'Try again',
    live: 'alert',
  },
  'flush-error': {
    state: { kind: 'flush-error', error: new Error('flush rejected') },
    title: "Couldn't save the project view",
    primaryAction: 'Try again',
    live: 'alert',
  },
} satisfies Record<ProjectRouteState['kind'], NoticeExpectation>;

const rows = Object.entries(expectations) as ReadonlyArray<readonly [string, NoticeExpectation]>;

const closeReasons: ReadonlyArray<readonly [ProjectSessionCloseReason, string]> = [
  ['user', 'Its files and chats are saved. Reopen it to continue where you left off.'],
  ['quit', 'Its files and chats are saved. Reopen it to continue where you left off.'],
  ['budget', 'Closed to free memory for other projects. Its files and chats are saved.'],
  ['memory', 'Closed to save memory on this device. Its files and chats are saved.'],
];

const recoveryFailures: ReadonlyArray<readonly [PendingProjectRecoveryReason, string, string]> = [
  ['identity-conflict', 'Folder belongs to another project', 'Open project library'],
  ['local-state-error', 'Local state could not be restored', 'Try again'],
  ['filesystem-error', 'Setup did not finish', 'Try again'],
];

beforeEach(() => {
  /* A non-prerelease desktop release exists, so the native-kernel notice offers it (Q56); the hidden case is its own test. */
  vi.stubEnv('TAU_DESKTOP_RELEASED', 'true');
  navigate.mockClear();
  send.mockClear();
  focusSend.mockClear();
  restoreProject.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('ProjectRouteNotice', () => {
  // ── The copy table ─────────────────────────────────────────────────────────

  it.each(rows)('should render the %s row as the blueprint states it', (_kind, expectation) => {
    const { container } = render(<ProjectRouteNotice state={expectation.state} />);

    if (expectation.title === undefined) {
      expect(screen.queryByRole('heading')).toBeNull();
    } else {
      expect(screen.getByRole('heading', { level: 3, name: expectation.title })).toBeInTheDocument();
    }

    if (expectation.primaryAction === undefined) {
      expect(screen.queryByRole('button')).toBeNull();
    } else {
      /* The primary is the first button in the action row, as the table orders it. */
      expect(screen.getAllByRole('button')[0]).toHaveAccessibleName(expectation.primaryAction);
    }

    if (expectation.live === undefined) {
      expect(screen.queryByRole('status')).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
      /* The editor is not a notice at all. */
      expect(container.firstChild === null).toBe(expectation.state.kind === 'editor');
    } else {
      const region = screen.getByRole(expectation.live);
      if (expectation.live === 'status') {
        expect(region).toHaveAttribute('aria-busy', 'true');
      } else {
        expect(region).not.toHaveAttribute('aria-busy');
      }
    }
  });

  it('should return no notice for the editor state', () => {
    expect(describeProjectRouteNotice({ kind: 'editor', projectId, project })).toBeUndefined();
  });

  /* Nothing to say yet is the workspace arriving: the same skeleton the session gate shows next. */
  it('should stand the workspace in while access resolves', () => {
    render(<ProjectRouteNotice state={{ kind: 'resolving' }} />);

    const skeleton = screen.getByRole('status');
    expect(skeleton).toHaveAccessibleName('Opening project');
    expect(skeleton).toHaveAttribute('data-testid', 'workspace-skeleton');
    expect(screen.queryByRole('button', { name: 'Toggle Sidebar' })).not.toBeInTheDocument();
  });

  it.each(closeReasons)('should describe a %s close', (reason, description) => {
    render(<ProjectRouteNotice state={{ kind: 'closed', projectId, project, reason }} />);

    expect(screen.getByText(description)).toBeInTheDocument();
  });

  it("should state the registry's real idle window in the idle close", () => {
    render(<ProjectRouteNotice state={{ kind: 'closed', projectId, project, reason: 'idle' }} />);

    expect(
      screen.getByText('Closed to save memory after 45 min idle. Its files and chats are saved.'),
    ).toBeInTheDocument();
  });

  it.each(recoveryFailures)('should describe the %s recovery failure', (reason, title, primaryAction) => {
    render(<ProjectRouteNotice state={{ kind: 'recovery-failed', projectId, reason }} />);

    expect(screen.getByRole('heading', { level: 3, name: title })).toBeInTheDocument();
    expect(screen.getAllByRole('button')[0]).toHaveAccessibleName(primaryAction);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('should name the project in the pane header, and the address when it is missing', () => {
    const { rerender } = render(<ProjectRouteNotice state={{ kind: 'closed', projectId, project, reason: 'user' }} />);
    expect(screen.getByText('planetary-gear')).toBeInTheDocument();

    rerender(
      <ProjectRouteNotice
        state={{ kind: 'missing', slugs: { workspaceSlug: 'rifont', projectSlug: 'planetary-gear' } }}
      />,
    );
    expect(screen.getByText('rifont/planetary-gear')).toBeInTheDocument();
  });

  // ── Actions ────────────────────────────────────────────────────────────────

  it('should reopen a closed project through focus, and send the registry nothing itself', async () => {
    render(<ProjectRouteNotice state={{ kind: 'closed', projectId, project, reason: 'user' }} />);

    await userEvent.click(screen.getByRole('button', { name: 'Reopen project' }));

    expect(focusSend.mock.calls).toEqual([[{ type: 'openRequested', projectId }]]);
    expect(send).not.toHaveBeenCalled();
  });

  it('should restore a trashed project and offer its Trash view', async () => {
    render(<ProjectRouteNotice state={{ kind: 'trashed', projectId, project }} />);

    /* Finding 2: deleting the open project closes its session too, so both
     * facts are true at once. Reopen must not be reachable here, or it would
     * re-mount a project that is in the Trash. */
    expect(screen.queryByRole('button', { name: 'Reopen project' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Restore project' }));
    expect(restoreProject).toHaveBeenCalledWith(projectId);

    await userEvent.click(screen.getByRole('button', { name: 'Open Trash' }));
    expect(navigate).toHaveBeenCalledWith('/projects?trash=1');
  });

  it('should run the retry the gate supplies', async () => {
    const retry = vi.fn();
    render(
      <ProjectRouteRetryContext.Provider value={retry}>
        <ProjectRouteNotice state={{ kind: 'unavailable', projectId }} />
      </ProjectRouteRetryContext.Provider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('should navigate back and to the project library', async () => {
    render(<ProjectRouteNotice state={{ kind: 'missing', slugs: { workspaceSlug: 'rifont', projectSlug: 'gear' } }} />);

    await userEvent.click(screen.getByRole('button', { name: 'Go to projects' }));
    expect(navigate).toHaveBeenCalledWith('/projects');

    await userEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(navigate).toHaveBeenCalledWith(-1);
  });

  it('should offer only the projects for a native kernel while no non-prerelease desktop exists (DSK-7)', () => {
    vi.stubEnv('TAU_DESKTOP_RELEASED', 'false');
    render(<ProjectRouteNotice state={{ kind: 'native-kernel', projectId, project, kernelName: 'PicoGK' }} />);

    expect(screen.queryByRole('button', { name: 'Get Tau Desktop' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to projects' })).toBeInTheDocument();
  });

  it('should open Tau Desktop in a new tab for a native kernel', async () => {
    const open = vi.spyOn(globalThis, 'open').mockReturnValue(null);
    try {
      render(<ProjectRouteNotice state={{ kind: 'native-kernel', projectId, project, kernelName: 'PicoGK' }} />);

      await userEvent.click(screen.getByRole('button', { name: 'Get Tau Desktop' }));

      expect(open).toHaveBeenCalledWith(
        'https://github.com/taucad/tau/releases/latest',
        '_blank',
        'noopener,noreferrer',
      );
    } finally {
      open.mockRestore();
    }
  });

  it('should disclose the access error message', async () => {
    const error = new Error('worker did not respond within 8000 ms');
    render(<ProjectRouteNotice state={{ kind: 'access-error', projectId, error }} />);

    const details = screen.getByRole('button', { name: 'Details' });
    expect(details).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(details);

    expect(screen.getByText(error.message)).toBeVisible();
  });

  // ── Accessibility ──────────────────────────────────────────────────────────

  it('should have no automated accessibility violations', async () => {
    const { baseElement: container } = render(
      <main>
        <ProjectRouteNotice state={{ kind: 'unavailable', projectId }} />
      </main>,
    );

    const results = await axe.run(container);

    expect(results.violations).toEqual([]);
  });
});

/*
 * A0.2 (row S39): the notice's reopen is the other sender of `open`. Since A5b it asks focus (`openRequested`), which
 * re-sends the request it kept (I4, pinned over the route gate harness in `project-route.test.tsx`). These rows run it
 * over a real registry and focus.
 */
describe('ProjectRouteNotice — the reopen and the reopened session (A0.2 S39)', () => {
  const nativeProject: Project = { ...project, assets: { main: { entryPath: 'main.py' } } };
  let stop: (() => void) | undefined;
  /** Whether the session's runtime closes; a refusal leaves the session `failed`, holding its slot. */
  let runtimeCloses = true;

  /**
   * A real registry and focus, and the route's visit that opened the project: focus knows its slugs only from a route
   * (a person's open names a project the route showed). Resolves once the visit's session is up.
   */
  const compose = async (
    opened: Project = project,
  ): Promise<Readonly<{ registry: ReturnType<typeof createSessionsActor>; host: FocusHostFixture }>> => {
    const registry = createSessionsActor({ clock: new StepClock() }).start();
    const host = startFocusHost({
      sessions: registry,
      library: {
        routeAccess: async () => ({ status: 'ready', project: opened }),
        epoch: () => 0,
        onEpochChanged: () => () => undefined,
      },
      loadModule: async () => undefined,
    });
    composed.sessions = registry;
    composed.focus = host;
    /* The services a mounted session subtree registers; the close reads them. */
    const releaseServices = registerProjectSessionServices(projectId, {
      cancelRuns: async () => undefined,
      flushProducers: async () => undefined,
      flushSync: async () => undefined,
      closeRuntime: async () => {
        if (!runtimeCloses) {
          throw new Error('runtime would not close');
        }
      },
    });
    stop = () => {
      host.stop();
      registry.stop();
      releaseServices();
    };
    host.focus.send({
      type: 'routeRequested',
      requestId: 'route:1',
      slugs: { workspaceSlug: 'rifont', projectSlug: 'planetary-gear' },
      projectId,
    });
    await vi.waitFor(() => {
      expect(registry.getSnapshot().context.refs[projectId]).toBeDefined();
    });
    return { registry, host };
  };

  /** Close the project's session and wait for its slot to settle in `state`, or to be dropped. */
  const closeTo = async (
    registry: ReturnType<typeof createSessionsActor>,
    state: 'failed' | undefined,
  ): Promise<void> => {
    const session = registry.getSnapshot().context.refs[projectId];
    registry.send({ type: 'close', projectId, reason: 'user' });
    session?.send({ type: 'confirmClose' });
    await vi.waitFor(() => {
      expect(registry.getSnapshot().context.status[projectId]?.state).toBe(state);
    });
  };

  afterEach(() => {
    stop?.();
    stop = undefined;
    runtimeCloses = true;
    composed.sessions = undefined;
    composed.focus = undefined;
  });

  it('should spawn a session for the project it reopens and touch it', async () => {
    const { registry } = await compose(nativeProject);
    await closeTo(registry, undefined);
    render(<ProjectRouteNotice state={{ kind: 'closed', projectId, project: nativeProject, reason: 'user' }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Reopen project' }));

    await vi.waitFor(() => {
      expect(registry.getSnapshot().context.refs[projectId]?.getSnapshot().context.projectId).toBe(projectId);
    });
    expect(registry.getSnapshot().context.touchOrder[projectId]).toBeGreaterThan(0);
  });

  /*
   * A named behaviour change (programme control's ruling): a session whose close failed holds its slot, and an open of
   * it was only a touch, so Reopen left the failed child in place. The reopen now closes it and opens it again.
   */
  it('should close a failed session and open the project again as one reopen', async () => {
    const { registry } = await compose();
    runtimeCloses = false;
    const failed = registry.getSnapshot().context.refs[projectId];
    await closeTo(registry, 'failed');
    runtimeCloses = true;

    render(<ProjectRouteNotice state={{ kind: 'closed', projectId, project, reason: 'user' }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Reopen project' }));

    await vi.waitFor(() => {
      const reopened = registry.getSnapshot().context.refs[projectId];
      expect(reopened).toBeDefined();
      expect(reopened).not.toBe(failed);
    });
    expect(registry.getSnapshot().context.status[projectId]?.state).not.toBe('failed');
  });
});
