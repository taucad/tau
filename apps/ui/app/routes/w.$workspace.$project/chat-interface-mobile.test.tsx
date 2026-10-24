// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { ChatInterfaceMobile } from '#routes/w.$workspace.$project/chat-interface-mobile.js';
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
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'project-1' }) }));
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
  ProjectShareWorkbenchPanel: () => <p>Share settings</p>,
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
vi.mock('#routes/w.$workspace.$project/project-unavailable-overlay.js', () => ({
  ProjectUnavailableOverlay: () => null,
}));
vi.mock('#routes/w.$workspace.$project/project-manifest-issue-banner.js', () => ({
  ProjectManifestIssueBanner: () => null,
}));
vi.mock('#routes/w.$workspace.$project/workspace-skeleton.js', () => ({ WorkspaceSkeleton: () => null }));

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
});

/* Vaul returns a closed drawer to its first snap point on a 500ms timer that outlives the test that closed it. Let the
 * last of those timers fire while the DOM environment is still up, or React's state update throws on a torn-down window. */
afterAll(async () => {
  await new Promise((resolve) => {
    setTimeout(resolve, 600);
  });
});

describe('ChatInterfaceMobile', () => {
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
      within(await screen.findByRole('dialog', { name: 'All surfaces' })).getByRole('button', { name: 'Jobs' }),
    );

    const surface = await screen.findByRole('region', { name: 'Jobs' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'All surfaces' })).not.toBeInTheDocument();
    });
    expect(surface).toHaveFocus();
  });

  it('should not take focus for a surface restored from storage', async () => {
    state.drawerOpen = true;
    state.activeTab = 'jobs';
    renderShell();

    const surface = await screen.findByRole('region', { name: 'Jobs' });
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
