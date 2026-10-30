import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const editorRef = { kind: 'editor' };
const projectRef = { kind: 'project' };
const createChat = vi.fn();
const updateChatName = vi.fn();
const navigate = vi.fn();
const exportTranscript = vi.fn();
const transcript = vi.hoisted(() => ({ canExport: true }));
const sidebar = vi.hoisted(() => ({ isMobile: false, open: true }));
const naming = vi.hoisted(() => ({ isGenerating: false }));
let keybindingHandler: (() => Promise<void>) | undefined;

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ editorRef, projectRef, projectId: 'proj_one' }),
}));
vi.mock('#hooks/use-chats.js', () => ({
  useChats: () => ({
    createChat,
    updateChatName,
    applyGeneratedChatName: vi.fn(),
    isLoading: false,
  }),
}));
vi.mock('#hooks/use-chat-records.js', () => ({
  useChatRecords: () => ({
    chats: [
      { id: 'chat_active', resourceId: 'proj_one', name: 'Bracket design', createdAt: 1, updatedAt: 1 },
      { id: 'chat_newer', resourceId: 'proj_one', name: 'Gear ratio study', createdAt: 2, updatedAt: 5 },
      { id: 'chat_trashed', resourceId: 'proj_one', name: 'Trashed sketch', createdAt: 3, updatedAt: 9, deletedAt: 9 },
    ],
    isLoading: false,
  }),
}));
vi.mock('#hooks/use-chat.js', () => ({ useChatSelector: () => undefined }));
vi.mock('@xstate/react', () => ({
  useSelector: (actor: { readonly kind: string }, selector: (state: { context: Record<string, unknown> }) => unknown) =>
    selector({
      context:
        actor.kind === 'editor'
          ? { focusedChatId: 'chat_active' }
          : { isLoading: false, project: { name: 'Rotor housing' } },
    }),
}));
vi.mock('#routes/w.$workspace.$project/use-active-chat-naming.js', () => ({
  useActiveChatNaming: () => naming.isGenerating,
}));
vi.mock('#hooks/use-project-slug-route.js', () => ({
  useProjectSlugs: () => ({ status: 'resolved', value: { workspaceSlug: 'home', projectSlug: 'bracket' } }),
}));
vi.mock('@taucad/ui/components/keyboard', () => ({
  useKeybinding: (_keys: unknown, handler: () => Promise<void>) => {
    keybindingHandler = handler;
    return { formattedKeyCombination: 'Ctrl+Shift+C' };
  },
}));
vi.mock('#components/ui/sidebar.js', () => ({ useSidebar: () => sidebar }));
vi.mock('react-router', () => ({ useNavigate: () => navigate, Link: () => null }));
vi.mock('#routes/w.$workspace.$project/chat-history-settings.js', () => ({
  useExportTranscript: () => ({ canExport: transcript.canExport, exportTranscript }),
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
  FloatingPanelContentHeaderActions: ({
    children,
    className,
  }: {
    readonly children: ReactNode;
    readonly className?: string;
  }) => <div className={className}>{children}</div>,
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
      const options = screen.getByRole('button', { name: 'Chat options' });
      expect(name.parentElement?.parentElement).toContainElement(options);
      expect(options.parentElement?.parentElement).toHaveClass('md:absolute', 'md:right-0');
      // A touch tablet keeps this desktop row, and has no hover to reveal the menu (I2, D12).
      expect(options.parentElement?.parentElement).toHaveClass('pointer-coarse:opacity-100');
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

  describe('phone chat switcher (CH-09)', () => {
    const openSwitcher = async (user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> => {
      await user.click(screen.getByRole('button', { name: /^Bracket design, Chats in Rotor housing$/ }));
      return screen.findByRole('dialog', { name: 'Chats in Rotor housing' });
    };

    beforeEach(() => {
      sidebar.isMobile = true;
      transcript.canExport = true;
    });

    const title = (): HTMLElement => screen.getByRole('button', { name: /^Bracket design, Chats in Rotor housing$/ });

    // A short name showed its tail faded out, as if clipped: the name ellipsizes only when it overflows.
    it('should show the chat name whole, ellipsized only on overflow, never faded', () => {
      render(<ChatTitleBar />);

      const name = within(title()).getByText('Bracket design');
      expect(name).toHaveClass('truncate', 'min-w-0');
      expect(name).not.toHaveClass('fade-label');
    });

    it('should close only the switcher on Escape and give focus back to the title', async () => {
      const user = userEvent.setup();
      render(<ChatTitleBar closeButton={<button type='button'>Close chat</button>} />);

      const sheet = await openSwitcher(user);
      fireEvent.keyDown(sheet, { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'Chats in Rotor housing' })).not.toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: 'Close chat' })).toBeInTheDocument();
      await waitFor(() => {
        expect(title()).toHaveFocus();
      });
    });

    it('should export the transcript and give focus back to the title', async () => {
      const user = userEvent.setup();
      render(<ChatTitleBar />);

      const sheet = await openSwitcher(user);
      fireEvent.click(within(sheet).getByRole('button', { name: 'Export transcript' }));

      expect(exportTranscript).toHaveBeenCalledTimes(1);
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      await waitFor(() => {
        expect(title()).toHaveFocus();
      });
    });

    it('should give focus back to the title after switching chat or picking the open one', async () => {
      const user = userEvent.setup();
      render(<ChatTitleBar />);

      let sheet = await openSwitcher(user);
      fireEvent.click(within(sheet).getByRole('button', { name: 'Bracket design' }));
      await waitFor(() => {
        expect(title()).toHaveFocus();
      });
      // The open chat is already open: nothing navigates.
      expect(navigate).not.toHaveBeenCalled();

      sheet = await openSwitcher(user);
      fireEvent.click(within(sheet).getByRole('button', { name: 'Gear ratio study' }));
      await waitFor(() => {
        expect(title()).toHaveFocus();
      });
      expect(navigate).toHaveBeenCalledWith('/w/home/bracket?chat=chat_newer', { state: { openChat: true } });
    });

    it('should disable Export when the chat has no transcript', async () => {
      transcript.canExport = false;
      const user = userEvent.setup();
      render(<ChatTitleBar />);

      const sheet = await openSwitcher(user);
      const exportRow = within(sheet).getByRole('button', { name: 'Export transcript' });
      expect(exportRow).toBeDisabled();
      fireEvent.click(exportRow);
      expect(exportTranscript).not.toHaveBeenCalled();
    });

    it('should give the switcher a 44px close control', async () => {
      const user = userEvent.setup();
      render(<ChatTitleBar />);

      const sheet = await openSwitcher(user);
      expect(within(sheet).getByRole('button', { name: 'Close chats' })).toHaveClass('size-11');
    });

    /* Rows are clicked with `fireEvent`: vaul’s pointer handlers need layout jsdom does not have. */
    it('should open this project’s chats, most recent first, with New chat leading', async () => {
      const user = userEvent.setup();
      render(<ChatTitleBar closeButton={<button type='button'>Close chat</button>} />);

      const sheet = await openSwitcher(user);
      const rows = within(within(sheet).getByRole('list', { name: 'Chats' })).getAllByRole('button');
      expect(rows.map((row) => row.textContent)).toEqual(['New chat', 'Gear ratio study', 'Bracket design']);
      expect(within(sheet).getByRole('button', { name: 'Bracket design' })).toHaveAttribute('aria-current', 'true');
      expect(within(sheet).getByRole('button', { name: 'Gear ratio study' })).not.toHaveAttribute('aria-current');
      // A chat in Trash is not offered.
      expect(within(sheet).queryByText('Trashed sketch')).not.toBeInTheDocument();
      // Each row is a 44px target (I3).
      for (const row of rows) {
        expect(row).toHaveClass('h-11');
      }
    });

    it('should open a picked chat and close the switcher', async () => {
      const user = userEvent.setup();
      render(<ChatTitleBar />);

      const sheet = await openSwitcher(user);
      fireEvent.click(within(sheet).getByRole('button', { name: 'Gear ratio study' }));

      expect(navigate).toHaveBeenCalledWith('/w/home/bracket?chat=chat_newer', { state: { openChat: true } });
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'Chats in Rotor housing' })).not.toBeInTheDocument();
      });
    });

    it('should start a new chat that asks for the composer’s focus', async () => {
      const user = userEvent.setup();
      render(<ChatTitleBar />);

      const sheet = await openSwitcher(user);
      fireEvent.click(within(sheet).getByRole('button', { name: 'New chat' }));

      await waitFor(() => {
        expect(navigate).toHaveBeenCalledWith('/w/home/bracket?chat=chat_new', {
          state: { focusChatComposer: true },
        });
      });
      expect(createChat).toHaveBeenCalledWith({ name: 'New chat', messages: [] });
    });

    it('should rename and export the open chat from the switcher', async () => {
      const user = userEvent.setup();
      render(<ChatTitleBar />);

      let sheet = await openSwitcher(user);
      fireEvent.click(within(sheet).getByRole('button', { name: 'Export transcript' }));
      expect(exportTranscript).toHaveBeenCalledTimes(1);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      sheet = await openSwitcher(user);
      fireEvent.click(within(sheet).getByRole('button', { name: 'Rename this chat' }));

      // The editor starts once the sheet has gone, and takes focus from it.
      const field = await screen.findByRole('textbox', { name: 'Chat name' });
      expect(field).toHaveValue('Bracket design');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await waitFor(() => {
        expect(field).toHaveFocus();
      });
    });

    it('should leave the desktop title a plain name with no switcher', () => {
      sidebar.isMobile = false;
      render(<ChatTitleBar />);

      expect(screen.queryByRole('button', { name: /Chats in/ })).not.toBeInTheDocument();
      expect(screen.getByText('Bracket design').tagName).toBe('SPAN');
    });
  });
});
