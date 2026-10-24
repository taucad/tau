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
function DockedPanel({
  onOpenChange,
  headerExtra,
}: {
  readonly onOpenChange: (open: boolean) => void;
  readonly headerExtra?: React.ReactNode;
}): React.JSX.Element {
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
              {headerExtra}
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
    expect(grabber).toHaveAttribute('aria-valuetext', 'Peek');

    const title = screen.getByText('Parameters');
    await user.click(title);
    await user.dblClick(title);
    await user.click(title.closest('[data-slot="floating-panel-content-header"]')!);

    expect(grabber).toHaveAttribute('aria-valuetext', 'Peek');
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Workbench' })).toBeInTheDocument();

    // The grabber is what moves the sheet, so the assertions above are not blind to a change.
    fireEvent.keyDown(grabber, { key: 'Enter' });
    expect(grabber).toHaveAttribute('aria-valuetext', 'Half');
  });

  it('should let a sheet a header control opened take its own clicks', () => {
    const onPick = vi.fn<() => void>();
    const onOpenChange = vi.fn<(open: boolean) => void>();
    render(
      <DockedPanel
        headerExtra={
          <Drawer open>
            <DrawerContent data-testid='chat-switcher'>
              <DrawerTitle>Chats</DrawerTitle>
              <DrawerDescription className='sr-only'>Pick a chat</DrawerDescription>
              <button type='button' onClick={onPick}>
                Gear ratio study
              </button>
            </DrawerContent>
          </Drawer>
        }
        onOpenChange={onOpenChange}
      />,
    );

    // The sheet is portaled out of the header, so a click in it reaches the header only through React's tree.
    fireEvent.click(screen.getByRole('button', { name: 'Gear ratio study' }));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
