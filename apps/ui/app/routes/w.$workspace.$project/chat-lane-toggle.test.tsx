import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { IDockviewHeaderActionsProps } from 'dockview-react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type * as SidebarStatus from '#hooks/use-sidebar-status.js';
import type { ChatSidebarStatus } from '#hooks/use-sidebar-status.js';
import type * as ProjectWorkspaceContext from '#routes/w.$workspace.$project/project-workspace-context.js';
import { WorkspaceLanesContext } from '#routes/w.$workspace.$project/project-workspace-context.js';

const state = vi.hoisted(() => ({
  isMobile: false,
  isTopLeft: true,
  status: undefined as ChatSidebarStatus | undefined,
}));
const setChatOpen = vi.hoisted(() => vi.fn());

vi.mock('@xstate/react', () => ({
  useSelector: (actor: { getSnapshot: () => unknown }, selector: (snapshot: unknown) => unknown) =>
    selector(actor.getSnapshot()),
}));
vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    projectId: 'proj_one',
    editorRef: { getSnapshot: () => ({ context: { focusedChatId: 'chat_active' } }) },
  }),
}));
vi.mock('#hooks/use-sidebar-status.js', async (importOriginal) => ({
  ...(await importOriginal<typeof SidebarStatus>()),
  useChatSidebarStatus: () => state.status,
}));
vi.mock('#components/panes/use-is-top-right-group.js', () => ({
  useIsTopLeftGroup: () => state.isTopLeft,
}));
vi.mock('#components/ui/sidebar.js', () => ({ useSidebar: () => ({ isMobile: state.isMobile }) }));
vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', async (importOriginal) => ({
  ...(await importOriginal<typeof ProjectWorkspaceContext>()),
  useProjectWorkspace: () => ({ setChatOpen }),
}));

const { ChatLaneToggle, ViewerChatLaneToggle } = await import('#routes/w.$workspace.$project/chat-lane-toggle.js');

const approval: ChatSidebarStatus = {
  state: 'approval',
  unread: false,
  toolName: undefined,
  pendingApprovalCount: 2,
  failureReason: undefined,
  branch: undefined,
  dirty: false,
};

const chatOpen = { chat: true, workbench: true };
const chatHidden = { chat: false, workbench: true };

// StrictMode, as the dev server runs it: its double effect once spent the focus claim early.
const withLanes = (ui: React.ReactElement, chat: boolean): React.JSX.Element => (
  <StrictMode>
    <TooltipProvider>
      <WorkspaceLanesContext.Provider value={chat ? chatOpen : chatHidden}>{ui}</WorkspaceLanesContext.Provider>
    </TooltipProvider>
  </StrictMode>
);
const renderWithLanes = (ui: React.ReactElement, chat: boolean) => render(withLanes(ui, chat));

const headerProperties = {} as unknown as IDockviewHeaderActionsProps;

describe('ChatLaneToggle', () => {
  beforeEach(() => {
    state.isMobile = false;
    state.isTopLeft = true;
    state.status = undefined;
    vi.clearAllMocks();
  });

  it('is pressed in the lane header, advertises ⌃C, and closes the lane', async () => {
    const user = userEvent.setup();
    renderWithLanes(<ChatLaneToggle place='lane' />, true);

    const toggle = screen.getByRole('button', { name: 'Toggle Chat lane' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(toggle).toHaveAttribute('aria-keyshortcuts', 'Control+C');
    await user.click(toggle);

    expect(setChatOpen).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('never marks the open lane: the lane owns its own state (R3)', () => {
    state.status = approval;
    const { container } = renderWithLanes(<ChatLaneToggle place='lane' />, true);

    expect(container.querySelector('[data-slot="chat-toggle-mark"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Toggle Chat lane' })).not.toHaveAccessibleDescription();
  });

  it('carries the sidebar mark and its sentence while the lane is hidden, without the count', () => {
    state.status = approval;
    const { container } = renderWithLanes(<ChatLaneToggle place='viewer' />, false);

    const toggle = screen.getByRole('button', { name: 'Toggle Chat lane' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle).toHaveAccessibleDescription('Needs your approval · 2');
    const mark = container.querySelector('[data-slot="chat-toggle-mark"]');
    expect(mark).toHaveAttribute('data-mark', 'attention');
    expect(mark).toHaveAttribute('aria-hidden', 'true');
    // D16's numeral would hang into the tab; the description carries the count.
    expect(mark).not.toHaveTextContent('2');
  });

  it('shows no mark for a quiet chat', () => {
    const { container } = renderWithLanes(<ChatLaneToggle place='viewer' />, false);

    expect(container.querySelector('[data-slot="chat-toggle-mark"]')).toBeNull();
  });

  it('hands keyboard focus to the other mount (B-2)', async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithLanes(<ChatLaneToggle place='viewer' />, false);
    await user.tab();
    await user.keyboard('{Enter}');
    expect(setChatOpen).toHaveBeenCalledExactlyOnceWith(true);

    rerender(withLanes(<ChatLaneToggle place='lane' />, true));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Toggle Chat lane' })).toHaveFocus();
    });
  });
});

describe('ViewerChatLaneToggle', () => {
  beforeEach(() => {
    state.isMobile = false;
    state.isTopLeft = true;
  });

  it('heads the top-left group only while the chat lane is hidden', () => {
    const { container } = renderWithLanes(<ViewerChatLaneToggle {...headerProperties} />, false);
    expect(screen.getByRole('button', { name: 'Toggle Chat lane' }).parentElement).toHaveClass('pl-1');
    container.remove();

    const visible = renderWithLanes(<ViewerChatLaneToggle {...headerProperties} />, true);
    expect(visible.container).toBeEmptyDOMElement();
  });

  it('stays out of every other group and off mobile', () => {
    state.isTopLeft = false;
    expect(renderWithLanes(<ViewerChatLaneToggle {...headerProperties} />, false).container).toBeEmptyDOMElement();

    state.isTopLeft = true;
    state.isMobile = true;
    expect(renderWithLanes(<ViewerChatLaneToggle {...headerProperties} />, false).container).toBeEmptyDOMElement();
  });
});
