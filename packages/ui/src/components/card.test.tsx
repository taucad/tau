// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CardTitle } from '#components/card.js';

describe('CardTitle', () => {
  it('should stay outside the outline and name the card object by default', () => {
    render(<CardTitle>Model</CardTitle>);

    const title = screen.getByText('Model');
    expect(title.tagName).toBe('DIV');
    expect(title).toHaveAttribute('data-slot', 'card-title');
    expect(title).toHaveClass('text-base', 'font-semibold', 'leading-none');
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('should render the heading element of its level without changing its look', () => {
    render(
      <CardTitle level={1} variant='title'>
        Sign in
      </CardTitle>,
    );

    const title = screen.getByRole('heading', { level: 1, name: 'Sign in' });
    expect(title).toHaveAttribute('data-slot', 'card-title');
    expect(title).toHaveClass('text-lg', 'font-semibold', 'leading-none');
  });

  it('should take the label look for a compact card', () => {
    render(<CardTitle variant='label'>Credits used</CardTitle>);

    expect(screen.getByText('Credits used')).toHaveClass('text-sm', 'font-medium');
  });
});
