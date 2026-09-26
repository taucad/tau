// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { SectionViewControl } from '#components/geometry/cad/section-view-control.js';

type GraphicsState = {
  readonly context: {
    readonly isSectionViewActive: boolean;
    readonly geometry: { readonly format: 'gltf' };
  };
};

const mocks = vi.hoisted(() => ({
  graphicsSend: vi.fn(),
  isSectionViewActive: false,
}));

vi.mock('#hooks/use-graphics.js', () => ({
  useGraphics: () => ({ send: mocks.graphicsSend }),
  useGraphicsSelector: <T,>(selector: (state: GraphicsState) => T): T =>
    selector({ context: { isSectionViewActive: mocks.isSectionViewActive, geometry: { format: 'gltf' } } }),
}));

describe('SectionViewControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSectionViewActive = false;
  });

  it('should expose an unpressed Section view toggle that enables the section view', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <SectionViewControl />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Section view', pressed: false }));

    expect(mocks.graphicsSend).toHaveBeenCalledWith({ type: 'setSectionViewActive', payload: true });
  });

  it('should keep the Section view name and report pressed when active', () => {
    mocks.isSectionViewActive = true;
    render(
      <TooltipProvider>
        <SectionViewControl />
      </TooltipProvider>,
    );

    expect(screen.getByRole('button', { name: 'Section view', pressed: true })).toBeInTheDocument();
  });
});
