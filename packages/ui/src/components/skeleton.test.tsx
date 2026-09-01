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
});
