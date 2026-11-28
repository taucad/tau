import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import { useMarkUpCopy } from '#components/comments/copy-to-markup.js';

const state = vi.hoisted(() => ({
  flag: 'on' as 'on' | 'off',
  send: vi.fn(),
  attachments: [{ url: 'attachments/a.png' }] as unknown[],
  queue: [] as Array<{ target: string }>,
}));
const draftActorRef = vi.hoisted(() => ({
  send: (...args: unknown[]): void => {
    state.send(...args);
  },
  getSnapshot: () => ({ context: { draftAttachments: state.attachments, attachmentQueue: state.queue } }),
}));

vi.mock('#flags/use-feature.js', () => ({ useFeatureState: () => state.flag }));
vi.mock('#components/chat/attachment-preview.js', () => ({
  useChatAttachmentDirectories: () => ({ composer: '/composer', transcript: '/transcript' }),
}));
vi.mock('#hooks/active-chat-provider.js', () => ({
  useOptionalChatComposer: () => ({
    draftActorRef,
    execution: { execution: 'browser' },
    model: { model: { id: 'model' } },
  }),
}));
vi.mock('#utils/chat.utils.js', () => ({ attachmentModelForExecution: () => ({ id: 'model' }) }));
vi.mock('#components/comments/draft-image-markup.js', () => ({
  DraftImageMarkup: (props: { attachmentIndex: number; finishLabel: string; directory: readonly string[] }) => (
    <div data-testid='markup'>{`${props.attachmentIndex} ${props.finishLabel} ${props.directory.join(',')}`}</div>
  ),
}));

describe('useMarkUpCopy', () => {
  beforeEach(() => {
    state.flag = 'on';
    state.send.mockClear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ blob: async () => new Blob(['png'], { type: 'image/png' }) })),
    );
  });

  it('should copy the image into the draft, then open mark up on the copy with Add to chat', async () => {
    const { result } = renderHook(() => useMarkUpCopy());
    await act(async () => {
      await result.current.markUp?.({ src: 'blob:shown', mediaType: 'image/png' });
    });
    const [event] = state.send.mock.calls[0] as [{ type: string; dataUrl: string }];
    expect(event.type).toBe('addDraftAttachment');
    expect(event.dataUrl).toMatch(/^data:image\/png;base64,/u);
    render(<div>{result.current.dialog}</div>);
    expect(await screen.findByTestId('markup')).toHaveTextContent('1 Add to chat /composer,/transcript');
  });

  it('should open mark up after the images still queued for the draft', async () => {
    state.queue = [{ target: 'main' }, { target: 'edit' }];
    const { result } = renderHook(() => useMarkUpCopy());
    await act(async () => {
      await result.current.markUp?.({ src: 'blob:shown', mediaType: 'image/png' });
    });
    render(<div>{result.current.dialog}</div>);
    expect(await screen.findByTestId('markup')).toHaveTextContent(/^2 /u);
    state.queue = [];
  });

  it('should offer nothing while the flag is off', () => {
    state.flag = 'off';
    const { result } = renderHook(() => useMarkUpCopy());
    expect(result.current.markUp).toBeUndefined();
    expect(result.current.dialog).toBeNull();
  });
});
