import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Slider } from '#components/slider.js';

describe('Slider', () => {
  it('should name the thumb, which carries the slider role', () => {
    render(<Slider value={[2]} max={4} aria-label='Time' />);

    expect(screen.getByRole('slider', { name: 'Time' })).toHaveAttribute('aria-valuenow', '2');
  });
});
