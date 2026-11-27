import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrowserStorageStatus } from '#components/settings/browser-storage-status.js';

describe('BrowserStorageStatus', () => {
  it.each([
    ['best-effort', 'Saved in this browser'],
    ['persistent', 'Protected from automatic cleanup'],
    ['unknown', 'Protection not confirmed'],
    ['unavailable', 'Protection unavailable'],
  ] as const)('should describe %s without presenting a failed save', (status, title) => {
    render(<BrowserStorageStatus status={status} />);
    expect(screen.getByRole('status')).toHaveTextContent(title);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
