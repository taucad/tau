import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createSettingsCatalogue } from '#components/settings/settings-catalogue.js';
import { SettingsRow, SettingsSectionsProvider } from '#components/settings/settings-item.js';

describe('SettingsRow', () => {
  it('should mark a registered setting as a search destination named by its catalogue label', () => {
    render(<SettingsRow settingId='theme' title='Theme' />);

    expect(screen.getByRole('region', { name: 'Theme' })).toHaveAttribute('id', 'settings-theme');
  });

  it('should render nothing for a setting the provided sections do not offer', () => {
    const sections = createSettingsCatalogue([]).filter(({ id }) => id !== 'billing');
    render(
      <SettingsSectionsProvider sections={sections}>
        <SettingsRow settingId='plan' title='Plan' />
        <SettingsRow settingId='theme' title='Theme' />
      </SettingsSectionsProvider>,
    );

    expect(screen.queryByRole('group', { name: 'Plan' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Theme' })).toBeInTheDocument();
  });

  it('should offer a flag setting only when the host provides its flag', () => {
    const { rerender } = render(<SettingsRow settingId='flag-gridSnap' title='Grid snap' />);
    expect(screen.queryByRole('group', { name: 'Grid snap' })).not.toBeInTheDocument();

    rerender(
      <SettingsSectionsProvider
        sections={createSettingsCatalogue([{ name: 'gridSnap', label: 'Grid snap', description: 'Snap to the grid' }])}
      >
        <SettingsRow settingId='flag-gridSnap' title='Grid snap' />
      </SettingsSectionsProvider>,
    );
    expect(screen.getByRole('region', { name: 'Grid snap' })).toBeInTheDocument();
  });
});
