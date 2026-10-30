import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentSettings } from '#components/settings/agent-settings.js';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Unit tests build with Tau Cloud enabled, so a self-hosted panel is only
// reachable by replacing the compile-time seam the settings registry reads.
vi.mock('#cloud/cloud-enabled.js', () => ({ tauCloudEnabled: false }));

vi.mock('#hooks/use-cookie.js', () => ({
  useCookie: (_name: string, defaultValue: boolean) => [defaultValue, vi.fn()],
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('AgentSettings without Tau Cloud', () => {
  it('should render the remaining settings without the credits setting', () => {
    render(<AgentSettings />);

    expect(screen.queryByRole('switch', { name: 'Show credits' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Context' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Testing tools' })).toBeInTheDocument();
    expect(screen.getAllByRole('switch')).toHaveLength(4);
  });
});
