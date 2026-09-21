// @vitest-environment jsdom
/**
 * AC14's second clause, at the seam that makes it real.
 *
 * The button, the command, the machine and the fact crossing the port are all
 * covered elsewhere; what this pins is the link that was missing — the fact
 * reaching a subscriber that seeds a chat and binds the conflict to its turn,
 * so *Ask chat to resolve* is a control that does something (review R2, P42).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { RevisionConflictChat } from '#routes/w.$workspace.$project/revision-conflict-chat.js';
import { revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';

const createChat = vi.hoisted(() => vi.fn(async (chat: Record<string, unknown>) => ({ ...chat, id: 'chat_seeded' })));
const setFocusedChatId = vi.hoisted(() => vi.fn());
const bindConflict = vi.hoisted(() => vi.fn());

vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'p', setFocusedChatId }) }));
vi.mock('#hooks/use-chats.js', () => ({ useChats: () => ({ createChat }) }));
vi.mock('#providers/chat-workspace-authority-provider.js', () => ({
  useChatWorkspaceAuthority: () => ({ bindConflict }),
}));
const errors: Array<{ title: string; description?: string }> = [];
vi.mock('#components/ui/sonner.js', () => ({
  toast: {
    error: (title: string, options?: { description?: string }) => {
      errors.push({ title, ...(options?.description === undefined ? {} : { description: options.description }) });
    },
  },
}));
vi.mock('#hooks/use-revision-status.js', async () => {
  const harness = await import('#hooks/use-revision-status.test-harness.js');
  return harness.revisionStatusMock();
});

beforeEach(() => {
  revisionStatusHarness.reset();
  errors.length = 0;
  vi.clearAllMocks();
});

describe('RevisionConflictChat', () => {
  it('seeds one chat with a startup request and binds the conflict to its placement', async () => {
    render(<RevisionConflictChat />);

    for (const listener of revisionStatusHarness.toasts) {
      listener({
        type: 'resolveWithChat',
        revisionId: 'rev-conflicted',
        checkoutId: 'checkout-fillet',
        paths: ['src/bracket.ts', 'params/wall.json'],
      });
    }

    await waitFor(() => {
      expect(createChat).toHaveBeenCalledTimes(1);
    });
    const [seeded] = createChat.mock.calls[0] ?? [];
    expect(seeded).toMatchObject({
      startupRequest: { kind: 'regenerate-tail', source: 'resolve-conflict-new-chat' },
    });
    /* The prompt names the files and leaves the three terms in the graph: the
       placement is what tells the agent where to read them (A22). */
    const [message] = (seeded as { messages: ReadonlyArray<{ parts: ReadonlyArray<{ text?: string }> }> }).messages;
    expect(message?.parts.map((part) => part.text ?? '').join('')).toContain('src/bracket.ts');

    await waitFor(() => {
      expect(bindConflict).toHaveBeenCalledWith('chat_seeded', {
        revisionId: 'rev-conflicted',
        paths: ['src/bracket.ts', 'params/wall.json'],
        checkoutId: 'checkout-fillet',
      });
    });
    expect(setFocusedChatId).toHaveBeenCalledWith('chat_seeded');
  });

  /* Rule 1: whatever threw here is an engine sentence — the page owns the
     words and the console owns the diagnostic (P4, E5). */
  it('says a seed failed in its own words, never in the error’s', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    createChat.mockRejectedValueOnce(new Error('checkout co-2 has no lease'));
    render(<RevisionConflictChat />);

    for (const listener of revisionStatusHarness.toasts) {
      listener({
        type: 'resolveWithChat',
        revisionId: 'rev-conflicted',
        checkoutId: 'checkout-fillet',
        paths: ['src/bracket.ts'],
      });
    }

    await waitFor(() => {
      expect(errors).toHaveLength(1);
    });
    expect(errors[0]).toEqual({
      title: 'Could not start a chat to resolve this',
      description: 'Tau could not start that chat. Try again.',
    });
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it('ignores every other fact on the channel', async () => {
    render(<RevisionConflictChat />);

    for (const listener of revisionStatusHarness.toasts) {
      listener({
        type: 'conflictText',
        revisionId: 'rev-conflicted',
        path: 'src/bracket.ts',
        text: '<<<<<<< main\n',
        ours: 'a\n',
        theirs: 'b\n',
      });
    }
    await Promise.resolve();

    expect(createChat).not.toHaveBeenCalled();
  });
});
