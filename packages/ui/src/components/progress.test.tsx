import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Progress } from '@taucad/ui/components/progress';

it('should expose reported progress and return to indeterminate when the value is unknown', () => {
  const { rerender } = render(<Progress aria-label='Import progress' value={60} />);

  const progress = screen.getByRole('progressbar', { name: 'Import progress' });
  expect(progress).toHaveAttribute('aria-valuenow', '60');
  expect(progress).toHaveAttribute('aria-valuemin', '0');
  expect(progress).toHaveAttribute('aria-valuemax', '100');

  rerender(<Progress aria-label='Import progress' />);
  expect(progress).not.toHaveAttribute('aria-valuenow');
});
