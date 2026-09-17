// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { zooCloseMessages } from '#cloud/zoo-close-errors.cloud.js';

const openSettingsDialog = vi.hoisted(() => vi.fn());
vi.mock('#hooks/use-settings-dialog.js', () => ({
  useSettingsDialog: () => ({ isOpen: false, section: 'general', open: openSettingsDialog, close: vi.fn() }),
}));

const { ZooUpgradeBanner } = await import('#cloud/zoo-upgrade-banner.cloud.js');

describe('ZooUpgradeBanner', () => {
  it('should keep a Free Zoo project open and expose upgrade plus explicit retry', () => {
    const retry = vi.fn();
    render(<ZooUpgradeBanner message={zooCloseMessages.pro} onRetry={retry} />);

    fireEvent.click(screen.getByRole('button', { name: 'Upgrade to Pro' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(openSettingsDialog).toHaveBeenCalledWith('billing');
    expect(retry).toHaveBeenCalledOnce();
  });

  it('should show a truthful service error with retry and no billing action', () => {
    const retry = vi.fn();
    render(<ZooUpgradeBanner message={zooCloseMessages.unavailable} onRetry={retry} />);

    expect(screen.getByText(zooCloseMessages.unavailable)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upgrade to Pro' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add credits' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
