import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { useSelector } from '@xstate/react';
import { mock } from 'vitest-mock-extended';
import { ForkDivider } from '#routes/projects_.$id/fork-divider.js';
import { useRevisionActor } from '#routes/projects_.$id/revision-provider.js';

vi.mock('@xstate/react', () => ({ useSelector: vi.fn() }));
vi.mock('#routes/projects_.$id/revision-provider.js', () => ({
  useRevisionActor: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(useRevisionActor).mockReturnValue(mock<ReturnType<typeof useRevisionActor>>());
});

describe('ForkDivider', () => {
  it('renders nothing when no turns are superseded', () => {
    vi.mocked(useSelector).mockReturnValue(0);
    const { container } = render(<ForkDivider />);
    expect(container.textContent).toBe('');
  });

  it('renders the fork marker with the superseded-turn count when a fork exists (R14)', () => {
    vi.mocked(useSelector).mockReturnValue(3);
    const { container } = render(<ForkDivider />);
    expect(container.textContent).toContain('Forked');
    expect(container.textContent).toContain('3 superseded turns');
  });

  it('singularizes a single superseded turn', () => {
    vi.mocked(useSelector).mockReturnValue(1);
    const { container } = render(<ForkDivider />);
    expect(container.textContent).toContain('1 superseded turn hidden');
  });
});
