import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type * as ProjectWorkspaceContext from '#routes/w.$workspace.$project/project-workspace-context.js';

const send = vi.fn();
const setWorkbenchOpen = vi.hoisted(() => vi.fn());
const sidebar = vi.hoisted(() => ({ open: true }));
const desktopLayout = {
  chatOpen: true,
  workbenchOpen: true,
  chatWidth: 320,
  workbenchWidth: 420,
  compactAuxiliary: 'chat' as 'chat' | 'workbench',
};
const editorState = { isReady: true };
const snapshot = {
  context: { panelState: { desktopLayout } },
  matches: () => editorState.isReady,
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
  ChatHistory: ({ className }: { readonly className?: string }) => (
    <div className={className} data-testid='chat-lane' />
  ),
}));
vi.mock('#routes/w.$workspace.$project/focused-chat-gate.js', () => ({
  ChatHistoryGate: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  ChatInterfaceSessionGate: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  ChatPaneSkeleton: () => <div data-testid='chat-skeleton' />,
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
vi.mock('#components/ui/sidebar.js', () => ({ useSidebar: () => sidebar }));
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
const { revealDelayMilliseconds } = await import('./workspace-skeleton.js');

const renderDesktop = () =>
  render(
    <TooltipProvider>
      <ChatInterfaceDesktop />
    </TooltipProvider>,
  );

const resizeTo = (width: number): void => {
  act(() => {
    const entry: ResizeObserverEntry = {
      borderBoxSize: [{ inlineSize: width, blockSize: 800 }],
      contentBoxSize: [{ inlineSize: width, blockSize: 800 }],
      contentRect: DOMRect.fromRect({ width, height: 800 }),
      devicePixelContentBoxSize: [{ inlineSize: width, blockSize: 800 }],
      target: document.body,
    };
    for (const callback of resizeCallbacks) {
      callback([entry], resizeObserver);
    }
  });
};

describe('ChatInterfaceDesktop', () => {
  beforeEach(() => {
    resizeCallbacks.clear();
    desktopLayout.chatOpen = true;
    desktopLayout.workbenchOpen = true;
    desktopLayout.compactAuxiliary = 'chat';
    editorState.isReady = true;
    sidebar.open = true;
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

  /* The editor state loads from storage before the lanes can take their
   * persisted widths; the lanes stand in at their defaults, never a blank. */
  it('shows the workspace skeleton instead of a blank while the editor state loads', async () => {
    editorState.isReady = false;
    /* Inside the load's first blink, where the lanes still ease in. */
    const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
    renderDesktop();

    const skeleton = await screen.findByRole('status', { name: 'Opening project' });
    expect(skeleton).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('chat-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('allotment')).not.toBeInTheDocument();
    /* The workbench lane drops at the compact width through the skeleton's own container query,
     * which jsdom does not evaluate: the class is the assertion, the width is checked in a browser. */
    const workbenchLane = skeleton.querySelector('.border-l');
    expect(workbenchLane).toHaveClass('@min-[1120px]:flex');
    expect(compactWorkspaceWidth).toBe(1120);
    /* The frame paints at once; its lanes wait out a blink, so a warm load never flashes them. */
    expect(skeleton).toHaveClass('bg-background');
    expect(skeleton.querySelector('[data-slot="workspace-skeleton-lanes"]')).toHaveClass(
      'animate-in',
      'fade-in',
      'fill-mode-both',
      '[animation-delay:300ms]',
      'motion-reduce:animate-none',
    );
    clock.mockRestore();
  });

  /* Opening a project hands the skeleton from gate to gate. The blink belongs to the load, not to
   * each mount, or the lanes would fade in again at every handover and spend the wait invisible. */
  it('spends the blink once per load, so a later gate shows the lanes at once', async () => {
    editorState.isReady = false;
    const clock = vi.spyOn(performance, 'now').mockReturnValue(revealDelayMilliseconds);
    renderDesktop();

    const skeleton = await screen.findByRole('status', { name: 'Opening project' });
    expect(skeleton.querySelector('[data-slot="workspace-skeleton-lanes"]')).not.toHaveClass('animate-in');
    clock.mockRestore();
  });

  it('reserves fixed-control space inside the chat header without shifting its border', async () => {
    sidebar.open = false;
    renderDesktop();
    expect(await screen.findByTestId('chat-lane')).toHaveClass(
      '[&>[data-slot=floating-panel-content]>[data-slot=floating-panel-content-header]]:pl-(--titlebar-controls-width)',
      '[&>[data-slot=floating-panel-content]>[data-slot=floating-panel-content-header]]:[app-region:no-drag]',
    );
  });

  it('reserves fixed-control space inside the viewer header without shifting its border', async () => {
    desktopLayout.chatOpen = false;
    sidebar.open = false;
    renderDesktop();
    const viewer = await screen.findByTestId('viewer-lane');
    expect(viewer.parentElement).toHaveClass('[&_.dv-tabs-and-actions-container]:pl-(--titlebar-controls-width)');
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
    expect(toggle).toHaveClass('!size-7', 'rounded-sm', 'hover:!bg-accent', 'aria-pressed:bg-accent');
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
