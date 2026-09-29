// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { SectionViewControl } from '#components/geometry/cad/section-view-control.js';

type GraphicsState = {
  readonly context: { readonly isSectionViewActive: boolean };
};

const mocks = vi.hoisted(() => ({
  graphicsSend: vi.fn(),
  isSectionViewActive: false,
  viewDirection: [0, -1, 0] as const,
}));

vi.mock('#hooks/use-graphics.js', () => ({
  useGraphics: () => ({ send: mocks.graphicsSend }),
  useCameraRig: () => ({
    actorRef: { getSnapshot: () => ({ context: { view: { direction: mocks.viewDirection } } }) },
  }),
  useGraphicsSelector: <T,>(selector: (state: GraphicsState) => T): T =>
    selector({ context: { isSectionViewActive: mocks.isSectionViewActive } }),
}));

const renderToggle = (properties: React.ComponentProps<typeof SectionViewControl> = {}): void => {
  render(
    <TooltipProvider>
      <SectionViewControl {...properties} />
    </TooltipProvider>,
  );
};

describe('SectionViewControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSectionViewActive = false;
  });

  it('should start the section from the camera direction and then call onStart', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    renderToggle({ onStart });

    await user.click(screen.getByRole('button', { name: 'Section view', pressed: false }));

    expect(mocks.graphicsSend).toHaveBeenCalledWith({
      type: 'setSectionViewActive',
      payload: true,
      viewDirection: mocks.viewDirection,
    });
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('should stop the section without calling onStart while active', async () => {
    mocks.isSectionViewActive = true;
    const user = userEvent.setup();
    const onStart = vi.fn();
    renderToggle({ onStart });

    await user.click(screen.getByRole('button', { name: 'Section view', pressed: true }));

    expect(mocks.graphicsSend).toHaveBeenCalledWith(expect.objectContaining({ payload: false }));
    expect(onStart).not.toHaveBeenCalled();
  });

  it('should show the name and the shortcut at rest', async () => {
    const user = userEvent.setup();
    renderToggle({ shortcut: 'S' });

    await user.hover(screen.getByRole('button', { name: 'Section view' }));

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Section viewS');
  });

  it('should read Stop section while running', async () => {
    mocks.isSectionViewActive = true;
    const user = userEvent.setup();
    renderToggle();

    await user.hover(screen.getByRole('button', { name: 'Section view' }));

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Stop section');
  });
});
