// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { ChatInterfaceMobile } from '#routes/w.$workspace.$project/chat-interface-mobile.js';
import { TerminalCloseContext } from '#components/terminal/terminal-close.js';
import { mobileDrawerOpenSnapPoint, mobileDrawerPeekSnapPoint } from '#constants/editor.constants.js';
import type { WorkbenchPanelId } from '#routes/w.$workspace.$project/project-workspace-context.js';
import { mobilePanelByWorkbenchPanel } from '#routes/w.$workspace.$project/project-workspace-context.js';

const state = vi.hoisted(() => ({
  drawerOpen: false,
  activeTab: 'viewer' as string,
  activeSnapPoint: 0.5 as number | string,
  listeners: new Set<() => void>(),
  flags: { machines: true, tauDebug: true },
  row: { attention: 0, conflicted: false, settings: 0, failed: 0 },
  // Vaul resets its snap point 500ms after a close; a previous test's reset must not land in this one.
  generation: 0,
}));
const notify = (): void => {
  for (const listener of state.listeners) {
    listener();
  }
};
const setDrawerOpen = (open: boolean): void => {
  act(() => {
    state.drawerOpen = open;
    notify();
  });
};
const selectSurface = (id: string): void => {
  state.activeTab = id;
  state.drawerOpen = id !== 'viewer';
  notify();
};

vi.mock('#routes/w.$workspace.$project/use-chat-interface-state.js', () => ({
  useChatInterfaceState: () => {
    const snapshot = useSyncExternalStore(
      (listener) => {
        state.listeners.add(listener);
        return () => state.listeners.delete(listener);
      },
      () => `${state.activeTab}|${String(state.drawerOpen)}|${String(state.activeSnapPoint)}`,
    );
    const [activeTab, drawerOpen] = snapshot.split('|');
    const { generation } = state;
    return {
      activeTab,
      handleTabChange: selectSurface,
      drawerOpen: drawerOpen === 'true',
      handleDrawerChange: (open: boolean) => {
        if (!open) {
          selectSurface('viewer');
        }
      },
      snapPoints: [mobileDrawerPeekSnapPoint, 0.5, 1],
      activeSnapPoint: state.activeSnapPoint,
      handleSnapChange: (point: number | string) => {
        if (generation !== state.generation) {
          return;
        }
        state.activeSnapPoint = point;
        notify();
      },
    };
  },
}));
// The shell only mounts on a phone, where a pane's Close is the sheet's own close.
vi.mock('@taucad/ui/hooks/use-mobile', () => ({ useIsMobile: () => true }));
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'project-1', viewRecords: new Map() }) }));
vi.mock('#hooks/use-sidebar-status.js', () => ({ useProjectSidebarRow: () => state.row }));
vi.mock('#flags/use-feature.js', () => ({
  useFeature: (flag: 'machines' | 'tauDebug') => state.flags[flag],
}));
vi.mock('#routes/w.$workspace.$project/focused-chat-gate.js', () => ({
  ChatHistoryGate: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
  ChatInterfaceSessionGate: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
}));
vi.mock('#routes/w.$workspace.$project/chat-viewer-dockview.js', () => ({
  ViewerDockview: () => <button type='button'>Viewer controls</button>,
}));
vi.mock('#routes/w.$workspace.$project/chat-history.js', () => ({
  ChatHistory: () => <textarea aria-label='Message' />,
}));
vi.mock('#routes/w.$workspace.$project/chat-file-tree.js', () => ({ ChatFileTree: () => <p>File tree</p> }));
vi.mock('#routes/w.$workspace.$project/chat-parameters.js', () => ({ ChatParameters: () => <p>Parameter form</p> }));
vi.mock('#routes/w.$workspace.$project/chat-editor-layout.js', () => ({ ChatEditorLayout: () => null }));
vi.mock('#routes/w.$workspace.$project/chat-details.js', () => ({ ChatDetails: () => <p>Project details</p> }));
vi.mock('#routes/w.$workspace.$project/chat-converter.js', () => ({ ChatConverter: () => <p>Export formats</p> }));
vi.mock('#routes/w.$workspace.$project/project-share-action.js', () => ({
  ProjectShareWorkbenchPanel: () => (
    <section aria-labelledby='share-frame-title'>
      <h2 id='share-frame-title' data-slot='share-pane-title'>
        Share project
      </h2>
      <p>Share settings</p>
    </section>
  ),
}));
vi.mock('#routes/w.$workspace.$project/chat-revisions.js', () => ({ ChatRevisions: () => <p>Revision list</p> }));
vi.mock('#routes/w.$workspace.$project/chat-explorer.js', () => ({ ModelPanelBody: () => <p>Component tree</p> }));
vi.mock('#routes/w.$workspace.$project/chat-kinematics.js', () => ({ KinematicsPanelBody: () => <p>Joint list</p> }));
vi.mock('#routes/w.$workspace.$project/chat-print.js', () => ({ PrintPanelBody: () => <p>Machine list</p> }));
vi.mock('#components/browser/browser-pane.js', () => ({ BrowserPane: () => <p>Browse in Tau desktop</p> }));
vi.mock('#routes/w.$workspace.$project/chat-agents.js', () => ({ AgentsPanelBody: () => <p>Agent list</p> }));
vi.mock('#routes/w.$workspace.$project/chat-jobs.js', () => ({ JobsPanelBody: () => <p>Job list</p> }));
vi.mock('#routes/w.$workspace.$project/chat-kernel.js', () => ({ TelemetryPanelContent: () => <p>Kernel spans</p> }));
vi.mock('#routes/w.$workspace.$project/chat-console.js', () => ({ ChatConsole: () => <p>Console log</p> }));
const terminal = vi.hoisted(() => ({ mounted: vi.fn(), closed: vi.fn(), running: false }));
/* Stands in for the pane's side of the close host: a running session holds the close and offers the choices. */
vi.mock('#components/terminal/terminal-pane.js', () => ({
  ProjectTerminalPane: () => {
    const [input, setInput] = useState('');
    const [isAsking, setIsAsking] = useState(false);
    const host = useContext(TerminalCloseContext);
    useEffect(() => {
      terminal.mounted();
      return terminal.closed;
    }, []);
    useEffect(
      () =>
        host?.register(() => {
          if (!terminal.running) {
            return false;
          }
          setIsAsking(true);
          return true;
        }),
      [host],
    );
    return (
      <>
        <label>
          Shell session
          <input
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
            }}
          />
        </label>
        {isAsking ? (
          <div role='alertdialog' aria-label='Close the Terminal?'>
            <button
              type='button'
              onClick={() => {
                setIsAsking(false);
                host?.hide();
              }}
            >
              Hide
            </button>
            <button
              type='button'
              onClick={() => {
                setIsAsking(false);
                host?.close();
              }}
            >
              Close and stop
            </button>
          </div>
        ) : null}
      </>
    );
  },
}));
vi.mock('#routes/w.$workspace.$project/project-unavailable-overlay.js', () => ({
  ProjectUnavailableOverlay: () => null,
}));
vi.mock('#routes/w.$workspace.$project/project-manifest-issue-banner.js', () => ({
  ProjectManifestIssueBanner: () => null,
}));
vi.mock('#routes/w.$workspace.$project/workspace-skeleton.js', () => ({ WorkspaceSkeleton: () => null }));
/* The project top bar (W2) has its own suite; this shell suite only needs its slot. */
vi.mock('#routes/w.$workspace.$project/mobile-project-top-bar.js', () => ({ MobileProjectTopBar: () => null }));

const renderShell = (): ReturnType<typeof render> =>
  render(
    <TooltipProvider>
      <ChatInterfaceMobile />
    </TooltipProvider>,
  );

/** The length, in px, of a CSS length expression, with each `var()` read from the arbitrary properties in `classes`. */
function resolveLength(
  expression: string,
  classes: string,
  environment: { readonly viewportHeight: number; readonly safeAreaBottom: number },
): number {
  const variables = new Map<string, string>([['--spacing', '4px']]);
  for (const [, name, value] of classes.matchAll(/\[(--[\w-]+):([^\s\]]+(?:\([^\]]*\))?)\]/gu)) {
    variables.set(name!, value!.replaceAll('_', ' '));
  }
  let source = expression;
  for (let depth = 0; /var\(|env\(/u.test(source); depth++) {
    if (depth > 10) {
      throw new Error(`Unresolved length: ${source}`);
    }
    source = source
      .replaceAll(/var\((--[\w-]+)\)/gu, (_, name: string) => {
        const value = variables.get(name);
        if (value === undefined) {
          throw new Error(`Undefined ${name} in ${expression}`);
        }
        return `(${value})`;
      })
      .replaceAll('env(safe-area-inset-bottom)', `(${environment.safeAreaBottom})`);
  }
  source = source
    .replaceAll('calc(', '(')
    .replaceAll(/([\d.]+)dvh/gu, (_, amount: string) => `(${(Number(amount) * environment.viewportHeight) / 100})`)
    .replaceAll('px', '');
  return evaluate(source);
}

/** Evaluates + - * / and parentheses over numbers. */
function evaluate(source: string): number {
  const tokens = source.match(/[\d.]+|[()+\-*/]/gu) ?? [];
  let index = 0;
  const factor = (): number => {
    const token = tokens[index++];
    if (token === '(') {
      const value = sum();
      index++;
      return value;
    }
    if (token === '-') {
      return -factor();
    }
    return Number(token);
  };
  const product = (): number => {
    let value = factor();
    while (tokens[index] === '*' || tokens[index] === '/') {
      value = tokens[index++] === '*' ? value * factor() : value / factor();
    }
    return value;
  };
  const sum = (): number => {
    let value = product();
    while (tokens[index] === '+' || tokens[index] === '-') {
      value = tokens[index++] === '+' ? value + product() : value - product();
    }
    return value;
  };
  return sum();
}

afterEach(() => {
  state.drawerOpen = false;
  state.activeTab = 'viewer';
  state.activeSnapPoint = 0.5;
  state.flags = { machines: true, tauDebug: true };
  state.row = { attention: 0, conflicted: false, settings: 0, failed: 0 };
  state.listeners.clear();
  state.generation += 1;
  vi.unstubAllGlobals();
  terminal.mounted.mockClear();
  terminal.closed.mockClear();
  terminal.running = false;
});

/* Vaul returns a closed drawer to its first snap point on a 500ms timer that outlives the test that closed it. Let the
 * last of those timers fire while the DOM environment is still up, or React's state update throws on a torn-down window. */
afterAll(async () => {
  await new Promise((resolve) => {
    setTimeout(resolve, 600);
  });
});

describe('ChatInterfaceMobile', () => {
  it('should preserve the Terminal across sheet hiding and surface switches until named Close', async () => {
    const viewport = Object.assign(new EventTarget(), {
      height: globalThis.innerHeight,
      offsetTop: 0,
      scale: 1,
    });
    vi.stubGlobal('visualViewport', viewport);
    const { unmount } = renderShell();
    expect(terminal.mounted).not.toHaveBeenCalled();
    act(() => {
      selectSurface('terminal');
    });
    const input = await screen.findByRole('textbox', { name: 'Shell session' });
    input.scrollIntoView = vi.fn();
    act(() => {
      input.focus();
      viewport.height = globalThis.innerHeight - 300;
      viewport.dispatchEvent(new Event('resize'));
    });
    expect(screen.getByRole('dialog')).toHaveAttribute('data-keyboard', 'open');
    expect(screen.getByRole('dialog').style.getPropertyValue('--keyboard-frame-height')).toBe(`${viewport.height}px`);
    fireEvent.change(input, { target: { value: 'running shell state' } });
    expect(terminal.mounted).toHaveBeenCalledTimes(1);

    act(() => {
      screen.getByRole('region', { name: 'Terminal' }).focus();
    });
    expect(screen.getByRole('dialog')).not.toHaveAttribute('data-keyboard');
    fireEvent.keyDown(screen.getByRole('region', { name: 'Terminal' }), { key: 'Escape' });
    expect(state.drawerOpen).toBe(false);
    expect(screen.queryByRole('textbox', { name: 'Shell session' })).not.toBeInTheDocument();
    expect(terminal.closed).not.toHaveBeenCalled();
    act(() => {
      selectSurface('terminal');
    });
    expect(await screen.findByRole('textbox', { name: 'Shell session' })).toBe(input);
    expect(input).toHaveValue('running shell state');
    act(() => {
      input.focus();
    });
    expect(screen.getByRole('dialog')).toHaveAttribute('data-keyboard', 'open');

    act(() => {
      selectSurface('chat');
    });
    expect(await screen.findByRole('textbox', { name: 'Message' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Shell session' })).not.toBeInTheDocument();
    expect(terminal.closed).not.toHaveBeenCalled();
    act(() => {
      selectSurface('terminal');
    });
    expect(await screen.findByRole('textbox', { name: 'Shell session' })).toBe(input);

    fireEvent.click(screen.getByRole('button', { name: 'Close Terminal' }));
    expect(terminal.closed).toHaveBeenCalledTimes(1);
    expect(state.drawerOpen).toBe(false);
    act(() => {
      selectSurface('terminal');
    });
    expect(await screen.findByRole('textbox', { name: 'Shell session' })).toHaveValue('');
    expect(terminal.mounted).toHaveBeenCalledTimes(2);
    act(() => {
      selectSurface('viewer');
    });
    unmount();
    expect(terminal.closed).toHaveBeenCalledTimes(2);
  });

  it('should ask a running Terminal before its named Close removes it, keeping it on Hide (T15)', async () => {
    renderShell();
    act(() => {
      selectSurface('terminal');
    });
    const input = await screen.findByRole('textbox', { name: 'Shell session' });
    fireEvent.change(input, { target: { value: 'running shell state' } });
    terminal.running = true;

    fireEvent.click(screen.getByRole('button', { name: 'Close Terminal' }));
    expect(terminal.closed).not.toHaveBeenCalled();
    expect(state.drawerOpen).toBe(true);
    const decision = screen.getByRole('alertdialog', { name: 'Close the Terminal?' });

    fireEvent.click(within(decision).getByRole('button', { name: 'Hide' }));
    expect(state.drawerOpen).toBe(false);
    expect(terminal.closed).not.toHaveBeenCalled();
    act(() => {
      selectSurface('terminal');
    });
    expect(await screen.findByRole('textbox', { name: 'Shell session' })).toHaveValue('running shell state');

    fireEvent.click(screen.getByRole('button', { name: 'Close Terminal' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog', { name: 'Close the Terminal?' })).getByRole('button', {
        name: 'Close and stop',
      }),
    );
    expect(terminal.closed).toHaveBeenCalledOnce();
    expect(state.drawerOpen).toBe(false);
    act(() => {
      selectSurface('terminal');
    });
    expect(await screen.findByRole('textbox', { name: 'Shell session' })).toHaveValue('');
    expect(terminal.mounted).toHaveBeenCalledTimes(2);
  });

  it('should name the open surface by its title, with no tab panel left pointing at a missing tab', async () => {
    state.drawerOpen = true;
    state.activeTab = 'revisions';
    renderShell();

    const surface = await screen.findByRole('region', { name: 'Revisions' });
    expect(await within(surface).findByText('Revision list')).toBeInTheDocument();
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
    for (const labelled of document.querySelectorAll('[aria-labelledby]')) {
      for (const id of labelled.getAttribute('aria-labelledby')!.split(' ')) {
        expect(
          document.querySelector(`[id="${id}"]`),
          `#${id} labels ${labelled.outerHTML.slice(0, 80)}`,
        ).not.toBeNull();
      }
    }
  });

  it.each([
    { width: 320, viewportHeight: 640, safeAreaBottom: 0, snapPoint: 0.5 },
    { width: 390, viewportHeight: 844, safeAreaBottom: 34, snapPoint: 0.5 },
    { width: 390, viewportHeight: 844, safeAreaBottom: 34, snapPoint: 1 },
    { width: 320, viewportHeight: 640, safeAreaBottom: 0, snapPoint: 0.25 },
    { width: 320, viewportHeight: 640, safeAreaBottom: 0, snapPoint: mobileDrawerPeekSnapPoint },
    { width: 390, viewportHeight: 844, safeAreaBottom: 34, snapPoint: mobileDrawerPeekSnapPoint },
  ])(
    'should end the open surface at the top of the nav at $width×$viewportHeight (snap $snapPoint, inset $safeAreaBottom px)',
    async ({ viewportHeight, safeAreaBottom, snapPoint }) => {
      state.drawerOpen = true;
      state.activeTab = 'chat';
      state.activeSnapPoint = snapPoint;
      renderShell();

      const surface = await screen.findByRole('region', { name: 'Chat' });
      const drawer = surface.closest<HTMLElement>('[data-slot="drawer-content"]')!;
      const environment = { viewportHeight, safeAreaBottom };
      // Vaul shows the top `snapPoint` of the viewport-tall sheet; its 1px top border and the grabber row come first, then the surface.
      const visible = typeof snapPoint === 'string' ? Number.parseFloat(snapPoint) : snapPoint * viewportHeight;
      const sheetTop = viewportHeight - visible;
      const topBorder = drawer.classList.contains('border-t') ? 1 : 0;
      const grabber = resolveLength('var(--drawer-handle-height)', drawer.className, environment);
      const surfaceBottom =
        sheetTop + topBorder + grabber + resolveLength(surface.style.height, drawer.className, environment);
      const navTop = viewportHeight - resolveLength('var(--nav-offset)', drawer.className, environment);

      // A 36px grabber row (its 44px target adds 8px above the edge, D4).
      expect(grabber).toBe(36);
      expect(topBorder).toBe(1);
      expect(surfaceBottom).toBeCloseTo(navTop);
    },
  );

  it('should hold the model above the nav and its home-indicator inset while no surface is open', () => {
    state.drawerOpen = false;
    state.activeTab = 'viewer';
    renderShell();

    const viewerBox = screen.getByRole('button', { name: 'Viewer controls' }).parentElement!;
    expect(viewerBox.style.paddingBottom).toBe('var(--nav-offset)');
    expect(viewerBox.parentElement).toHaveClass('[--nav-offset:calc(var(--nav-height)_+_env(safe-area-inset-bottom))]');
  });

  it('should keep the viewer accessible while the docked panel opens and closes', async () => {
    state.drawerOpen = false;
    renderShell();

    expect(screen.getByRole('button', { name: 'Viewer controls' })).toBeInTheDocument();

    setDrawerOpen(true);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Viewer controls' })).toBeInTheDocument();
    });
    expect(screen.getByText('Viewer controls').closest('[aria-hidden]')).toBeNull();
    expect(document.querySelector('[data-slot=drawer-overlay]')).toBeNull();

    setDrawerOpen(false);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Viewer controls' })).toBeInTheDocument();
    });
    expect(screen.getByText('Viewer controls').closest('[aria-hidden]')).toBeNull();
  });

  it('should move the viewer box in one step instead of animating its size through every frame', () => {
    // Every intermediate size reallocates the canvas and all of its render targets.
    state.drawerOpen = false;
    renderShell();

    const viewerBox = screen.getByRole('button', {
      name: 'Viewer controls',
    }).parentElement!;

    expect(viewerBox.className).not.toMatch(/(?:^|\s)transition(?:-|\s|$)/u);
    expect(viewerBox.style.transition).toBe('');
  });

  /** What each registry pane shows on a phone: its desktop title, and the body the desktop registers. */
  const paneBodies = {
    browser: 'Browse in Tau desktop',
    parameters: 'Parameter form',
    kinematics: 'Joint list',
    files: 'File tree',
    model: 'Component tree',
    print: 'Machine list',
    revisions: 'Revision list',
    agents: 'Agent list',
    jobs: 'Job list',
    export: 'Export formats',
    share: 'Share settings',
    details: 'Project details',
    kernel: 'Kernel spans',
    console: 'Console log',
    terminal: 'Shell session',
  } as const satisfies Record<WorkbenchPanelId, string>;
  const paneTitles = {
    browser: 'Browser',
    parameters: 'Parameters',
    kinematics: 'Kinematics',
    files: 'Files',
    model: 'Model tree',
    print: 'Print',
    revisions: 'Revisions',
    agents: 'Agents',
    jobs: 'Jobs',
    export: 'Export',
    share: 'Share',
    details: 'Details',
    kernel: 'Telemetry',
    console: 'Console',
    terminal: 'Terminal',
  } as const satisfies Record<WorkbenchPanelId, string>;

  it.each(Object.keys(paneBodies) as WorkbenchPanelId[])(
    'should open the %s registry pane in the sheet with its own body (I1)',
    async (panel) => {
      state.drawerOpen = true;
      state.activeTab = mobilePanelByWorkbenchPanel[panel];
      renderShell();

      const surface = await screen.findByRole('region', { name: paneTitles[panel] });
      expect(await within(surface).findByText(paneBodies[panel])).toBeInTheDocument();
    },
  );

  it.each([
    ['model-tree', 'Model tree'],
    ['kinematics', 'Kinematics'],
    ['print', 'Print'],
    ['browser', 'Browser'],
    ['agents', 'Agents'],
    ['jobs', 'Jobs'],
    ['kernel', 'Telemetry'],
    ['console', 'Console'],
    ['share', 'Share'],
  ])(
    'should give the %s pane a title and a Close named after it that returns to the model (D4, I6)',
    async (id, title) => {
      state.drawerOpen = true;
      state.activeTab = id;
      renderShell();

      const surface = await screen.findByRole('region', { name: title });
      expect(within(surface).getByRole('heading', { name: title })).toBeInTheDocument();
      fireEvent.click(within(surface).getByRole('button', { name: `Close ${title}` }));

      await waitFor(() => {
        expect(screen.queryByRole('region', { name: title })).not.toBeInTheDocument();
      });
      expect(state.activeTab).toBe('viewer');
    },
  );

  it('should give the phone Share pane one visible title, hiding the share frame heading (PN-SHR-1)', async () => {
    state.drawerOpen = true;
    state.activeTab = 'share';
    renderShell();

    const surface = await screen.findByRole('region', { name: 'Share' });
    const frameTitle = within(surface).getByRole('heading', { name: 'Share project' });
    // Jsdom applies no Tailwind; the wrapper's rule is what hides the frame heading on the phone.
    expect(frameTitle.closest('[class*="[&_[data-slot=share-pane-title]]:hidden"]')).not.toBeNull();
    expect(within(surface).getByRole('region', { name: 'Share project' })).toBeInTheDocument();
  });

  it('should show the desktop refusal for Telemetry and Console while debug mode is off', async () => {
    state.flags.tauDebug = false;
    state.drawerOpen = true;
    state.activeTab = 'console';
    renderShell();

    const surface = await screen.findByRole('region', { name: 'Console' });
    expect(within(surface).getByText('Console requires debug mode.')).toBeInTheDocument();
    expect(within(surface).queryByText('Console log')).not.toBeInTheDocument();
  });

  it('should move focus to the surface a person opens from the nav, and back to the Model when Escape closes it', async () => {
    renderShell();
    const navigation = screen.getByRole('navigation', { name: 'Workbench' });
    const parameters = within(navigation).getByRole('button', { name: 'Parameters' });
    parameters.focus();
    act(() => {
      fireEvent.click(parameters);
    });

    const surface = await screen.findByRole('region', { name: 'Parameters' });
    await waitFor(() => {
      expect(surface).toHaveFocus();
    });

    fireEvent.keyDown(surface, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Parameters' })).not.toBeInTheDocument();
    });
    expect(within(navigation).getByRole('button', { name: 'Model' })).toHaveFocus();
    expect(within(navigation).getByRole('button', { name: 'Model' })).toHaveAttribute('aria-current', 'page');
  });

  it('should hand focus to a surface chosen from All, not back to All', async () => {
    renderShell();
    const navigation = screen.getByRole('navigation', { name: 'Workbench' });
    fireEvent.click(within(navigation).getByRole('button', { name: 'All' }));
    fireEvent.click(
      within(await screen.findByRole('dialog', { name: 'All surfaces' })).getByRole('button', { name: 'Agents' }),
    );

    const surface = await screen.findByRole('region', { name: 'Agents' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'All surfaces' })).not.toBeInTheDocument();
    });
    expect(surface).toHaveFocus();
  });

  it('should not take focus for a surface restored from storage', async () => {
    state.drawerOpen = true;
    state.activeTab = 'agents';
    renderShell();

    const surface = await screen.findByRole('region', { name: 'Agents' });
    expect(surface).not.toHaveFocus();
  });

  it('should owe no focus after a person chooses the surface already open', async () => {
    state.drawerOpen = true;
    state.activeTab = 'parameters';
    renderShell();
    const navigation = screen.getByRole('navigation', { name: 'Workbench' });
    fireEvent.click(within(navigation).getByRole('button', { name: 'Parameters' }));

    // The app closes the sheet and later opens the same surface itself: that visit takes no focus.
    act(() => {
      selectSurface('viewer');
    });
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Parameters' })).not.toBeInTheDocument();
    });
    act(() => {
      selectSurface('parameters');
    });

    const surface = await screen.findByRole('region', { name: 'Parameters' });
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(surface).not.toHaveFocus();
  });

  it('should leave Escape in a text field to the field and keep the sheet open', async () => {
    state.drawerOpen = true;
    state.activeTab = 'chat';
    renderShell();

    const message = await screen.findByRole('textbox', { name: 'Message' });
    message.focus();
    fireEvent.keyDown(message, { key: 'Escape' });

    expect(screen.getByRole('region', { name: 'Chat' })).toBeInTheDocument();
    expect(state.activeTab).toBe('chat');
  });

  it('should raise the sheet from the peek when the surface no longer fits there (I5)', async () => {
    const observers: Array<() => void> = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        public constructor(callback: () => void) {
          observers.push(callback);
        }
        public observe(): void {
          // The test drives the callback itself.
        }
        public disconnect(): void {
          // Re-observing disconnects first; the callbacks stay registered for the test to drive.
        }
      },
    );
    state.drawerOpen = true;
    state.activeTab = 'jobs';
    state.activeSnapPoint = mobileDrawerPeekSnapPoint;
    renderShell();

    const surface = await screen.findByRole('region', { name: 'Jobs' });
    const content = surface.querySelector<HTMLElement>('[data-slot=floating-panel-content]')!;
    Object.defineProperty(content, 'clientHeight', { configurable: true, value: 120 });
    Object.defineProperty(content, 'scrollHeight', { configurable: true, value: 120 });
    act(() => {
      for (const observer of observers) {
        observer();
      }
    });
    expect(state.activeSnapPoint).toBe(mobileDrawerPeekSnapPoint);

    // A decision lands above the composer: the fixed rows outgrow the peek.
    Object.defineProperty(content, 'scrollHeight', { configurable: true, value: 260 });
    act(() => {
      for (const observer of observers) {
        observer();
      }
    });
    expect(state.activeSnapPoint).toBe(mobileDrawerOpenSnapPoint);
  });

  /** Stub the ResizeObserver and hand back a driver that runs every registered callback, as a content change would. */
  const driveableObservers = (): (() => void) => {
    const observing = new Set<() => void>();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        readonly #callback: () => void;
        public constructor(callback: () => void) {
          this.#callback = callback;
        }
        public observe(): void {
          // The test drives the callback itself, for observers still observing.
          observing.add(this.#callback);
        }
        public disconnect(): void {
          observing.delete(this.#callback);
        }
      },
    );
    return () => {
      act(() => {
        // oxlint-disable-next-line unicorn/no-useless-spread -- a callback re-observes, which re-adds it to the set mid-loop.
        for (const observer of [...observing]) {
          observer();
        }
      });
    };
  };
  const rect = (top: number, bottom: number): DOMRect =>
    DOMRect.fromRect({ x: 0, y: top, width: 300, height: bottom - top });
  /** A scroller in the open Jobs surface whose fixed rows fit; `scrolled` puts it away from where it rests. */
  const scrollerInSurface = async (
    options: Readonly<{ tray?: boolean; box: DOMRect; scrolled?: boolean }>,
  ): Promise<HTMLElement> => {
    const surface = await screen.findByRole('region', { name: 'Jobs' });
    const content = surface.querySelector<HTMLElement>('[data-slot=floating-panel-content]')!;
    Object.defineProperty(content, 'clientHeight', { configurable: true, value: 300 });
    Object.defineProperty(content, 'scrollHeight', { configurable: true, value: 300 });
    const scroller = document.createElement(options.tray ? 'ul' : 'div');
    if (options.tray) {
      scroller.dataset['scrollRest'] = 'start';
    }
    scroller.style.overflowY = 'auto';
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: options.box.height });
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: options.box.height + 400 });
    // The tray rests at its top, a transcript at its end.
    const rest = options.tray ? 0 : 400;
    scroller.scrollTop = options.scrolled ? (options.tray ? 200 : 100) : rest;
    vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue(options.box);
    content.append(scroller);
    return scroller;
  };
  const decision = (
    scroller: HTMLElement,
    attributes: Readonly<Record<string, string>>,
    box: (snapPoint: number | string) => DOMRect,
  ): HTMLElement => {
    const element = document.createElement('div');
    for (const [name, value] of Object.entries(attributes)) {
      element.setAttribute(name, value);
    }
    element.textContent = 'Refused once.';
    vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => box(state.activeSnapPoint));
    scroller.append(element);
    return element;
  };

  it('should raise the sheet from the peek when the resting transcript cuts off a run failure (I5, PN-CHAT-7)', async () => {
    const drive = driveableObservers();
    state.drawerOpen = true;
    state.activeTab = 'jobs';
    state.activeSnapPoint = mobileDrawerPeekSnapPoint;
    renderShell();
    const transcript = await scrollerInSurface({ box: rect(40, 140) });
    // At the peek the failure runs past the transcript's foot; at half the transcript holds it.
    decision(transcript, { 'data-decision': 'run-error', 'data-decision-id': 'run-error-1' }, (point) =>
      point === mobileDrawerPeekSnapPoint ? rect(100, 180) : rect(60, 120),
    );

    drive();
    expect(state.activeSnapPoint).toBe(mobileDrawerOpenSnapPoint);
  });

  it('should re-check on a scroll, at most every 100ms, while a list settles at its end (I5)', async () => {
    driveableObservers();
    state.drawerOpen = true;
    state.activeTab = 'jobs';
    state.activeSnapPoint = mobileDrawerPeekSnapPoint;
    renderShell();
    // Still settling: the transcript is short of its end, so the failure below its foot is not the detent's doing.
    const transcript = await scrollerInSurface({ box: rect(40, 140), scrolled: true });
    decision(transcript, { 'data-decision': 'run-error', 'data-decision-id': 'run:r1:1' }, (point) =>
      point === mobileDrawerPeekSnapPoint ? rect(100, 180) : rect(60, 120),
    );
    await act(async () => {
      await new Promise((resolve) => {
        requestAnimationFrame(resolve);
      });
    });
    expect(state.activeSnapPoint).toBe(mobileDrawerPeekSnapPoint);

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      // The list reaches its end over a few scrolls; the check runs once, 100ms after the first.
      transcript.scrollTop = 400;
      fireEvent.scroll(transcript);
      fireEvent.scroll(transcript);
      act(() => {
        vi.advanceTimersByTime(99);
      });
      expect(state.activeSnapPoint).toBe(mobileDrawerPeekSnapPoint);
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(state.activeSnapPoint).toBe(mobileDrawerOpenSnapPoint);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should not count the closed sheet returning to its first detent as the person moving it (I5)', async () => {
    const drive = driveableObservers();
    state.drawerOpen = true;
    state.activeTab = 'jobs';
    state.activeSnapPoint = mobileDrawerOpenSnapPoint;
    renderShell();
    await scrollerInSurface({ box: rect(40, 140) });
    drive();

    // Closed with Escape, the sheet goes back to its first detent on Vaul's own timer: not a move the person made.
    fireEvent.keyDown(screen.getByRole('region', { name: 'Jobs' }), { key: 'Escape' });
    expect(state.drawerOpen).toBe(false);
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 600);
      });
    });

    // Reopened at the peek with rows that no longer fit there, which the person never chose: the sheet rises.
    act(() => {
      state.activeSnapPoint = mobileDrawerPeekSnapPoint;
      selectSurface('jobs');
    });
    const transcript = await scrollerInSurface({ box: rect(40, 140) });
    Object.defineProperty(transcript.parentElement!, 'scrollHeight', { configurable: true, value: 360 });
    drive();
    expect(state.activeSnapPoint).toBe(mobileDrawerOpenSnapPoint);
  });

  it('should retire a settled approval only once no copy of it still waits (I5)', async () => {
    const drive = driveableObservers();
    state.drawerOpen = true;
    state.activeTab = 'jobs';
    state.activeSnapPoint = mobileDrawerOpenSnapPoint;
    renderShell();
    const grabber = screen.getByRole('slider', { name: 'Drawer height' });
    const tray = await scrollerInSurface({ tray: true, box: rect(200, 260) });
    const atPeek = (point: number | string): DOMRect =>
      point === mobileDrawerPeekSnapPoint ? rect(210, 330) : rect(205, 255);
    const waiting = { 'data-decision': 'approval', 'data-decision-id': 'approval:i1', 'data-decision-state': 'open' };
    const settled = { 'data-decision-id': 'approval:i1', 'data-decision-state': 'settled' };
    // The banner's copy and the message's copy of one approval.
    const banner = decision(tray, waiting, atPeek);
    const message = decision(tray, waiting, atPeek);
    drive();
    fireEvent.keyDown(grabber, { key: 'Home' });
    expect(state.activeSnapPoint).toBe(mobileDrawerPeekSnapPoint);

    // The message's copy settles first; the banner's still waits, still acknowledged.
    delete message.dataset['decision'];
    message.dataset['decisionState'] = 'settled';
    drive();
    expect(state.activeSnapPoint).toBe(mobileDrawerPeekSnapPoint);

    // Both settled: the identity retires, so the same approval waiting again is a new decision.
    banner.remove();
    message.remove();
    decision(tray, settled, () => rect(0, 0));
    drive();
    decision(tray, waiting, atPeek);
    drive();
    expect(state.activeSnapPoint).toBe(mobileDrawerOpenSnapPoint);
  });

  it('should keep a detent chosen on Chat after the person moves the sheet on another surface (I5)', async () => {
    const drive = driveableObservers();
    state.drawerOpen = true;
    state.activeTab = 'jobs';
    state.activeSnapPoint = mobileDrawerOpenSnapPoint;
    renderShell();
    const grabber = screen.getByRole('slider', { name: 'Drawer height' });
    const tray = await scrollerInSurface({ tray: true, box: rect(200, 260) });
    const atPeek = (point: number | string): DOMRect =>
      point === mobileDrawerPeekSnapPoint ? rect(210, 330) : rect(205, 255);
    const question = decision(tray, { 'data-ask-id': 'ask-1', 'data-ask-state': 'open' }, atPeek);
    drive();
    fireEvent.keyDown(grabber, { key: 'Home' });
    expect(state.activeSnapPoint).toBe(mobileDrawerPeekSnapPoint);

    // Another surface, without the question: the person moves the sheet up and back down there.
    question.remove();
    fireEvent.keyDown(grabber, { key: 'End' });
    expect(state.activeSnapPoint).toBe(1);
    fireEvent.keyDown(grabber, { key: 'Home' });
    expect(state.activeSnapPoint).toBe(mobileDrawerPeekSnapPoint);

    // Back on Chat, the same question is still the one they moved the sheet below.
    decision(tray, { 'data-ask-id': 'ask-1', 'data-ask-state': 'open' }, atPeek);
    drive();
    expect(state.activeSnapPoint).toBe(mobileDrawerPeekSnapPoint);
  });

  it.each<Readonly<{ name: string; scrolled: boolean; attributes: Readonly<Record<string, string>>; box: DOMRect }>>([
    {
      // Scrolled up past the failure: it sits below the transcript's foot, but the person put it there.
      name: 'a failure the person scrolled past',
      scrolled: true,
      attributes: { 'data-decision': 'run-error', 'data-decision-id': 'run-error-1' },
      box: rect(150, 210),
    },
    {
      // At rest, but not displayed: a zero box is not cut off.
      name: 'a failure with no box',
      scrolled: false,
      attributes: { 'data-decision': 'run-error', 'data-decision-id': 'run-error-1' },
      box: rect(0, 0),
    },
    {
      // A job's outcome or a form error is a record a person scrolls through, never a reason to move the sheet.
      name: 'an alert that is no decision',
      scrolled: false,
      attributes: { role: 'alert' },
      box: rect(100, 200),
    },
  ])('should hold the detent for $name (I5)', async ({ scrolled, attributes, box }) => {
    const drive = driveableObservers();
    state.drawerOpen = true;
    state.activeTab = 'jobs';
    state.activeSnapPoint = mobileDrawerOpenSnapPoint;
    renderShell();
    const transcript = await scrollerInSurface({ box: rect(40, 140), scrolled });
    decision(transcript, attributes, () => box);

    drive();
    expect(state.activeSnapPoint).toBe(mobileDrawerOpenSnapPoint);
  });

  it('should keep a failure acknowledged while its text changes, and raise for the same words as a new failure (I5)', async () => {
    const drive = driveableObservers();
    state.drawerOpen = true;
    state.activeTab = 'jobs';
    state.activeSnapPoint = mobileDrawerOpenSnapPoint;
    renderShell();
    const transcript = await scrollerInSurface({ box: rect(40, 140) });
    const atPeek = (point: number | string): DOMRect =>
      point === mobileDrawerPeekSnapPoint ? rect(100, 180) : rect(60, 120);
    const failure = decision(transcript, { 'data-decision': 'run-error', 'data-decision-id': 'run-error-1' }, atPeek);
    failure.textContent = 'Rate limited. Retrying in 30s.';
    drive();
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Drawer height' }), { key: 'Home' });
    expect(state.activeSnapPoint).toBe(mobileDrawerPeekSnapPoint);

    // A countdown rewrites the card every second: still the failure the person moved the sheet below.
    failure.textContent = 'Rate limited. Retrying in 29s.';
    drive();
    expect(state.activeSnapPoint).toBe(mobileDrawerPeekSnapPoint);

    // Try again fails the same way: the same words, a new failure.
    failure.remove();
    const again = decision(transcript, { 'data-decision': 'run-error', 'data-decision-id': 'run-error-2' }, atPeek);
    again.textContent = 'Rate limited. Retrying in 29s.';
    drive();
    expect(state.activeSnapPoint).toBe(mobileDrawerOpenSnapPoint);
  });

  it('should keep the fixed rows acknowledged when an empty failure marker has no box (I5)', async () => {
    const drive = driveableObservers();
    state.drawerOpen = true;
    state.activeTab = 'jobs';
    state.activeSnapPoint = mobileDrawerOpenSnapPoint;
    renderShell();
    const transcript = await scrollerInSurface({ box: rect(40, 140) });
    const content = transcript.parentElement!;
    Object.defineProperty(content, 'scrollHeight', { configurable: true, value: 360 });
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Drawer height' }), { key: 'Home' });
    expect(state.activeSnapPoint).toBe(mobileDrawerPeekSnapPoint);

    decision(transcript, { 'data-decision': 'run-error', 'data-decision-id': 'run-error-1' }, () => rect(0, 0));
    drive();
    expect(state.activeSnapPoint).toBe(mobileDrawerPeekSnapPoint);
  });

  it('should raise the sheet from half to full when the resting tray cuts off a waiting question (I5, WB-09)', async () => {
    const drive = driveableObservers();
    state.drawerOpen = true;
    state.activeTab = 'jobs';
    state.activeSnapPoint = mobileDrawerOpenSnapPoint;
    renderShell();
    const tray = await scrollerInSurface({ tray: true, box: rect(200, 350) });
    // An answered question past the tray's foot is a record, not a decision.
    decision(tray, { 'data-ask-id': 'ask-0', 'data-ask-state': 'settled' }, () => rect(210, 420));
    drive();
    expect(state.activeSnapPoint).toBe(mobileDrawerOpenSnapPoint);

    // A waiting question's answers past the resting tray's foot: the sheet rises rather than scroll them away.
    decision(tray, { 'data-ask-id': 'ask-1', 'data-ask-state': 'open' }, (point) =>
      point === 1 ? rect(210, 340) : rect(210, 420),
    );
    drive();
    expect(state.activeSnapPoint).toBe(1);
  });

  it('should hold the detent while one copy of a waiting question is wholly shown (I5)', async () => {
    const drive = driveableObservers();
    state.drawerOpen = true;
    state.activeTab = 'jobs';
    state.activeSnapPoint = mobileDrawerOpenSnapPoint;
    renderShell();
    // The transcript, resting at its end, cuts off the question's card; the tray shows the same question whole.
    const transcript = await scrollerInSurface({ box: rect(40, 140) });
    const tray = await scrollerInSurface({ tray: true, box: rect(150, 300) });
    // Both copies land together, as one render puts them on screen.
    decision(transcript, { 'data-ask-id': 'ask-1', 'data-ask-state': 'open' }, () => rect(100, 200));
    const trayCopy = decision(tray, { 'data-ask-id': 'ask-1', 'data-ask-state': 'open' }, () => rect(160, 280));
    drive();
    expect(state.activeSnapPoint).toBe(mobileDrawerOpenSnapPoint);

    // Both copies cut off: the question is folded away, and the sheet rises.
    vi.mocked(trayCopy.getBoundingClientRect).mockImplementation(() =>
      state.activeSnapPoint === 1 ? rect(160, 280) : rect(160, 340),
    );
    drive();
    expect(state.activeSnapPoint).toBe(1);
  });

  it('should hold a detent the person chooses below a waiting question, until a new decision arrives (I5)', async () => {
    const drive = driveableObservers();
    state.drawerOpen = true;
    state.activeTab = 'jobs';
    state.activeSnapPoint = 1;
    renderShell();
    const tray = await scrollerInSurface({ tray: true, box: rect(200, 260) });
    decision(tray, { 'data-ask-id': 'ask-1', 'data-ask-state': 'open' }, (point) =>
      point === 1 ? rect(205, 255) : rect(210, 330),
    );
    drive();
    expect(state.activeSnapPoint).toBe(1);

    // The person takes the sheet down to the peek: the question no longer fits, and the sheet stays where they put it.
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Drawer height' }), { key: 'Home' });
    expect(state.activeSnapPoint).toBe(mobileDrawerPeekSnapPoint);
    drive();
    drive();
    expect(state.activeSnapPoint).toBe(mobileDrawerPeekSnapPoint);

    // A second question arrives and is cut off: that one has not been seen, so the sheet rises for it.
    decision(tray, { 'data-ask-id': 'ask-2', 'data-ask-state': 'open' }, (point) =>
      point === mobileDrawerPeekSnapPoint ? rect(240, 320) : rect(205, 255),
    );
    drive();
    expect(state.activeSnapPoint).toBe(mobileDrawerOpenSnapPoint);
  });

  it.each([
    [{ attention: 1, conflicted: false, settings: 0, failed: 0 }, 'A chat needs you'],
    [{ attention: 3, conflicted: true, settings: 0, failed: 0 }, '2 chats need you'],
    [{ attention: 0, conflicted: false, settings: 0, failed: 1 }, 'A chat failed'],
  ])('should cue Chat from the project status %o while another surface has the sheet', (row, description) => {
    state.row = row;
    state.drawerOpen = true;
    state.activeTab = 'parameters';
    renderShell();

    const chat = within(screen.getByRole('navigation', { name: 'Workbench' })).getByRole('button', { name: 'Chat' });
    expect(chat).toHaveAccessibleDescription(description);
  });

  it('should not cue Chat for a checkout conflict or settings issue alone, which the status line owns (I4)', () => {
    state.row = { attention: 2, conflicted: true, settings: 1, failed: 0 };
    renderShell();

    const chat = within(screen.getByRole('navigation', { name: 'Workbench' })).getByRole('button', { name: 'Chat' });
    expect(chat).not.toHaveAccessibleDescription();
  });

  it('should leave the height alone when the pane title is tapped; only the grabber changes detent (T1)', async () => {
    state.drawerOpen = true;
    state.activeTab = 'agents';
    state.activeSnapPoint = 0.5;
    renderShell();

    const surface = await screen.findByRole('region', { name: 'Agents' });
    fireEvent.click(within(surface).getByRole('heading', { name: 'Agents' }));
    fireEvent.click(within(surface).getByRole('heading', { name: 'Agents' }));
    expect(state.activeSnapPoint).toBe(0.5);

    const grabber = screen.getByRole('slider', { name: 'Drawer height' });
    fireEvent.keyDown(grabber, { key: 'Home' });
    expect(state.activeSnapPoint).toBe(mobileDrawerPeekSnapPoint);
    fireEvent.keyDown(grabber, { key: 'End' });
    expect(state.activeSnapPoint).toBe(1);
    expect(screen.getByRole('region', { name: 'Agents' })).toBeInTheDocument();
  });
});
