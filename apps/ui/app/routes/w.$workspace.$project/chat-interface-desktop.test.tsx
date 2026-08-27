import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '#components/ui/tooltip.js';
import type * as ProjectWorkspaceContext from '#routes/w.$workspace.$project/project-workspace-context.js';

const send = vi.fn();
const setWorkbenchOpen = vi.hoisted(() => vi.fn());
const desktopLayout = {
  chatOpen: true,
  workbenchOpen: true,
  chatWidth: 320,
  workbenchWidth: 420,
  compactAuxiliary: 'chat' as 'chat' | 'workbench',
};
const snapshot = {
  context: { panelState: { desktopLayout } },
  matches: () => true,
};

vi.mock('@xstate/react', () => ({
  useSelector: (_actor: unknown, selector: (value: typeof snapshot) => unknown) => selector(snapshot),
}));
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ editorRef: { send } }) }));
vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', async (importOriginal) => ({
  ...(await importOriginal<typeof ProjectWorkspaceContext>()),
  useProjectWorkspace: () => ({ setChatOpen: vi.fn(), setWorkbenchOpen }),
}));
vi.mock('#routes/w.$workspace.$project/chat-history.js', () => ({
  ChatHistory: () => <div data-testid='chat-lane' />,
}));
vi.mock('#routes/w.$workspace.$project/focused-chat-gate.js', () => ({
  ChatHistoryGate: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  ChatInterfaceSessionGate: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('#routes/w.$workspace.$project/chat-viewer-dockview.js', () => ({
  ViewerDockview: () => <div data-testid='viewer-lane' />,
}));
vi.mock('#routes/w.$workspace.$project/chat-workbench-dockview.js', () => ({
  WorkbenchDockview: () => <div data-testid='workbench-lane' />,
}));
vi.mock('#routes/w.$workspace.$project/project-unavailable-overlay.js', () => ({
  ProjectUnavailableOverlay: () => null,
}));
vi.mock('#components/layout/sidebar-offset.js', () => ({
  SidebarOffset: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('#components/chat/chat-context-insertion.js', () => ({
  ChatContextInsertionProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('allotment', () => {
  const Pane = ({ children, visible = true }: React.PropsWithChildren<{ readonly visible?: boolean }>) => (
    <div data-pane data-visible={visible}>
      {children}
    </div>
  );
  const Allotment = Object.assign(
    ({ children }: React.PropsWithChildren) => <div data-testid='allotment'>{children}</div>,
    { Pane },
  );
  return { Allotment, LayoutPriority: { Low: 0, High: 1 } };
});

const resizeCallbacks = new Set<ResizeObserverCallback>();
class ResizeObserverMock {
  readonly #callback: ResizeObserverCallback;

  public constructor(callback: ResizeObserverCallback) {
    this.#callback = callback;
    resizeCallbacks.add(callback);
  }
  public observe(): void {
    return undefined;
  }
  public disconnect(): void {
    resizeCallbacks.delete(this.#callback);
  }
  public unobserve(): void {
    return undefined;
  }
}

const resizeObserver: ResizeObserver = {
  disconnect: () => undefined,
  observe: () => undefined,
  unobserve: () => undefined,
};

const { ChatInterfaceDesktop, compactWorkspaceWidth } = await import('./chat-interface-desktop.js');

const renderDesktop = () =>
  render(
    <TooltipProvider>
      <ChatInterfaceDesktop />
    </TooltipProvider>,
  );

const resizeTo = (width: number): void => {
  act(() => {
    const entry: ResizeObserverEntry = {
      borderBoxSize: [],
      contentBoxSize: [],
      contentRect: DOMRect.fromRect({ width, height: 800 }),
      devicePixelContentBoxSize: [],
      target: document.body,
    };
    for (const callback of resizeCallbacks) {
      callback([entry], resizeObserver);
    }
  });
};

describe('ChatInterfaceDesktop', () => {
  beforeEach(() => {
    desktopLayout.chatOpen = true;
    desktopLayout.workbenchOpen = true;
    desktopLayout.compactAuxiliary = 'chat';
    vi.clearAllMocks();
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the 1119/1120 workspace boundary and keeps all three pane children stable', async () => {
    renderDesktop();
    const viewer = await screen.findByTestId('viewer-lane');

    resizeTo(compactWorkspaceWidth - 1);
    expect(screen.getByTestId('chat-lane').closest('[data-pane]')).toHaveAttribute('data-visible', 'true');
    expect(screen.getByTestId('workbench-lane').closest('[data-pane]')).toHaveAttribute('data-visible', 'false');
    expect(screen.getByTestId('viewer-lane')).toBe(viewer);

    resizeTo(compactWorkspaceWidth);
    expect(screen.getByTestId('chat-lane').closest('[data-pane]')).toHaveAttribute('data-visible', 'true');
    expect(screen.getByTestId('workbench-lane').closest('[data-pane]')).toHaveAttribute('data-visible', 'true');
    expect(screen.getByTestId('viewer-lane')).toBe(viewer);
    expect(document.querySelectorAll('[data-pane]')).toHaveLength(3);
  });

  it('keeps the Viewer mounted when both auxiliary lanes are closed', async () => {
    desktopLayout.chatOpen = false;
    desktopLayout.workbenchOpen = false;
    renderDesktop();
    const viewer = await screen.findByTestId('viewer-lane');

    resizeTo(compactWorkspaceWidth - 1);
    expect(screen.getByTestId('chat-lane').closest('[data-pane]')).toHaveAttribute('data-visible', 'false');
    expect(screen.getByTestId('workbench-lane').closest('[data-pane]')).toHaveAttribute('data-visible', 'false');
    expect(screen.getByTestId('viewer-lane')).toBe(viewer);
    expect(document.querySelectorAll('[data-pane]')).toHaveLength(3);
  });

  it('keeps one workbench toggle mounted at the workspace top-right across state changes', async () => {
    const user = userEvent.setup();
    renderDesktop();
    const toggle = await screen.findByRole('button', { name: 'Toggle Workbench lane' });

    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(toggle).toHaveClass(
      '!size-7',
      'rounded-sm',
      'hover:!bg-muted-foreground/15',
      'aria-pressed:bg-muted-foreground/15',
    );
    expect(toggle.parentElement).toHaveClass('absolute', 'top-1', 'right-1', 'z-10');
    expect(document.querySelector('[data-project-workspace]')).toHaveClass('relative');

    await user.click(toggle);
    expect(setWorkbenchOpen).toHaveBeenCalledExactlyOnceWith(false);

    desktopLayout.workbenchOpen = false;
    resizeTo(compactWorkspaceWidth - 1);

    const closedToggle = screen.getByRole('button', { name: 'Toggle Workbench lane' });
    expect(closedToggle).toBe(toggle);
    await waitFor(() => {
      expect(closedToggle).toHaveAttribute('aria-pressed', 'false');
    });

    await user.click(closedToggle);
    expect(setWorkbenchOpen).toHaveBeenLastCalledWith(true);
  });

  it('does not render a workspace-global Files toggle', async () => {
    renderDesktop();

    await screen.findByRole('button', { name: 'Toggle Workbench lane' });
    expect(screen.queryByRole('button', { name: /files pane/i })).not.toBeInTheDocument();
  });
});
