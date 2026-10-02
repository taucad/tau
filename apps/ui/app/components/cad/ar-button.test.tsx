import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ArButton } from '#components/cad/ar-button.js';

const mobileMocks = vi.hoisted(() => ({ isMobile: true }));

vi.mock('#hooks/use-mobile.js', () => ({
  useIsMobile: () => mobileMocks.isMobile,
}));

const arMocks = vi.hoisted(() => ({
  canActivateAr: true,
  isConverting: false,
  activateAr: vi.fn(async () => undefined),
}));

vi.mock('#components/cad/use-ar.js', () => ({
  useAr: () => ({
    isQuickLookSupported: arMocks.canActivateAr,
    canActivateAr: arMocks.canActivateAr,
    isConverting: arMocks.isConverting,
    activateAr: arMocks.activateAr,
  }),
}));

beforeEach(() => {
  mobileMocks.isMobile = true;
  arMocks.canActivateAr = true;
  arMocks.isConverting = false;
  arMocks.activateAr.mockClear();
});

describe('ArButton', () => {
  it('returns nothing when not mobile', () => {
    mobileMocks.isMobile = false;
    const { container } = render(<ArButton geometries={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('returns nothing when AR cannot be activated (non-iOS / no kernel)', () => {
    arMocks.canActivateAr = false;
    const { container } = render(<ArButton geometries={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('invokes activateAr() when clicked on a supported device', async () => {
    render(<ArButton geometries={[]} />);
    await userEvent.click(screen.getByRole('button'));
    expect(arMocks.activateAr).toHaveBeenCalledTimes(1);
  });

  it('disables the button while converting', () => {
    arMocks.isConverting = true;
    render(<ArButton geometries={[]} />);
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true);
  });
});
