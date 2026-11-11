// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import -- registers DOM matchers for this test module
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SettingsPageSkeleton, SettingsRowSkeleton, SettingsRowsLoading } from '#components/settings/settings-item.js';

describe('settings loading placeholders', () => {
  it('should announce a loading page once and draw one card of rows per group', () => {
    const { container } = render(<SettingsPageSkeleton groups={[3, 1]} />);

    expect(screen.getByRole('status', { name: 'Loading settings' })).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelectorAll('[data-slot="settings-row-skeleton"]')).toHaveLength(4);
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(4);
  });

  it('should name what is loading for rows inside a group that is already shown', () => {
    const { container } = render(<SettingsRowsLoading label='Loading repositories…' rows={3} />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading repositories…');
    expect(container.querySelectorAll('[data-slot="settings-row-skeleton"]')).toHaveLength(3);
  });

  it('should hide the placeholder row from assistive technology and omit the control when there is none', () => {
    const { container } = render(<SettingsRowSkeleton hasControl={false} />);

    const row = container.querySelector('[data-slot="settings-row-skeleton"]');
    expect(row).toHaveAttribute('aria-hidden', 'true');
    expect(row?.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(2);
  });
});
