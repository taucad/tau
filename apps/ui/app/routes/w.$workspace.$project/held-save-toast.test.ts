/**
 * The held save's toast (V5 A6): the approved copy for each holder, and *Open chat* only for a run this window
 * follows.
 */

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { heldSaveCopy, useHeldSaveToast } from '#routes/w.$workspace.$project/held-save-toast.js';

const toastInfo = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());
type Runs = Record<string, { appendState: string }>;
const runs = vi.hoisted((): { value: Runs } => ({ value: {} }));

vi.mock('#components/ui/sonner.js', () => ({ toast: { info: toastInfo } }));
vi.mock('react-router', () => ({ useNavigate: () => navigate }));
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'p' }) }));
vi.mock('#hooks/use-chats.js', () => ({ useChats: () => ({ chats: [{ id: 'chat-mount', name: 'Mount holes' }] }) }));
vi.mock('#hooks/use-project-slug-route.js', () => ({
  useProjectSlugs: () => ({ status: 'resolved', value: { workspaceSlug: 'w', projectSlug: 'bracket' } }),
}));
vi.mock('#hooks/chat-session-store-provider.js', () => ({
  useChatSessionStore: () => ({ getProjection: () => ({ ledger: { runs: runs.value } }) }),
}));

const heldBy = { chatId: 'chat-mount', turnId: 'u7', runId: 'run-7', attempt: 1 };

beforeEach(() => {
  toastInfo.mockReset();
  navigate.mockReset();
  runs.value = {};
});

describe('heldSaveCopy', () => {
  it('says the edits are saved with the agent’s revision, wherever the run is (Q10 option A)', () => {
    expect(heldSaveCopy('Mount holes', 'thisWindow')).toEqual({
      title: 'Saving waits for “Mount holes”',
      description:
        'Its agent is changing these files. Your edits will be saved with the agent’s revision when it finishes.',
      canOpen: true,
    });
    expect(heldSaveCopy('Mount holes', 'otherWindow')).toEqual({
      title: 'Saving waits for “Mount holes”',
      description:
        'Its agent is changing these files in another window. Your edits will be saved with the agent’s revision when it finishes.',
      canOpen: false,
    });
    expect(heldSaveCopy('Mount holes', 'background')).toEqual({
      title: 'Saving waits for “Mount holes”',
      description:
        'Its agent is changing these files in a background window, so it can’t finish until that window is open again. Your edits will be saved with the agent’s revision.',
      canOpen: false,
    });
    expect(heldSaveCopy(undefined, 'otherWindow').title).toBe('Saving waits for another chat');
  });
});

describe('useHeldSaveToast', () => {
  it('offers Open chat for a run this window follows', () => {
    runs.value = { 'run-7': { appendState: 'open' } };
    const { result } = renderHook(() => useHeldSaveToast());
    result.current(heldBy);
    const [title, options] = toastInfo.mock.calls[0] as [string, { action?: { label: string; onClick: () => void } }];
    expect(title).toBe('Saving waits for “Mount holes”');
    expect(options.action?.label).toBe('Open chat');
    options.action?.onClick();
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('chat-mount'));
  });

  it('names another window, with no action, for a run this window does not follow', () => {
    const { result } = renderHook(() => useHeldSaveToast());
    result.current(heldBy);
    const [, options] = toastInfo.mock.calls[0] as [string, { description: string; action?: unknown }];
    expect(options.description).toContain('in another window');
    expect(options.action).toBeUndefined();
  });
});
