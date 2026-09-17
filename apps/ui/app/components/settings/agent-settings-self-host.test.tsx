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
  it('should render the remaining cards without the credits setting', () => {
    render(<AgentSettings />);

    expect(screen.queryByText('Metadata Display')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Show Credits')).not.toBeInTheDocument();
    expect(screen.getByText('Editor Context')).toBeInTheDocument();
    expect(screen.getByText('Tool Display')).toBeInTheDocument();
    expect(screen.getByText('Testing')).toBeInTheDocument();
    expect(screen.getAllByRole('switch')).toHaveLength(5);
  });
});
