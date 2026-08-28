import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createPortal } from 'react-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FloatingPanel,
  FloatingPanelContentHeader,
  FloatingPanelContentHeaderActions,
  FloatingPanelMenuButton,
  FloatingPanelContentTitle,
} from '#components/ui/floating-panel.js';

// ── Mocks ──────────────────────────────────────────────────────────────

const mockUseIsMobile = vi.fn(() => false);
vi.mock('#hooks/use-mobile.js', () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

const mockUseIsInsideDrawer = vi.fn(() => false);
vi.mock('#components/ui/drawer.js', () => ({
  useIsInsideDrawer: () => mockUseIsInsideDrawer(),
  DrawerHandle: ({ children, ...props }: React.ComponentProps<'div'>) => (
    <div data-testid='drawer-handle' {...props}>
      {children}
    </div>
  ),
  DrawerClose: ({ children, ...props }: React.ComponentProps<'div'>) => (
    <div data-testid='drawer-close' {...props}>
      {children}
    </div>
  ),
}));

// ── Helpers ────────────────────────────────────────────────────────────

function renderInPanel(ui: React.ReactNode): ReturnType<typeof render> {
  return render(
    <FloatingPanel side='right' isOpen>
      {ui}
    </FloatingPanel>,
  );
}

function setMobileDrawerContext(): void {
  mockUseIsMobile.mockReturnValue(true);
  mockUseIsInsideDrawer.mockReturnValue(true);
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('FloatingPanelContentHeader', () => {
  it('matches the desktop Dockview tab-strip height', () => {
    renderInPanel(<FloatingPanelContentHeader>Title</FloatingPanelContentHeader>);

    expect(screen.getByText('Title')).toHaveClass('h-9');
  });
});

describe('FloatingPanelContentHeaderActions', () => {
  beforeEach(() => {
    mockUseIsMobile.mockReset().mockReturnValue(false);
    mockUseIsInsideDrawer.mockReset().mockReturnValue(false);
  });

  describe('mobile drawer context', () => {
    it('should fire child button onClick when clicked inside a mobile drawer', async () => {
      setMobileDrawerContext();
      const handleClick = vi.fn();
      const user = userEvent.setup();

      renderInPanel(
        <FloatingPanelContentHeader>
          <FloatingPanelContentTitle>Title</FloatingPanelContentTitle>
          <FloatingPanelContentHeaderActions>
            <FloatingPanelMenuButton aria-label='Test action' onClick={handleClick}>
              Action
            </FloatingPanelMenuButton>
          </FloatingPanelContentHeaderActions>
        </FloatingPanelContentHeader>,
      );

      await user.click(screen.getByRole('button', { name: 'Test action' }));
      expect(handleClick).toHaveBeenCalledOnce();
    });

    it('should stop click propagation from actions to the drawer handle', async () => {
      setMobileDrawerContext();
      const handleClick = vi.fn();
      const handleHandleClick = vi.fn();
      const user = userEvent.setup();

      render(
        <FloatingPanel side='right' isOpen>
          {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- test harness simulating DrawerHandle ancestor */}
          <div data-testid='handle-ancestor' onClick={handleHandleClick}>
            <FloatingPanelContentHeader>
              <FloatingPanelContentTitle>Title</FloatingPanelContentTitle>
              <FloatingPanelContentHeaderActions>
                <FloatingPanelMenuButton aria-label='Test action' onClick={handleClick}>
                  Action
                </FloatingPanelMenuButton>
              </FloatingPanelContentHeaderActions>
            </FloatingPanelContentHeader>
          </div>
        </FloatingPanel>,
      );

      await user.click(screen.getByRole('button', { name: 'Test action' }));

      expect(handleClick).toHaveBeenCalledOnce();
      expect(handleHandleClick).not.toHaveBeenCalled();
    });

    it('should stop pointerDown propagation from actions to the drawer handle', async () => {
      setMobileDrawerContext();
      const handlePointerDown = vi.fn();
      const user = userEvent.setup();

      render(
        <FloatingPanel side='right' isOpen>
          {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- test harness simulating DrawerHandle ancestor */}
          <div data-testid='handle-ancestor' onPointerDown={handlePointerDown}>
            <FloatingPanelContentHeader>
              <FloatingPanelContentTitle>Title</FloatingPanelContentTitle>
              <FloatingPanelContentHeaderActions>
                <FloatingPanelMenuButton aria-label='Test action'>Action</FloatingPanelMenuButton>
              </FloatingPanelContentHeaderActions>
            </FloatingPanelContentHeader>
          </div>
        </FloatingPanel>,
      );

      await user.click(screen.getByRole('button', { name: 'Test action' }));

      expect(handlePointerDown).not.toHaveBeenCalled();
    });

    it('should allow non-button clicks inside actions to propagate past the actions container', async () => {
      setMobileDrawerContext();
      const handleAncestorClick = vi.fn();
      const user = userEvent.setup();

      render(
        <FloatingPanel side='right' isOpen>
          {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- test harness simulating DrawerHandle ancestor */}
          <div data-testid='handle-ancestor' onClick={handleAncestorClick}>
            <FloatingPanelContentHeader>
              <FloatingPanelContentTitle>Title</FloatingPanelContentTitle>
              <FloatingPanelContentHeaderActions>
                <FloatingPanelMenuButton aria-label='Test action'>Action</FloatingPanelMenuButton>
                {/* Simulates portaled content (e.g. ComboBox drawer overlay) that is a React-tree
                    child of the actions container but NOT a FloatingPanelMenuButton */}
                <span data-testid='portaled-overlay-proxy'>Overlay</span>
              </FloatingPanelContentHeaderActions>
            </FloatingPanelContentHeader>
          </div>
        </FloatingPanel>,
      );

      await user.click(screen.getByTestId('portaled-overlay-proxy'));

      expect(handleAncestorClick).toHaveBeenCalledOnce();
    });

    it('should not let portaled content clicks cycle the parent drawer handle', async () => {
      setMobileDrawerContext();
      const handleHandleClick = vi.fn();
      const user = userEvent.setup();

      function PortaledOverlay(): React.JSX.Element {
        return createPortal(
          // oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- test harness simulating a portaled drawer overlay
          <div data-testid='portaled-overlay'>Overlay</div>,
          document.body,
        );
      }

      render(
        <FloatingPanel side='right' isOpen>
          {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- test harness simulating DrawerHandle ancestor */}
          <div data-testid='handle-ancestor' onClick={handleHandleClick}>
            <FloatingPanelContentHeader>
              <FloatingPanelContentTitle>Title</FloatingPanelContentTitle>
              <FloatingPanelContentHeaderActions>
                <FloatingPanelMenuButton aria-label='Test action'>Action</FloatingPanelMenuButton>
                <PortaledOverlay />
              </FloatingPanelContentHeaderActions>
            </FloatingPanelContentHeader>
          </div>
        </FloatingPanel>,
      );

      await user.click(screen.getByTestId('portaled-overlay'));

      expect(handleHandleClick).not.toHaveBeenCalled();
    });

    it('should allow portaled Radix dropdown content clicks to fire their handlers', async () => {
      setMobileDrawerContext();
      const handleItemClick = vi.fn();
      const handleHandleClick = vi.fn();
      const user = userEvent.setup();

      function PortaledDropdownContent(): React.JSX.Element {
        return createPortal(
          // Simulates the real structure: Radix wraps portaled content in
          // [data-radix-popper-content-wrapper]. DropdownMenuContent adds
          // onClick stopPropagation to prevent bubbling to ancestor handles.
          // oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- test harness simulating portaled Radix dropdown content
          <div
            data-radix-popper-content-wrapper=''
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <button data-testid='dropdown-item' type='button' onClick={handleItemClick}>
              Toggle Setting
            </button>
          </div>,
          document.body,
        );
      }

      render(
        <FloatingPanel side='right' isOpen>
          {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- test harness simulating DrawerHandle ancestor */}
          <div data-testid='handle-ancestor' onClick={handleHandleClick}>
            <FloatingPanelContentHeader>
              <FloatingPanelContentTitle>Title</FloatingPanelContentTitle>
              <FloatingPanelContentHeaderActions>
                <FloatingPanelMenuButton aria-label='Settings'>Settings</FloatingPanelMenuButton>
                <PortaledDropdownContent />
              </FloatingPanelContentHeaderActions>
            </FloatingPanelContentHeader>
          </div>
        </FloatingPanel>,
      );

      await user.click(screen.getByTestId('dropdown-item'));

      expect(handleItemClick).toHaveBeenCalledOnce();
      expect(handleHandleClick).not.toHaveBeenCalled();
    });

    it('should allow clicks on the title area to propagate to the drawer handle', async () => {
      setMobileDrawerContext();
      const handleHandleClick = vi.fn();
      const user = userEvent.setup();

      render(
        <FloatingPanel side='right' isOpen>
          {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- test harness simulating DrawerHandle ancestor */}
          <div data-testid='handle-ancestor' onClick={handleHandleClick}>
            <FloatingPanelContentHeader>
              <FloatingPanelContentTitle>Title</FloatingPanelContentTitle>
              <FloatingPanelContentHeaderActions>
                <FloatingPanelMenuButton aria-label='Test action'>Action</FloatingPanelMenuButton>
              </FloatingPanelContentHeaderActions>
            </FloatingPanelContentHeader>
          </div>
        </FloatingPanel>,
      );

      await user.click(screen.getByText('Title'));

      expect(handleHandleClick).toHaveBeenCalledOnce();
    });
  });

  describe('desktop context', () => {
    it('should not interfere with click propagation on desktop', async () => {
      const handleClick = vi.fn();
      const handleParentClick = vi.fn();
      const user = userEvent.setup();

      render(
        <FloatingPanel side='right' isOpen>
          {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- test harness simulating parent container */}
          <div onClick={handleParentClick}>
            <FloatingPanelContentHeader>
              <FloatingPanelContentTitle>Title</FloatingPanelContentTitle>
              <FloatingPanelContentHeaderActions>
                <FloatingPanelMenuButton aria-label='Test action' onClick={handleClick}>
                  Action
                </FloatingPanelMenuButton>
              </FloatingPanelContentHeaderActions>
            </FloatingPanelContentHeader>
          </div>
        </FloatingPanel>,
      );

      await user.click(screen.getByRole('button', { name: 'Test action' }));

      expect(handleClick).toHaveBeenCalledOnce();
      expect(handleParentClick).toHaveBeenCalledOnce();
    });
  });
});
