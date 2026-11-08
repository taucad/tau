import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { PartPreviewFrame } from '#cad/part-preview-image.jsx';

const loadingIndicator = (container: HTMLElement): Element | undefined =>
  container.querySelector('[data-slot=part-preview-loading]') ?? undefined;

describe('PartPreviewFrame', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a spinner in place of the swatch while the first preview renders', () => {
    const { container } = render(
      <PartPreviewFrame
        name='Gear'
        preview={{ status: 'pending' }}
        className='size-20'
        fallback={<span data-testid='swatch' />}
      />,
    );
    expect(loadingIndicator(container)?.querySelector('svg.spin-glyph')).toBeInstanceOf(SVGElement);
    expect(container.querySelector('[data-testid=swatch]')).toBeNull();
  });

  it('keeps the last image under the spinner while a preview refreshes, and drops the spinner once ready', () => {
    const bytes = new Uint8Array([1]);
    const { container, rerender } = render(
      <PartPreviewFrame name='Gear' preview={{ status: 'pending', bytes }} className='size-20' fallback={undefined} />,
    );
    expect(loadingIndicator(container)).toBeDefined();
    expect(container.querySelector('img')).toHaveClass('opacity-40');

    rerender(
      <PartPreviewFrame name='Gear' preview={{ status: 'ready', bytes }} className='size-20' fallback={undefined} />,
    );
    expect(loadingIndicator(container)).toBeUndefined();
    expect(container.querySelector('img')).not.toHaveClass('opacity-40');
  });

  it('shows no spinner for a failed preview', () => {
    const { container } = render(
      <PartPreviewFrame name='Gear' preview={{ status: 'failed' }} className='size-20' fallback={<span />} />,
    );
    expect(loadingIndicator(container)).toBeUndefined();
  });
});
