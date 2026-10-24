// @vitest-environment jsdom
// oxlint-disable-next-line import/no-unassigned-import -- registers DOM matchers
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SharedProjectPassword } from '#components/share/shared-project-password.js';

describe('SharedProjectPassword', () => {
  it('validates normalized UTF-8 bytes instead of character count', () => {
    const props = { isOpening: false, onPasswordChange: vi.fn(), onSubmit: vi.fn() };
    const { rerender } = render(<SharedProjectPassword {...props} password={'e\u0301'.repeat(15)} />);
    expect(screen.getByRole('button', { name: 'Open project' })).toBeDisabled();
    rerender(<SharedProjectPassword {...props} password={'é'.repeat(16)} />);
    expect(screen.getByRole('button', { name: 'Open project' })).toBeEnabled();
    rerender(<SharedProjectPassword {...props} password={'é'.repeat(65)} />);
    expect(screen.getByRole('button', { name: 'Open project' })).toBeDisabled();
  });

  it('submits a valid password and keeps the server error visible', () => {
    const onSubmit = vi.fn();
    render(
      <SharedProjectPassword
        password='local-review-password-32-characters'
        isOpening={false}
        passwordError='Incorrect password'
        onPasswordChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open project' }));
    expect(onSubmit).toHaveBeenCalledWith('local-review-password-32-characters');
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Incorrect password')).toBeVisible();
  });

  it('prevents another submit while opening', () => {
    const onSubmit = vi.fn();
    render(
      <SharedProjectPassword
        password='local-review-password-32-characters'
        isOpening
        onPasswordChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open project' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Password')).toBeDisabled();
  });
});
