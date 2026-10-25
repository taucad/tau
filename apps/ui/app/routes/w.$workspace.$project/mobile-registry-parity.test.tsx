// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PartialDeep } from 'type-fest';
import type * as ReactRouter from 'react-router';
import { KeyboardProvider } from '@taucad/ui/components/keyboard';
import { defaultPanelState, mobilePanelIds } from '#constants/editor.constants.js';
import type { PanelState } from '#types/editor.types.js';
import { mergePanelState } from '#utils/panel-state.utils.js';
import { isSurfaceShipped } from '#workbench-records/surface-availability.js';

/*
 * I1 capability parity, driven by the real desktop registry: every Workbench surface the desktop launcher can open has
 * a phone surface, `openPanel` opens it on a phone, and a person can reach it by touch from the nav or All. A surface
 * added to the registry without a phone home fails here. It runs as the desktop app, the one build that ships every
 * finished surface; Jobs is unfinished and shipped nowhere.
 */

vi.stubEnv('TAU_TARGET', 'desktop');

const flags = vi.hoisted(() => ({ machines: true, tauDebug: true }));
const route = vi.hoisted(() => ({ key: 'initial', search: '', state: undefined }));

type Snapshot = {
  readonly context: {
    readonly panelState: PanelState;
    readonly openFiles: readonly string[];
    readonly activePaneId: undefined;
  };
  readonly matches: (state: string) => boolean;
};
const editor = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return { listeners, snapshot: undefined as unknown as Snapshot };
});
const editorRef = {
  send(event: { readonly type: string; readonly panelState?: PartialDeep<PanelState> }): void {
    if (event.type !== 'setPanelState') {
      return;
    }
    editor.snapshot = {
      ...editor.snapshot,
      context: {
        ...editor.snapshot.context,
        panelState: mergePanelState(editor.snapshot.context.panelState, event.panelState),
      },
    };
    for (const listener of editor.listeners) {
      listener();
    }
  },
  getSnapshot: (): Snapshot => editor.snapshot,
  subscribe(observer: (() => void) | { readonly next: () => void }): { unsubscribe: () => void } {
    const listener =
      typeof observer === 'function'
        ? observer
        : () => {
            observer.next();
          };
    editor.listeners.add(listener);
    return {
      unsubscribe() {
        editor.listeners.delete(listener);
      },
    };
  },
  on: () => ({ unsubscribe: () => undefined }),
};

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ editorRef, mainEntryPath: 'main.ts', projectId: 'project-1' }),
}));
vi.mock('@taucad/ui/hooks/use-mobile', () => ({ useIsMobile: () => true }));
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  useLocation: () => route,
}));
vi.mock('#flags/use-feature.js', () => ({
  useFeature: (flag: 'machines' | 'tauDebug') => flags[flag],
}));

const { workbenchSurfaces } = await import('#routes/w.$workspace.$project/chat-workbench-dockview.js');
const { ProjectWorkspaceProvider, mobilePanelByWorkbenchPanel, useProjectWorkspace } =
  await import('#routes/w.$workspace.$project/project-workspace-context.js');
const { ChatInterfaceNav, surfaceTitle } = await import('#routes/w.$workspace.$project/chat-interface-nav.js');
const { useChatInterfaceState } = await import('#routes/w.$workspace.$project/use-chat-interface-state.js');

/** The phone workbench's routing as the shell wires it: the provider's `openPanel`, the persisted surface, the nav. */
function MobileWorkbench(): React.JSX.Element {
  const { openPanel } = useProjectWorkspace();
  const { activeTab, handleTabChange } = useChatInterfaceState();
  return (
    <>
      <output aria-label='Open surface'>{surfaceTitle(activeTab)}</output>
      {workbenchSurfaces.map((surface) => (
        <button
          key={surface.id}
          type='button'
          onClick={() => {
            openPanel(surface.id);
          }}
        >
          {`Request ${surface.label}`}
        </button>
      ))}
      <ChatInterfaceNav activeTab={activeTab} onTabChange={handleTabChange} />
    </>
  );
}

const renderWorkbench = (): void => {
  render(
    <KeyboardProvider>
      <ProjectWorkspaceProvider>
        <MobileWorkbench />
      </ProjectWorkspaceProvider>
    </KeyboardProvider>,
  );
};

const openSurface = (): HTMLElement => screen.getByRole('status', { name: 'Open surface' });
const navigation = (): HTMLElement => screen.getByRole('navigation', { name: 'Workbench' });

/** The surfaces the desktop app ships, read once the build target is set. */
const shippedSurfaces = (): typeof workbenchSurfaces => workbenchSurfaces.filter(({ id }) => isSurfaceShipped(id));

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  vi.stubEnv('TAU_TARGET', 'desktop');
  flags.machines = true;
  flags.tauDebug = true;
  editor.listeners.clear();
  editor.snapshot = {
    context: {
      panelState: structuredClone(defaultPanelState) as unknown as PanelState,
      openFiles: [],
      activePaneId: undefined,
    },
    matches: (state) => state === 'ready',
  };
});

// The first render loads the real Workbench registry and its panes.
describe('mobile registry parity (I1)', { timeout: 30_000 }, () => {
  it('should give every desktop Workbench surface exactly one phone surface', () => {
    expect(Object.keys(mobilePanelByWorkbenchPanel).toSorted()).toEqual(
      workbenchSurfaces.map((surface) => surface.id).toSorted(),
    );
    for (const surface of Object.values(mobilePanelByWorkbenchPanel)) {
      expect(mobilePanelIds).toContain(surface);
    }
  });

  it.each(shippedSurfaces().map((surface) => [surface.label, surface] as const))(
    'should open %s on a phone through openPanel, under its desktop title',
    (label, surface) => {
      renderWorkbench();
      expect(openSurface()).toHaveTextContent(/^Model$/u);

      fireEvent.click(screen.getByRole('button', { name: `Request ${label}` }));

      // Same words as the desktop launcher (I6), and never the stage: openPanel did something.
      expect(openSurface()).toHaveTextContent(new RegExp(`^${label}$`, 'u'));
      expect(editor.snapshot.context.panelState.mobileActiveTab).toBe(mobilePanelByWorkbenchPanel[surface.id]);
    },
  );

  it.each(shippedSurfaces().map((surface) => [surface.label] as const))(
    'should reach %s by touch from the nav or All',
    async (label) => {
      renderWorkbench();
      const primary = within(navigation()).queryByRole('button', { name: label });
      if (primary) {
        fireEvent.click(primary);
      } else {
        fireEvent.click(within(navigation()).getByRole('button', { name: 'All' }));
        fireEvent.click(
          within(screen.getByRole('dialog', { name: 'All surfaces' })).getByRole('button', { name: label }),
        );
        await waitFor(() => {
          expect(screen.queryByRole('dialog', { name: 'All surfaces' })).not.toBeInTheDocument();
        });
      }
      expect(openSurface()).toHaveTextContent(new RegExp(`^${label}$`, 'u'));
    },
  );

  it('should reach every phone surface, the editor included, from the nav or All', () => {
    renderWorkbench();
    // All is modal: read the nav before it hides the page behind it.
    const destinations = within(navigation())
      .getAllByRole('button')
      .map((button) => button.textContent);
    fireEvent.click(within(navigation()).getByRole('button', { name: 'All' }));
    const all = screen.getByRole('dialog', { name: 'All surfaces' });
    const reachable = new Set([
      ...destinations,
      ...within(all)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ]);
    for (const id of mobilePanelIds.filter((surface) => isSurfaceShipped(surface))) {
      expect(reachable, id).toContain(surfaceTitle(id));
    }
  });

  it.each([
    ['desktop', ['Jobs']],
    ['web', ['Browser', 'Jobs', 'Terminal']],
  ] as const)('should neither list nor open an unshipped surface (%s)', (buildTarget, unshipped) => {
    vi.stubEnv('TAU_TARGET', buildTarget);
    renderWorkbench();
    fireEvent.click(within(navigation()).getByRole('button', { name: 'All' }));
    const all = screen.getByRole('dialog', { name: 'All surfaces' });
    for (const label of unshipped) {
      expect(within(all).queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
    fireEvent.keyDown(all, { key: 'Escape' });

    for (const label of unshipped) {
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: `Request ${label}` }));
      });
      expect(openSurface()).toHaveTextContent(/^Model$/u);
    }
  });

  it('should list gated surfaces only where the desktop launcher does, and still open them by request', () => {
    flags.machines = false;
    flags.tauDebug = false;
    renderWorkbench();
    fireEvent.click(within(navigation()).getByRole('button', { name: 'All' }));
    const all = screen.getByRole('dialog', { name: 'All surfaces' });
    for (const gated of ['Print', 'Telemetry', 'Console']) {
      expect(within(all).queryByRole('button', { name: gated })).not.toBeInTheDocument();
    }
    // Terminal is gated by the desktop editor, not by Tau debug, so Diagnostics keeps it alone.
    expect(within(all).getByRole('heading', { name: 'Diagnostics' })).toBeInTheDocument();
    expect(within(all).getByRole('button', { name: 'Terminal' })).toBeInTheDocument();
    fireEvent.keyDown(all, { key: 'Escape' });

    // An app action that asks for Print still lands on Print, whose body explains the refusal.
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Request Print' }));
    });
    expect(openSurface()).toHaveTextContent(/^Print$/u);
  });
});
