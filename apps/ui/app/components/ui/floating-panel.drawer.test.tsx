// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { X } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@taucad/ui/components/drawer';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import {
  FloatingPanel,
  FloatingPanelClose,
  FloatingPanelContentHeader,
  FloatingPanelContentHeaderActions,
  FloatingPanelContentTitle,
} from '#components/ui/floating-panel.js';

vi.mock('@taucad/ui/hooks/use-mobile', () => ({ useIsMobile: () => true }));

const snapPoints = [0.25, 0.58, 1];

/** A panel docked in the real detented drawer, as the phone workbench hosts it. */
function DockedPanel({ onOpenChange }: { readonly onOpenChange: (open: boolean) => void }): React.JSX.Element {
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- Vaul API
  const [snapPoint, setSnapPoint] = useState<number | string | null>(snapPoints[0]!);
  return (
    <TooltipProvider>
      <Drawer
        open
        handleOnly
        modal={false}
        snapPoints={snapPoints}
        activeSnapPoint={snapPoint}
        setActiveSnapPoint={setSnapPoint}
        onOpenChange={onOpenChange}
      >
        <DrawerContent>
          <DrawerTitle className='sr-only'>Workbench</DrawerTitle>
          <DrawerDescription className='sr-only'>Review panes</DrawerDescription>
          <FloatingPanel side='right' isOpen>
            <FloatingPanelContentHeader>
              <FloatingPanelContentTitle>Parameters</FloatingPanelContentTitle>
              <FloatingPanelContentHeaderActions>
                <FloatingPanelClose icon={X} tooltipContent={() => 'Close panel'} />
              </FloatingPanelContentHeaderActions>
            </FloatingPanelContentHeader>
          </FloatingPanel>
        </DrawerContent>
      </Drawer>
    </TooltipProvider>
  );
}

describe('FloatingPanel docked in a detented drawer', () => {
  it('should leave the sheet where it is when its title row is tapped or double-tapped; only the grabber moves it', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn<(open: boolean) => void>();
    render(<DockedPanel onOpenChange={onOpenChange} />);
    const grabber = screen.getByRole('slider', { name: 'Drawer height' });
    expect(grabber).toHaveAttribute('aria-valuetext', '25% height');

    const title = screen.getByText('Parameters');
    await user.click(title);
    await user.dblClick(title);
    await user.click(title.closest('[data-slot="floating-panel-content-header"]')!);

    expect(grabber).toHaveAttribute('aria-valuetext', '25% height');
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Workbench' })).toBeInTheDocument();

    // The grabber is what moves the sheet, so the assertions above are not blind to a change.
    fireEvent.keyDown(grabber, { key: 'Enter' });
    expect(grabber).toHaveAttribute('aria-valuetext', '58% height');
  });
});
