// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { FileUIPart } from 'ai';
import { ChatMessageFileAttachments } from '#routes/w.$workspace.$project/chat-message-file.js';

const imagePart = (filename: string, index: number): FileUIPart => ({
  type: 'file',
  mediaType: 'image/png',
  filename,
  url: `data:image/png;base64,image-${index}`,
});

const filePart = (filename: string): FileUIPart => ({
  type: 'file',
  mediaType: 'application/pdf',
  filename,
  url: `https://example.test/${filename}`,
});

describe('ChatMessageFileAttachments', () => {
  it('renders multiple image file parts as one carousel-capable group', () => {
    render(<ChatMessageFileAttachments parts={[imagePart('front.png', 1), imagePart('side.png', 2)]} />);

    const group = screen.getByLabelText('Attached image previews');
    expect(within(group).getAllByRole('button', { name: /Open image/ })).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Open image side.png' }));

    expect(screen.getByRole('region', { name: 'Image preview carousel' })).toBeInTheDocument();
    const downloadLink = screen.getByRole('link', { name: 'Download side.png' });
    expect(downloadLink).toHaveAttribute('href', 'data:image/png;base64,image-2');
    expect(downloadLink).toHaveAttribute('download', 'side.png');
    downloadLink.addEventListener('click', (event) => {
      event.preventDefault();
    });
    fireEvent.pointerDown(downloadLink);
    fireEvent.click(downloadLink);
    expect(screen.getByRole('region', { name: 'Image preview carousel' })).toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    expect(
      screen.getAllByRole('img', { name: 'side.png' }).some((image) => image.getAttribute('loading') === 'eager'),
    ).toBe(true);
  });

  it('keeps non-image file parts as file cards', () => {
    render(<ChatMessageFileAttachments parts={[imagePart('front.png', 1), filePart('spec.pdf')]} />);

    expect(screen.getByLabelText('Attached image previews')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'spec.pdf' })).toBeInTheDocument();
    expect(screen.getByText('application/pdf')).toBeInTheDocument();
  });

  it('should scroll mixed attachments horizontally from vertical wheel input without breaking image preview', () => {
    render(
      <ChatMessageFileAttachments
        parts={[imagePart('front.png', 1), filePart('spec.pdf'), filePart('drawing.step')]}
      />,
    );
    const attachments = screen.getByLabelText('Attached files');
    Object.defineProperties(attachments, {
      clientWidth: { configurable: true, value: 200 },
      scrollLeft: { configurable: true, value: 0, writable: true },
      scrollWidth: { configurable: true, value: 500 },
    });
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 80 });

    attachments.dispatchEvent(event);

    expect(attachments.scrollLeft).toBe(80);
    expect(event.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Open image front.png' }));
    expect(screen.getByRole('region', { name: 'Image preview carousel' })).toBeInTheDocument();
  });

  it('falls back to the file card when an image thumbnail fails to load', () => {
    render(<ChatMessageFileAttachments parts={[imagePart('broken.png', 1)]} />);

    fireEvent.error(screen.getByRole('img', { name: 'broken.png' }));

    expect(screen.queryByLabelText('Attached image previews')).toBeNull();
    expect(screen.getByRole('link', { name: 'broken.png' })).toBeInTheDocument();
    expect(screen.getByText('Failed to load image. Click to download.')).toBeInTheDocument();
    expect(screen.getByText('image/png')).toBeInTheDocument();
  });

  it('stops image thumbnail clicks from bubbling to the parent message', () => {
    const onParentClick = vi.fn();

    render(
      <div onClick={onParentClick}>
        <ChatMessageFileAttachments parts={[imagePart('front.png', 1), imagePart('side.png', 2)]} />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open image front.png' }));

    expect(onParentClick).not.toHaveBeenCalled();
    expect(screen.getByRole('region', { name: 'Image preview carousel' })).toBeInTheDocument();
  });
});
