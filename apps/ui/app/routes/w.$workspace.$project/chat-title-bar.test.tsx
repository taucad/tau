import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const editorRef = { kind: 'editor' };
const projectRef = { kind: 'project' };
const createChat = vi.fn();
const updateChatName = vi.fn();
const navigate = vi.fn();
const sidebar = vi.hoisted(() => ({ isMobile: false, open: true }));
const naming = vi.hoisted(() => ({ isGenerating: false }));
let keybindingHandler: (() => Promise<void>) | undefined;

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ editorRef, projectRef, projectId: 'proj_one' }),
}));
vi.mock('#hooks/use-chats.js', () => ({
  useChats: () => ({
    chats: [
      {
        id: 'chat_active',
        resourceId: 'proj_one',
        name: 'Bracket design',
        messages: [],
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    createChat,
    updateChatName,
    applyGeneratedChatName: vi.fn(),
    isLoading: false,
  }),
}));
vi.mock('@xstate/react', () => ({
  useSelector: (actor: { readonly kind: string }, selector: (state: { context: Record<string, unknown> }) => unknown) =>
    selector({ context: actor.kind === 'editor' ? { focusedChatId: 'chat_active' } : { isLoading: false } }),
}));
vi.mock('#routes/w.$workspace.$project/use-active-chat-naming.js', () => ({
  useActiveChatNaming: () => naming.isGenerating,
}));
vi.mock('#hooks/use-project-slug-route.js', () => ({
  useProjectSlugs: () => ({ status: 'resolved', value: { workspaceSlug: 'home', projectSlug: 'bracket' } }),
}));
vi.mock('#hooks/use-keyboard.js', () => ({
  useKeybinding: (_keys: unknown, handler: () => Promise<void>) => {
    keybindingHandler = handler;
    return { formattedKeyCombination: 'Ctrl+Shift+C' };
  },
}));
vi.mock('#components/ui/sidebar.js', () => ({ useSidebar: () => sidebar }));
vi.mock('react-router', () => ({ useNavigate: () => navigate, Link: () => null }));
vi.mock('#routes/w.$workspace.$project/chat-history-settings.js', () => ({
  ChatHistorySettings: ({ onRename }: { readonly onRename: () => void }) => (
    <>
      <button type='button'>Chat options</button>
      <button type='button' onClick={onRename}>
        Rename
      </button>
    </>
  ),
}));
vi.mock('@taucad/ui/components/tooltip', () => ({
  Tooltip: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { readonly children: ReactNode }) => <span>{children}</span>,
  TooltipContent: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('#components/ui/floating-panel.js', () => ({
  FloatingPanelContentHeaderActions: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
  FloatingPanelButtonGroup: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
}));

/* The toggle has its own suite (`chat-lane-toggle.test.tsx`); here it only has to lead the row. */
vi.mock('#routes/w.$workspace.$project/chat-lane-toggle.js', () => ({
  ChatLaneToggle: () => <button type='button'>Toggle Chat lane</button>,
}));

const { ChatTitleBar } = await import('#routes/w.$workspace.$project/chat-title-bar.js');
const { WorkspaceLanesContext } = await import('#routes/w.$workspace.$project/project-workspace-context.js');

const bothLanes = { chat: true, workbench: true };
const withChatLane = (ui: React.ReactElement): React.JSX.Element => (
  <WorkspaceLanesContext.Provider value={bothLanes}>{ui}</WorkspaceLanesContext.Provider>
);

describe('ChatTitleBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sidebar.isMobile = false;
    sidebar.open = true;
    naming.isGenerating = false;
    createChat.mockResolvedValue({ id: 'chat_new' });
    updateChatName.mockResolvedValue(undefined);
    navigate.mockResolvedValue(undefined);
  });

  describe('name', () => {
    it('should carry the active chat name in the one header row, dissolving instead of truncating', () => {
      render(<ChatTitleBar closeButton={<button type='button'>Close chat</button>} />);

      const name = screen.getByText('Bracket design');
      // The box fills the row and dissolves at its edge; the text inside is the double-click
      // target, exempt from the desktop drag region so a double-click renames, not zooms.
      expect(name.parentElement).toHaveClass('fade-label', 'flex-1');
      expect(name).toHaveClass('[app-region:no-drag]');
      expect(name.parentElement).not.toHaveClass('truncate');
      expect(name).not.toHaveClass('truncate');
      expect(screen.getByRole('button', { name: 'Chat options' })).toBeInTheDocument();
      expect(screen.queryByText(/search chats/i)).not.toBeInTheDocument();
    });

    it('should lead with the chat lane toggle instead of a close control on desktop', () => {
      sidebar.open = false;
      render(withChatLane(<ChatTitleBar closeButton={<button type='button'>Close chat</button>} />));

      const buttons = screen.getAllByRole('button');
      expect(buttons[0]).toHaveAccessibleName('Toggle Chat lane');
      expect(buttons[1]).toHaveAccessibleName('New chat');
      expect(screen.queryByRole('button', { name: 'Close chat' })).not.toBeInTheDocument();
    });

    it('should leave the toggle to the viewer while the lane is hidden', () => {
      render(<ChatTitleBar />);

      expect(screen.queryByRole('button', { name: 'Toggle Chat lane' })).not.toBeInTheDocument();
    });

    it('should keep the close control on mobile, which has no lanes', () => {
      sidebar.isMobile = true;
      render(withChatLane(<ChatTitleBar closeButton={<button type='button'>Close chat</button>} />));

      expect(screen.getByRole('button', { name: 'Close chat' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Toggle Chat lane' })).not.toBeInTheDocument();
    });

    it('should mark the name busy and pulse while it is being generated', () => {
      naming.isGenerating = true;
      render(<ChatTitleBar />);

      const name = screen.getByText('Bracket design');
      expect(name).toHaveAttribute('aria-busy', 'true');
      expect(name).toHaveClass('animate-pulse');
    });
  });

  describe('rename', () => {
    it('should open the inline editor on double-click and save on Enter', async () => {
      const user = userEvent.setup();
      render(<ChatTitleBar />);

      await user.dblClick(screen.getByText('Bracket design'));

      const field = screen.getByRole('textbox', { name: 'Chat name' });
      expect(field).toHaveValue('Bracket design');
      expect(screen.queryByText('Bracket design')).not.toBeInTheDocument();
      // The field takes the row (the sidebar's editor preset hides the Save button), and it is
      // typeable on the desktop target, so the editor sits outside the header's drag region.
      expect(field.closest('[data-slot=inline-text-editor]')).toHaveClass(
        'flex-1',
        '[&_[data-slot=save-button]]:hidden',
        '[app-region:no-drag]',
      );

      await user.clear(field);
      await user.type(field, '  Gear housing  {Enter}');

      await waitFor(() => {
        expect(updateChatName).toHaveBeenCalledWith('chat_active', 'Gear housing');
      });
      expect(screen.queryByRole('textbox', { name: 'Chat name' })).not.toBeInTheDocument();
      expect(screen.getByText('Bracket design')).toBeInTheDocument();
    });

    it('should cancel on Escape without saving', async () => {
      const user = userEvent.setup();
      render(<ChatTitleBar />);

      await user.dblClick(screen.getByText('Bracket design'));
      await user.type(screen.getByRole('textbox', { name: 'Chat name' }), 'x{Escape}');

      expect(updateChatName).not.toHaveBeenCalled();
      expect(screen.queryByRole('textbox', { name: 'Chat name' })).not.toBeInTheDocument();
      expect(screen.getByText('Bracket design')).toBeInTheDocument();
    });

    it('should not save an empty name', async () => {
      const user = userEvent.setup();
      render(<ChatTitleBar />);

      await user.dblClick(screen.getByText('Bracket design'));
      const field = screen.getByRole('textbox', { name: 'Chat name' });
      await user.clear(field);
      await user.type(field, '   {Enter}');

      expect(updateChatName).not.toHaveBeenCalled();
      expect(screen.queryByRole('textbox', { name: 'Chat name' })).not.toBeInTheDocument();
    });

    it('should open the same editor from the menu', async () => {
      const user = userEvent.setup();
      render(<ChatTitleBar />);

      await user.click(screen.getByRole('button', { name: 'Rename' }));

      expect(screen.getByRole('textbox', { name: 'Chat name' })).toHaveValue('Bracket design');
    });
  });

  describe('new chat', () => {
    it('keeps Ctrl-Shift-C as a direct create-then-navigate action', async () => {
      render(<ChatTitleBar />);

      await keybindingHandler?.();
      expect(createChat).toHaveBeenCalledWith({ name: 'New chat', messages: [] });
      expect(navigate).toHaveBeenCalledWith('/w/home/bracket?chat=chat_new', {
        state: { focusChatComposer: true },
      });
    });

    it('shows a working new-chat button only with the desktop sidebar collapsed, with no separator', async () => {
      sidebar.open = false;
      const { container, rerender } = render(<ChatTitleBar />);

      fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
      await waitFor(() => {
        expect(navigate).toHaveBeenCalledWith('/w/home/bracket?chat=chat_new', {
          state: { focusChatComposer: true },
        });
      });
      expect(createChat).toHaveBeenCalledWith({ name: 'New chat', messages: [] });
      // The button is the header's first child; the host controls end one row-gap before it,
      // so a separator would only break the row it now belongs to.
      expect(container.querySelector('[data-slot=separator-root]')).toBeNull();

      sidebar.open = true;
      rerender(<ChatTitleBar />);
      expect(screen.queryByRole('button', { name: 'New chat' })).not.toBeInTheDocument();

      sidebar.open = false;
      sidebar.isMobile = true;
      rerender(<ChatTitleBar />);
      expect(screen.queryByRole('button', { name: 'New chat' })).not.toBeInTheDocument();
    });
  });
});
