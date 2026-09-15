// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const openSettingsDialog = vi.hoisted(() => vi.fn());
vi.mock('#hooks/use-settings-dialog.js', () => ({ openSettingsDialog }));

const { ZooUpgradeBanner } = await import('#cloud/zoo-upgrade-banner.cloud.js');

describe('ZooUpgradeBanner', () => {
  it('should keep a Free Zoo project open and expose upgrade plus explicit retry', () => {
    const retry = vi.fn();
    render(<ZooUpgradeBanner message='Zoo execution requires Pro. Upgrade to Pro, then retry.' onRetry={retry} />);

    fireEvent.click(screen.getByRole('button', { name: 'Upgrade to Pro' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(openSettingsDialog).toHaveBeenCalledWith('billing');
    expect(retry).toHaveBeenCalledOnce();
  });

  it('should show a truthful service error with retry and no billing action', () => {
    const retry = vi.fn();
    render(<ZooUpgradeBanner message='Zoo execution is temporarily unavailable.' onRetry={retry} />);

    expect(screen.getByText('Zoo execution is temporarily unavailable.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upgrade to Pro' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add credits' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
