import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { projectManifestSchemaUrl } from '@taucad/types';
import type { ProjectManifest } from '@taucad/types';
import type { ProjectSessionCloseReason } from '#machines/project-session.machine.js';
import type { ProjectRouteState } from '#routes/w.$workspace.$project/project-route-state.js';
import type { PendingProjectRecoveryReason } from '#types/pending-project-operation.types.js';

const navigate = vi.fn();
vi.mock('react-router', () => ({ useNavigate: () => navigate }));

const send = vi.fn();
/* Deliberately not 30 minutes: the idle copy must state the registry's window, not a literal. */
const idleWindowMilliseconds = 45 * 60 * 1000;
vi.mock('#hooks/use-sessions.js', () => ({
  useSessions: () => ({ send, getSnapshot: () => ({ context: { idleWindowMilliseconds } }) }),
}));

const restoreProject = vi.fn(async () => true);
vi.mock('#hooks/use-project-manager.js', () => ({ useProjectManager: () => ({ restoreProject }) }));

const { ProjectRouteNotice, ProjectRouteRetryContext, describeProjectRouteNotice } =
  await import('#routes/w.$workspace.$project/project-route-notices.js');

const projectId = 'proj_0123456789ABCDEFGHIJK';
const project: ProjectManifest = {
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
  ['user', 'Its files and chats are kept. Reopen it to continue where you left off.'],
  ['quit', 'Its files and chats are kept. Reopen it to continue where you left off.'],
  ['budget', 'Closed to free memory for other projects. Its files and chats are kept.'],
];

const recoveryFailures: ReadonlyArray<readonly [PendingProjectRecoveryReason, string, string]> = [
  ['identity-conflict', 'Folder belongs to another project', 'Open project library'],
  ['local-state-error', 'Local state could not be restored', 'Try again'],
  ['filesystem-error', 'Setup did not finish', 'Try again'],
];

beforeEach(() => {
  navigate.mockClear();
  send.mockClear();
  restoreProject.mockClear();
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

  it('should label the loader while access resolves', () => {
    render(<ProjectRouteNotice state={{ kind: 'resolving' }} />);

    expect(screen.getByRole('status')).toHaveAccessibleName('Opening project');
  });

  it.each(closeReasons)('should describe a %s close', (reason, description) => {
    render(<ProjectRouteNotice state={{ kind: 'closed', projectId, project, reason }} />);

    expect(screen.getByText(description)).toBeInTheDocument();
  });

  it("should state the registry's real idle window in the idle close", () => {
    render(<ProjectRouteNotice state={{ kind: 'closed', projectId, project, reason: 'idle' }} />);

    expect(
      screen.getByText('Closed to save memory after 45 min idle. Its files and chats are kept.'),
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

  it('should reopen a closed project through the registry', async () => {
    render(<ProjectRouteNotice state={{ kind: 'closed', projectId, project, reason: 'user' }} />);

    await userEvent.click(screen.getByRole('button', { name: 'Reopen project' }));

    expect(send.mock.calls).toEqual([[{ type: 'open', projectId }], [{ type: 'touch', projectId }]]);
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

  it('should open Tau Desktop in a new tab for a native kernel', async () => {
    const open = vi.spyOn(globalThis, 'open').mockReturnValue(null);
    try {
      render(<ProjectRouteNotice state={{ kind: 'native-kernel', projectId, project, kernelName: 'PicoGK' }} />);

      await userEvent.click(screen.getByRole('button', { name: 'Get Tau Desktop' }));

      expect(open).toHaveBeenCalledWith('https://docs.tau.new', '_blank', 'noopener,noreferrer');
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
