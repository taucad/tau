// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { ChatAttachmentDirectoriesContext } from '#components/chat/attachment-preview.js';
import { ChatMessageMedia, chatAttachmentProjectPath } from '#routes/w.$workspace.$project/chat-message-media.js';

const directory = '/projects/p1/.tau/chats/c1/attachments';
const pngHash = 'a'.repeat(64);
const pngUrl = `attachments/${pngHash}.png`;
const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const readFile = vi.fn(async (path: string) => {
  if (path === `${directory}/${pngHash}.png`) {
    return pngBytes;
  }
  throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
});
vi.mock('#hooks/use-file-manager.js', () => ({ useOptionalFileManager: () => ({ recordFiles: { readFile } }) }));

const send = vi.fn();
let project: { readonly editorRef: { readonly send: typeof send } } | undefined;
vi.mock('#hooks/use-project.js', () => ({ useProject: () => project }));

beforeAll(() => {
  // Jsdom has no object URLs; the hook only needs a stable string per blob.
  URL.createObjectURL = vi.fn(() => 'blob:agent-image');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  send.mockClear();
  project = undefined;
});

const directories = { transcript: directory, composer: `${directory}-draft` };
const renderInChat = (node: ReactNode) =>
  render(
    <ChatAttachmentDirectoriesContext.Provider value={directories}>{node}</ChatAttachmentDirectoriesContext.Provider>,
  );

describe('ChatMessageMedia', () => {
  it('shows an attachment image at reading size in a rounded frame, and opens it read-only in the side viewer', async () => {
    const user = userEvent.setup();
    project = { editorRef: { send } };
    renderInChat(<ChatMessageMedia media={{ url: pngUrl, mediaType: 'image/png' }} alt='Image generation' />);

    // The placeholder holds the space while the bytes load; then the pixels arrive.
    await vi.waitFor(() => {
      expect(screen.getByRole('img', { name: 'Image generation' })).toHaveAttribute('src', 'blob:agent-image');
    });
    const frame = screen.getByRole('button', { name: 'Open Image generation' });
    expect(frame).toHaveClass('rounded-xl', 'overflow-hidden', 'border');

    await user.click(frame);

    expect(send).toHaveBeenCalledWith({
      type: 'openFile',
      path: `.tau/chats/c1/attachments/${pngHash}.png`,
      source: 'user',
      lineNumber: 1,
      column: 1,
      readOnly: true,
    });
    expect(screen.queryByRole('region', { name: 'Image preview carousel' })).not.toBeInTheDocument();
  });

  it('opens an inline image, which has no file to open, in the image lightbox', async () => {
    const user = userEvent.setup();
    project = { editorRef: { send } };
    renderInChat(
      <ChatMessageMedia media={{ url: 'data:image/png;base64,iVBORw0K', mediaType: 'image/png' }} alt='Front view' />,
    );

    await user.click(screen.getByRole('button', { name: 'Open Front view' }));

    expect(send).not.toHaveBeenCalled();
    expect(screen.getByRole('region', { name: 'Image preview carousel' })).toBeInTheDocument();
  });

  it('falls back to the labelled file chip when the bytes are not on this device', async () => {
    renderInChat(<ChatMessageMedia media={{ url: `attachments/${'b'.repeat(64)}.png`, mediaType: 'image/png' }} />);

    expect(await screen.findByText('Not available on this device yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Open / })).not.toBeInTheDocument();
  });

  it('plays agent audio in a player', () => {
    const { container } = renderInChat(
      <ChatMessageMedia media={{ url: 'data:audio/wav;base64,UklGRg==', mediaType: 'audio/wav' }} />,
    );

    const audio = container.querySelector('audio');
    expect(audio).toHaveAttribute('src', 'data:audio/wav;base64,UklGRg==');
    expect(audio).toHaveAttribute('controls');
  });

  it('renders any other document as the attachment chip', () => {
    renderInChat(
      <ChatMessageMedia
        media={{ url: 'data:application/pdf;base64,JVBERg==', mediaType: 'application/pdf', filename: 'spec.pdf' }}
      />,
    );

    expect(screen.getByRole('link', { name: 'spec.pdf' })).toHaveAttribute('download', 'spec.pdf');
  });
});

describe('chatAttachmentProjectPath', () => {
  it.each([
    [directory, pngUrl, `.tau/chats/c1/attachments/${pngHash}.png`],
    [directory, 'data:image/png;base64,AA', undefined],
    [directory, 'attachments/../../tau.json', undefined],
    ['/projects/p1/other', pngUrl, undefined],
    [undefined, pngUrl, undefined],
  ])('maps %s + %s to %s', (from, url, expected) => {
    expect(chatAttachmentProjectPath(from, url)).toBe(expected);
  });
});
