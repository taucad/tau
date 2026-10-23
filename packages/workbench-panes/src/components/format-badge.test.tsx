import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FormatBadge, FormatFileIcon } from '#components/format-badge.jsx';

describe('FormatBadge', () => {
  afterEach(() => {
    Reflect.deleteProperty(SVGElement.prototype, 'getComputedTextLength');
  });

  it('rounds the badge and shrinks long labels within its padding', () => {
    Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', {
      configurable: true,
      value: vi.fn(() => 22),
    });

    const { container } = render(<FormatBadge extension='webp' aria-label='WebP file' />);

    expect(container.querySelector('rect')).toHaveAttribute('rx', '5.25');
    expect(screen.getByText('webp')).toHaveAttribute('x', '22');
    expect(screen.getByText('webp')).toHaveAttribute('font-size', '10');
  });

  it('names its format for assistive technology', () => {
    const { rerender } = render(<FormatBadge extension='stl' />);
    expect(screen.getByRole('img', { name: 'stl' })).toBeInTheDocument();
    rerender(<FormatBadge extension='stl' aria-label='STL mesh' />);
    expect(screen.getByRole('img', { name: 'STL mesh' })).toBeInTheDocument();
  });

  it('renders when SVG text measurement is unavailable', () => {
    render(<FormatBadge extension='step' aria-label='STEP file' />);

    expect(screen.getByText('step')).toHaveAttribute('font-size', '11');
  });
});

describe('FormatFileIcon', () => {
  it('should badge a catalog model format and draw a plain file icon for any other name', () => {
    const { container, rerender } = render(<FormatFileIcon filename='exports/gear.STEP' />);
    expect(screen.getByText('step')).toBeInTheDocument();
    rerender(<FormatFileIcon filename='gear.ts' />);
    expect(container.querySelector('.lucide-file')).not.toBeNull();
    rerender(<FormatFileIcon filename='prints/part.gcode.3mf' />);
    expect(screen.getByText('gcode')).toBeInTheDocument();
    rerender(<FormatFileIcon filename='report.csv' />);
    expect(container.querySelector('.lucide-format-3d')).toBeNull();
  });
});
