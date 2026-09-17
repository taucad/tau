import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Skeleton } from '#components/skeleton.js';

describe('Skeleton', () => {
  it('uses the neutral loading surface', () => {
    render(<Skeleton aria-label='Loading' />);

    const skeleton = screen.getByLabelText('Loading');
    expect(skeleton).toHaveClass('bg-muted');
    expect(skeleton).not.toHaveClass('bg-primary/10');
  });

  it('stops pulsing under reduced motion', () => {
    render(<Skeleton aria-label='Loading' />);

    expect(screen.getByLabelText('Loading')).toHaveClass('animate-pulse', 'motion-reduce:animate-none');
  });
});
