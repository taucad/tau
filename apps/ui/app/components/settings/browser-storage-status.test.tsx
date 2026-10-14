import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BrowserStorageStatus } from '#components/settings/browser-storage-status.js';

describe('BrowserStorageStatus', () => {
  it.each([
    ['best-effort', 'Saved in this browser'],
    ['persistent', 'Protected from automatic cleanup'],
    ['unknown', 'Storage protection not confirmed'],
    ['unavailable', 'Storage protection unavailable'],
  ] as const)('should describe %s without presenting a failed save', (status, title) => {
    const check = vi.fn();
    render(<BrowserStorageStatus status={status} onCheckStatus={check} />);
    expect(screen.getByRole('status')).toHaveTextContent(title);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check status' }));
    expect(check).toHaveBeenCalledOnce();
  });
});
