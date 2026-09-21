// @vitest-environment jsdom
/**
 * The composer's branch picker (S23, A29, canvas `ComposerPicker`).
 *
 * It replaces the deleted `chat-revision-selector` and its modes: what a chat
 * can say about placement is which branch it works in. The picker is the one
 * control that exists at *one* branch, so it is also the only way out of a
 * fresh project — the pane's *Branches* region appears at two (S26), and a
 * region that needs a second branch cannot be where the second branch is made.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { ChatBranchPicker } from '#components/chat/chat-branch-picker.js';
import { revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';

let activeChatId: string | undefined = 'chat-1';
vi.mock('#hooks/active-chat-provider.js', () => ({
  useChatComposer: () => ({ session: activeChatId === undefined ? undefined : { activeChatId } }),
}));

let project: { projectId: string } | undefined = { projectId: 'p' };
vi.mock('#hooks/use-project.js', () => ({ useProject: () => project }));

vi.mock('#hooks/use-revision-status.js', async () => {
  const harness = await import('#hooks/use-revision-status.test-harness.js');
  return harness.revisionStatusMock();
});

const wrapper = ({ children }: { readonly children: ReactNode }): React.JSX.Element => (
  <TooltipProvider>{children}</TooltipProvider>
);

const patchChat = vi.fn();
let chats = [{ id: 'chat-1', checkoutId: 'live' }];
vi.mock('#hooks/use-chats.js', () => ({ useChats: () => ({ chats, patchChat }) }));

/* P1: the authority is the only writer of `Chat.checkoutId`. The picker says
 * where the chat works and hands over the verb that settles it; it never
 * writes the record itself. */
const placeChat = vi.fn<(chatId: string, target: unknown) => Promise<void>>(async () => undefined);
vi.mock('#providers/chat-workspace-authority-provider.js', () => ({
  useOptionalChatWorkspaceAuthority: () => ({ placeChat }),
}));

const twoBranches = [
  { name: 'main', head: undefined, checkoutId: 'live', checkoutRoot: '/projects/p', leaseChatIds: [] },
  {
    name: 'bracket-fillet',
    head: undefined,
    checkoutId: 'co-2',
    checkoutRoot: '/checkouts/co-2',
    leaseChatIds: ['chat-1'],
  },
];

beforeEach(() => {
  globalThis.HTMLElement.prototype.scrollIntoView = vi.fn();
  revisionStatusHarness.reset();
  activeChatId = 'chat-1';
  project = { projectId: 'p' };
  chats = [{ id: 'chat-1', checkoutId: 'live' }];
  patchChat.mockReset();
  placeChat.mockClear();
});

describe('ChatBranchPicker', () => {
  it('makes the second branch of a fresh project, which nothing else can (R1)', async () => {
    const user = userEvent.setup();

    render(<ChatBranchPicker />, { wrapper });
    await user.click(screen.getByRole('button', { name: 'Work in main. Choose a branch.' }));
    await user.click(screen.getByRole('button', { name: 'New branch' }));
    await user.type(screen.getByRole('textbox', { name: 'Name for the new branch' }), 'bracket-fillet');
    await user.click(screen.getByRole('button', { name: 'Create branch' }));

    expect(revisionStatusHarness.commands.createBranch).toHaveBeenCalledWith('bracket-fillet');
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'New branch' })).not.toBeInTheDocument();
    });
  });

  it('works in the branch it creates', async () => {
    const user = userEvent.setup();
    render(<ChatBranchPicker />, { wrapper });
    await user.click(screen.getByRole('button', { name: 'Work in main. Choose a branch.' }));
    await user.click(screen.getByRole('button', { name: 'New branch' }));
    await user.type(screen.getByRole('textbox', { name: 'Name for the new branch' }), 'bracket-fillet');
    await user.click(screen.getByRole('button', { name: 'Create branch' }));

    /* The settling verb itself is the placement, so an admission racing it
       waits for it (Q2) — there is no window in which the record still names
       the branch the person moved away from. */
    expect(revisionStatusHarness.commands.createBranch).toHaveBeenCalledWith('bracket-fillet');
    expect(placeChat).toHaveBeenCalledTimes(1);
    expect(patchChat).not.toHaveBeenCalled();
    const [placedChatId, target] = placeChat.mock.calls[0] ?? [];
    expect(placedChatId).toBe('chat-1');
    await expect(Promise.resolve(target)).resolves.toEqual({
      branch: 'bracket-fillet',
      checkoutId: 'checkout-bracket-fillet',
      checkoutRoot: '/checkouts/checkout-bracket-fillet',
    });
  });

  it('names the branch this chat works in, and switches to the one a person picks', async () => {
    const user = userEvent.setup();
    chats = [{ id: 'chat-1', checkoutId: 'co-2' }];
    revisionStatusHarness.status = { ...revisionStatusHarness.status, branch: 'main', branches: twoBranches };

    render(<ChatBranchPicker />, { wrapper });
    await user.click(screen.getByRole('button', { name: 'Work in bracket-fillet. Choose a branch.' }));
    await user.type(screen.getByPlaceholderText('Search branches...'), 'main');
    await user.click(screen.getByRole('option', { name: 'main' }));

    expect(placeChat).toHaveBeenCalledWith('chat-1', 'live');
  });

  it('falls back to the workbench branch for a chat that has not run yet', () => {
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      branch: 'main',
      branches: [
        { name: 'main', head: undefined, checkoutId: 'live', checkoutRoot: '/projects/p', leaseChatIds: [] },
        {
          name: 'enclosure-v2',
          head: undefined,
          checkoutId: 'co-3',
          checkoutRoot: '/checkouts/co-3',
          leaseChatIds: ['chat-9'],
        },
      ],
    };

    render(<ChatBranchPicker />, { wrapper });

    expect(screen.getByRole('button', { name: 'Work in main. Choose a branch.' })).toBeInTheDocument();
  });

  it('does not claim a deleted chat checkout is the workbench and allows explicit recovery', async () => {
    const user = userEvent.setup();
    chats = [{ id: 'chat-1', checkoutId: 'deleted-checkout' }];
    render(<ChatBranchPicker />, { wrapper });
    expect(screen.queryByRole('button', { name: 'Work in main. Choose a branch.' })).not.toBeInTheDocument();
    expect(placeChat).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Branch unavailable. Choose a branch.' }));
    await user.click(screen.getByRole('option', { name: 'main' }));
    expect(placeChat).toHaveBeenCalledWith('chat-1', 'live');
  });

  it('says nothing at all before the project root has answered', () => {
    revisionStatusHarness.connected = false;

    const { container } = render(<ChatBranchPicker />, { wrapper });

    expect(container).toBeEmptyDOMElement();
  });

  it('is inert where no project is mounted, rather than reading a root that is not there', () => {
    project = undefined;

    const { container } = render(<ChatBranchPicker />, { wrapper });

    expect(container).toBeEmptyDOMElement();
  });
});
