import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import { useMarkUpCopy } from '#components/comments/copy-to-markup.js';

const state = vi.hoisted(() => ({
  flag: 'on' as 'on' | 'off',
  send: vi.fn(),
  attachments: [{ url: 'attachments/a.png' }] as unknown[],
}));

vi.mock('#flags/use-feature.js', () => ({ useFeatureState: () => state.flag }));
vi.mock('#components/chat/attachment-preview.js', () => ({
  useChatAttachmentDirectories: () => ({ composer: '/composer', transcript: '/transcript' }),
}));
vi.mock('#hooks/active-chat-provider.js', () => ({
  useOptionalChatComposer: () => ({
    draftActorRef: { send: state.send },
    execution: { execution: 'browser' },
    model: { model: { id: 'model' } },
  }),
}));
vi.mock('@xstate/react', () => ({
  useSelector: (_ref: unknown, select: (snapshot: unknown) => unknown) =>
    select({ context: { draftAttachments: state.attachments } }),
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

  it('should offer nothing while the flag is off', () => {
    state.flag = 'off';
    const { result } = renderHook(() => useMarkUpCopy());
    expect(result.current.markUp).toBeUndefined();
    expect(result.current.dialog).toBeNull();
  });
});
