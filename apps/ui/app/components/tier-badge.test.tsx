// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TooltipProvider } from '#components/ui/tooltip.js';
import { KernelTierBadge, ProBadge, TierBadge } from '#components/tier-badge.js';

const renderWithTooltip = (ui: React.ReactElement) => render(<TooltipProvider>{ui}</TooltipProvider>);

describe('ProBadge', () => {
  it('always renders the Pro label', () => {
    render(<ProBadge />);
    expect(screen.getByText('Pro')).toBeInTheDocument();
  });
});

describe('TierBadge', () => {
  it('returns null for the free tier', () => {
    const { container } = render(<TierBadge tier='free' />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders Pro for the pro tier', () => {
    renderWithTooltip(<TierBadge tier='pro' />);
    expect(screen.getByText('Pro')).toBeInTheDocument();
  });
});

describe('KernelTierBadge', () => {
  it('renders Pro for Zoo', () => {
    render(<KernelTierBadge kernelId='zoo' />);
    expect(screen.getByText('Pro')).toBeInTheDocument();
  });

  it('returns null for free-tier kernels', () => {
    const { container } = render(<KernelTierBadge kernelId='openscad' />);
    expect(container).toBeEmptyDOMElement();
  });
});
