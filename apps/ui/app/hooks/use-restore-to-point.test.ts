import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRestoreToPoint } from '#hooks/use-restore-to-point.js';
import { useRevisionActor } from '#routes/w.$workspace.$project/revision-provider.js';
import { useOptionalChatWorkspaceAuthority } from '#providers/chat-workspace-authority-provider.js';
import type { RestoreTarget } from '#machines/revision.machine.js';

vi.mock('#routes/w.$workspace.$project/revision-provider.js', () => ({ useRevisionActor: vi.fn() }));
vi.mock('#providers/chat-workspace-authority-provider.js', () => ({
  useOptionalChatWorkspaceAuthority: vi.fn(),
}));
vi.mock('@xstate/react', () => ({ useSelector: () => false }));

const send = vi.fn();
const actor = { send } as unknown as ReturnType<typeof useRevisionActor>;

const mount = (checkout?: ReturnType<typeof vi.fn>) => {
  vi.mocked(useRevisionActor).mockReturnValue(actor);
  vi.mocked(useOptionalChatWorkspaceAuthority).mockReturnValue(
    checkout === undefined
      ? undefined
      : ({ checkout } as unknown as ReturnType<typeof useOptionalChatWorkspaceAuthority>),
  );
  return renderHook(() => useRestoreToPoint());
};

describe('useRestoreToPoint', () => {
  it('checks the stored revision out before the machine replays the transcript', async () => {
    send.mockClear();
    const checkout = vi.fn().mockResolvedValue([]);
    const { result } = mount(checkout);
    const target: RestoreTarget = {
      messageId: 'u1',
      anchor: 100,
      identitySource: 'authoritative',
      revisionId: 'a'.repeat(40),
    };

    await act(async () => {
      result.current.restore(target);
    });

    // The store decides the tree; the machine keeps `Current`, `dirty` and undo.
    expect(checkout).toHaveBeenCalledExactlyOnceWith('a'.repeat(40));
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'RESTORE', target });
  });

  it('replays the transcript alone for a node the revision store does not hold', async () => {
    send.mockClear();
    const checkout = vi.fn().mockResolvedValue([]);
    const { result } = mount(checkout);
    const target: RestoreTarget = { messageId: 'u1', anchor: 100, identitySource: 'transcript' };

    await act(async () => {
      result.current.restore(target);
    });

    expect(checkout).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'RESTORE', target });
  });

  it('still restores when the checkout fails, so a click never vanishes', async () => {
    send.mockClear();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const checkout = vi.fn().mockRejectedValue(new Error('REVISION_NOT_FOUND'));
    const { result } = mount(checkout);
    const target: RestoreTarget = {
      messageId: 'u1',
      anchor: 100,
      identitySource: 'authoritative',
      revisionId: 'b'.repeat(40),
    };

    await act(async () => {
      result.current.restore(target);
    });

    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'RESTORE', target });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
