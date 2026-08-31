import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Format3D } from '#components/icons/format-3d.js';

describe('Format3D', () => {
  afterEach(() => {
    Reflect.deleteProperty(SVGElement.prototype, 'getComputedTextLength');
  });

  it('rounds the badge and shrinks long labels within its padding', () => {
    Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', {
      configurable: true,
      value: vi.fn(() => 22),
    });

    const { container } = render(<Format3D extension='webp' aria-label='WebP file' />);

    expect(container.querySelector('rect')).toHaveAttribute('rx', '5.25');
    expect(screen.getByText('webp')).toHaveAttribute('x', '22');
    expect(screen.getByText('webp')).toHaveAttribute('font-size', '10');
  });

  it('renders when SVG text measurement is unavailable', () => {
    render(<Format3D extension='step' aria-label='STEP file' />);

    expect(screen.getByText('step')).toHaveAttribute('font-size', '11');
  });
});
