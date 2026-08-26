// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChatTextareaImageStrip } from '#components/chat/chat-textarea-image-strip.js';

const images = ['data:image/png;base64,one', 'data:image/png;base64,two', 'data:image/png;base64,three'];
const fiveImages = [...images, 'data:image/png;base64,four', 'data:image/png;base64,five'];

describe('ChatTextareaImageStrip', () => {
  it('renders desktop attachments as a large horizontal image strip without text-chip labels', () => {
    render(<ChatTextareaImageStrip images={images} size='desktop' onRemoveImage={vi.fn()} />);

    const strip = screen.getByLabelText('Attached images');
    expect(strip.className).toContain('overflow-x-auto');
    expect(strip.className).toContain('overflow-y-hidden');
    expect(strip.className).toContain('scroll-shadows-x');
    expect(strip.firstElementChild?.className).toContain('flex-nowrap');
    expect(screen.queryByText('Image')).toBeNull();

    const renderedImages = screen.getAllByRole('img');
    expect(renderedImages).toHaveLength(images.length);
    expect(renderedImages[0]?.parentElement?.className).toContain('size-20');
    for (const image of renderedImages) {
      expect(image).toHaveAttribute('loading', 'lazy');
    }
  });

  it('keeps a fixed desktop gap matching the composer image inset', () => {
    render(<ChatTextareaImageStrip images={fiveImages} size='desktop' onRemoveImage={vi.fn()} />);

    const strip = screen.getByLabelText('Attached images');
    expect(strip.firstElementChild?.className).toContain('min-w-full');
    expect(strip.firstElementChild?.className).toContain('justify-start');
    expect(strip.firstElementChild?.className).toContain('gap-3');
    expect(strip.firstElementChild?.className).not.toContain('justify-between');
  });

  it('renders mobile attachments larger than the old compact thumbnails', () => {
    render(<ChatTextareaImageStrip images={images} size='mobile' onRemoveImage={vi.fn()} />);

    const renderedImages = screen.getAllByRole('img');
    expect(renderedImages[0]?.parentElement?.className).toContain('size-14');
  });

  it('keeps remove buttons inside thumbnails and removes the requested image', () => {
    const onRemoveImage = vi.fn();
    render(<ChatTextareaImageStrip images={images} size='desktop' onRemoveImage={onRemoveImage} />);

    const secondRemoveButton = screen.getByRole('button', { name: 'Remove uploaded image 2' });
    expect(secondRemoveButton.className).toContain('top-1');
    expect(secondRemoveButton.className).toContain('right-1');
    expect(secondRemoveButton.className).not.toContain('-top');
    expect(secondRemoveButton.className).not.toContain('-right');

    fireEvent.click(secondRemoveButton);

    expect(onRemoveImage).toHaveBeenCalledWith(1);
  });

  it('opens a carousel dialog at the clicked image', () => {
    render(<ChatTextareaImageStrip images={images} size='desktop' onRemoveImage={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open uploaded image 2' }));

    expect(screen.getByRole('region', { name: 'Image preview carousel' })).toBeInTheDocument();
    const previousButton = screen.getByRole('button', { name: 'Previous slide' });
    const nextButton = screen.getByRole('button', { name: 'Next slide' });
    expect(previousButton).toBeInTheDocument();
    expect(previousButton.className).toContain('fixed');
    expect(previousButton.className).toContain('left-4');
    expect(previousButton.className).toContain('size-10');
    expect(nextButton).toBeInTheDocument();
    expect(nextButton.className).toContain('fixed');
    expect(nextButton.className).toContain('right-4');
    expect(nextButton.className).toContain('size-10');
    const downloadLink = screen.getByRole('link', { name: 'Download uploaded-image-2.png' });
    expect(downloadLink).toHaveAttribute('href', images[1]);
    expect(downloadLink).toHaveAttribute('download', 'uploaded-image-2.png');
    downloadLink.addEventListener('click', (event) => {
      event.preventDefault();
    });
    fireEvent.pointerDown(downloadLink);
    fireEvent.click(downloadLink);
    expect(screen.getByRole('region', { name: 'Image preview carousel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close image preview' })).toBeInTheDocument();
    const dialog = screen.getByRole('dialog', { name: 'Image preview carousel' });
    expect(dialog.className).toContain('bg-transparent');
    expect(dialog.className).toContain('border-0');
    expect(dialog.className).toContain('p-0');
    expect(dialog.className).toContain('shadow-none');
    expect(dialog.className).not.toContain('bg-background');
    const counter = screen.getByText('2 / 3');
    expect(counter).toBeInTheDocument();
    expect(counter.className).toContain('fixed');
    expect(counter.className).toContain('bottom-4');
    expect(counter.className).toContain('h-10');
    expect(counter.className).toContain('text-sm');
    expect(
      screen.getAllByRole('img', { name: 'Uploaded 2' }).some((image) => image.getAttribute('loading') === 'eager'),
    ).toBe(true);
  });

  it('hides carousel navigation chrome for a single image', () => {
    render(<ChatTextareaImageStrip images={[images[0]!]} size='desktop' onRemoveImage={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open uploaded image 1' }));

    expect(screen.getByRole('region', { name: 'Image preview carousel' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Previous slide' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next slide' })).toBeNull();
    const downloadLink = screen.getByRole('link', { name: 'Download uploaded-image-1.png' });
    expect(downloadLink).toHaveAttribute('href', images[0]);
    expect(downloadLink).toHaveAttribute('download', 'uploaded-image-1.png');
    expect(screen.getByRole('button', { name: 'Close image preview' })).toBeInTheDocument();
    expect(screen.queryByText('1 / 1')).toBeNull();
  });
});
