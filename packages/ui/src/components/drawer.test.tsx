import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle, drawerGrabStrip } from '#components/drawer.js';

/** A visual viewport the test drives, standing in for a phone's software keyboard. */
class VisualViewportStub extends EventTarget {
  public height = globalThis.innerHeight;
  public offsetTop = 0;
  public scale = 1;

  public showKeyboard(keyboardHeight: number, pan = 0): void {
    this.height = globalThis.innerHeight - keyboardHeight;
    this.offsetTop = pan;
    this.dispatchEvent(new Event('resize'));
  }
}

let viewport: VisualViewportStub;
const scrollIntoView = vi.fn<(options?: ScrollIntoViewOptions | boolean) => void>();

beforeEach(() => {
  viewport = new VisualViewportStub();
  scrollIntoView.mockClear();
  // Jsdom does no layout, so it has no scrollIntoView.
  HTMLElement.prototype.scrollIntoView = scrollIntoView;
  Object.defineProperty(globalThis, 'visualViewport', {
    configurable: true,
    value: viewport,
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'visualViewport');
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
});

const renderDrawer = (field: React.ReactNode): HTMLElement => {
  render(
    <Drawer open>
      <DrawerContent className='custom-drawer'>
        <DrawerTitle>Pick</DrawerTitle>
        <DrawerDescription>Pick one.</DrawerDescription>
        {field}
      </DrawerContent>
    </Drawer>,
  );
  return screen.getByRole('dialog');
};

describe('DrawerContent', () => {
  it('should give list rows and their filter field the touch row height and keep the caller className', () => {
    const content = renderDrawer(undefined);

    expect(content).toHaveClass(
      '[&_[data-slot=command-item]]:min-h-touch-row',
      '[&_[data-slot=command-input]]:h-touch-row',
      'custom-drawer',
    );
  });

  it('should keep fields selectable inside the unselectable drawer', () => {
    const content = renderDrawer(undefined);

    expect(content).toHaveClass('select-none', '[&_:is(input,textarea,[contenteditable=true])]:select-text');
  });

  it('should fill the frame above the keyboard while a field inside it is focused', () => {
    const content = renderDrawer(<input aria-label='Search' />);
    act(() => {
      screen.getByRole('textbox', { name: 'Search' }).focus();
      viewport.showKeyboard(300, 120);
    });

    expect(content).toHaveAttribute('data-keyboard', 'open');
    // The visible frame runs from the 120px pan to the keyboard's top edge, 300 - 120 above the layout bottom.
    expect(content.style.getPropertyValue('--keyboard-frame-bottom')).toBe('180px');
    expect(content.style.getPropertyValue('--keyboard-frame-height')).toBe(`${globalThis.innerHeight - 300}px`);
    // A field low in a scrolling panel is brought back into the smaller frame.
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('should release the frame when the field loses focus', () => {
    const content = renderDrawer(<input aria-label='Search' />);
    const field = screen.getByRole('textbox', { name: 'Search' });
    act(() => {
      field.focus();
      viewport.showKeyboard(300);
    });
    act(() => {
      field.blur();
    });

    expect(content).not.toHaveAttribute('data-keyboard');
    expect(content.style.getPropertyValue('--keyboard-frame-height')).toBe('');
  });

  it('should not treat a focused button as typing', () => {
    const content = renderDrawer(<button type='button'>Choose</button>);
    act(() => {
      screen.getByRole('button', { name: 'Choose' }).focus();
      viewport.showKeyboard(300);
    });

    expect(content).not.toHaveAttribute('data-keyboard');
  });

  it('should not read a pinch zoom or browser chrome as a keyboard', () => {
    const content = renderDrawer(<input aria-label='Search' />);
    act(() => {
      screen.getByRole('textbox', { name: 'Search' }).focus();
      viewport.showKeyboard(80);
    });
    expect(content).not.toHaveAttribute('data-keyboard');

    act(() => {
      viewport.scale = 2;
      viewport.showKeyboard(400);
    });
    expect(content).not.toHaveAttribute('data-keyboard');
  });
});

describe('drawer grabber target', () => {
  it('should give the grabber an 8px row, its bar at the row foot, and a target from 8px above the sheet edge (D4, I3)', () => {
    render(
      <Drawer open snapPoints={[0.25, 1]}>
        <DrawerContent>
          <DrawerTitle>Workbench</DrawerTitle>
          <DrawerDescription>Review panes</DrawerDescription>
        </DrawerContent>
      </Drawer>,
    );
    const handle = screen.getByRole('slider', { name: 'Drawer height' });
    const row = handle.parentElement!;
    const content = handle.closest('[data-slot=drawer-content]')!;
    // 2 × 4px spacing: the row is the grabber box, which the surface below starts after.
    expect(content).toHaveClass('[--drawer-handle-height:calc(var(--spacing)*2)]');
    expect(row).toHaveClass('h-(--drawer-handle-height)', 'relative');
    // The bar ends where the row does: no empty band between it and a header below, which keeps a header's actions
    // as far below the bar as above the header's foot.
    const bar = row.querySelector('[data-slot=drawer-handle-indicator]');
    expect(bar).toHaveClass('absolute', 'bottom-0', 'h-1');
    expect(bar).not.toHaveClass('top-1/2');
    /* The target spans the row's width, starts 8px (2 × 4px) above it and ends its reach below the row's foot: none
       here, where nothing marks a grab strip and the whole sheet drags. */
    expect(handle).toHaveClass(
      'absolute!',
      'inset-x-0!',
      '-top-2!',
      'bottom-[calc(-1*var(--drawer-handle-reach))]!',
      'h-auto!',
      'w-full!',
      'z-1',
    );
    expect(handle).not.toHaveClass('inset-0!', 'size-full!');
    expect(content).toHaveClass('[--drawer-handle-reach:0px]');
    expect(content).not.toHaveClass(
      'has-[[data-drawer-grab-strip]]:[--drawer-handle-reach:var(--drawer-grab-strip-height)]',
    );
  });

  it('should reach the target of a handle-only sheet over its 60px grab strip: 76px in all, the strip’s controls on top', () => {
    render(
      <Drawer open handleOnly snapPoints={[0.5, 1]}>
        <DrawerContent>
          <DrawerTitle>Workbench</DrawerTitle>
          <DrawerDescription>Review panes</DrawerDescription>
          <div data-testid='strip' {...drawerGrabStrip}>
            Parameters
            <button type='button'>Close</button>
          </div>
        </DrawerContent>
      </Drawer>,
    );
    const handle = screen.getByRole('slider', { name: 'Drawer height' });
    const content = handle.closest('[data-slot=drawer-content]')!;
    // 8px above the edge, the 8px row and the 60px strip: 76px, without a pixel of its own below the bar.
    expect(content).toHaveClass(
      '[--drawer-bar-height:calc(var(--spacing)*15)]',
      '[--drawer-grab-strip-height:var(--drawer-bar-height)]',
      'has-[[data-drawer-grab-strip]]:[--drawer-handle-reach:var(--drawer-grab-strip-height)]',
    );
    // The strip paints above the target (z-2 over z-1) and lets only its controls take a pointer.
    const strip = screen.getByTestId('strip');
    expect(strip).toHaveAttribute('data-drawer-grab-strip');
    expect(strip).toHaveClass('relative', 'z-2', 'h-(--drawer-grab-strip-height)', 'pointer-events-none');
    expect(strip.className).toContain(
      '[&_:is(button,a,input,select,textarea,[role=button],[role=combobox],[tabindex])]:pointer-events-auto',
    );
  });

  it('should leave the detent where it is when the grabber is tapped: only a drag and the keys move it (W1)', async () => {
    render(
      <Drawer open handleOnly snapPoints={[0.5, 1]} detentNames={['Half', 'Full']}>
        <DrawerContent>
          <DrawerTitle>Workbench</DrawerTitle>
          <DrawerDescription>Review panes</DrawerDescription>
        </DrawerContent>
      </Drawer>,
    );
    const handle = screen.getByRole('slider', { name: 'Drawer height' });

    fireEvent.click(handle);
    // Past vaul's double-tap wait, after which a tap would cycle.
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 300);
      });
    });

    expect(handle).toHaveAttribute('aria-valuetext', 'Half');
    fireEvent.keyDown(handle, { key: 'Enter' });
    expect(handle).toHaveAttribute('aria-valuetext', 'Full');
  });
});

describe('drawer height keyboard controls', () => {
  it('should expose its current snap point and clamp arrow navigation without dismissing', () => {
    const onOpenChange = vi.fn<(open: boolean) => void>();
    render(
      <Drawer open snapPoints={[0.25, 0.58, 1]} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerTitle>Workbench</DrawerTitle>
          <DrawerDescription>Review panes</DrawerDescription>
        </DrawerContent>
      </Drawer>,
    );
    const handle = screen.getByRole('slider', { name: 'Drawer height' });
    expect(handle).toHaveAttribute('aria-valuetext', 'Peek');
    fireEvent.keyDown(handle, { key: 'ArrowUp' });
    expect(handle).toHaveAttribute('aria-valuetext', 'Half');
    fireEvent.keyDown(handle, { key: 'End' });
    fireEvent.keyDown(handle, { key: 'ArrowUp' });
    expect(handle).toHaveAttribute('aria-valuenow', '3');
    fireEvent.keyDown(handle, { key: 'Home' });
    fireEvent.keyDown(handle, { key: 'ArrowDown' });
    expect(handle).toHaveAttribute('aria-valuenow', '1');
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('should name the detents of a two-detent drawer Peek and Full', () => {
    render(
      <Drawer open snapPoints={['240px', 1]}>
        <DrawerContent>
          <DrawerTitle>Workbench</DrawerTitle>
          <DrawerDescription>Review panes</DrawerDescription>
        </DrawerContent>
      </Drawer>,
    );
    const handle = screen.getByRole('slider', { name: 'Drawer height' });
    expect(handle).toHaveAttribute('aria-valuetext', 'Peek');
    fireEvent.keyDown(handle, { key: 'ArrowUp' });
    expect(handle).toHaveAttribute('aria-valuetext', 'Full');
  });

  it('should name its detents as the drawer names them', () => {
    render(
      <Drawer open snapPoints={[0.5, 1]} detentNames={['Half', 'Full']}>
        <DrawerContent>
          <DrawerTitle>Workbench</DrawerTitle>
          <DrawerDescription>Review panes</DrawerDescription>
        </DrawerContent>
      </Drawer>,
    );
    const handle = screen.getByRole('slider', { name: 'Drawer height' });
    expect(handle).toHaveAttribute('aria-valuetext', 'Half');
    expect(handle).toHaveAttribute('aria-valuemax', '2');
    fireEvent.keyDown(handle, { key: 'ArrowUp' });
    expect(handle).toHaveAttribute('aria-valuetext', 'Full');
  });

  it('should cycle through its detents with Enter and Space, wrapping from the tallest to the first', () => {
    const onOpenChange = vi.fn<(open: boolean) => void>();
    render(
      <Drawer open snapPoints={[0.25, 0.58, 1]} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerTitle>Workbench</DrawerTitle>
          <DrawerDescription>Review panes</DrawerDescription>
        </DrawerContent>
      </Drawer>,
    );
    const handle = screen.getByRole('slider', { name: 'Drawer height' });
    expect(handle).toHaveAttribute('aria-valuetext', 'Peek');
    expect(fireEvent.keyDown(handle, { key: 'Enter' })).toBe(false);
    expect(handle).toHaveAttribute('aria-valuetext', 'Half');
    // Handled, so Space neither scrolls the page nor reaches a parent's key handler.
    expect(fireEvent.keyDown(handle, { key: ' ' })).toBe(false);
    expect(handle).toHaveAttribute('aria-valuetext', 'Full');
    fireEvent.keyDown(handle, { key: 'Enter' });
    expect(handle).toHaveAttribute('aria-valuetext', 'Peek');
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('should send keyboard snap changes to a controlled host', () => {
    const setActiveSnapPoint = vi.fn<NonNullable<React.ComponentProps<typeof Drawer>['setActiveSnapPoint']>>();
    render(
      <Drawer open snapPoints={[0.25, 0.58, 1]} activeSnapPoint={0.58} setActiveSnapPoint={setActiveSnapPoint}>
        <DrawerContent>
          <DrawerTitle>Workbench</DrawerTitle>
          <DrawerDescription>Review panes</DrawerDescription>
        </DrawerContent>
      </Drawer>,
    );
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Drawer height' }), {
      key: 'ArrowDown',
    });
    expect(setActiveSnapPoint).toHaveBeenCalledWith(0.25);
  });
});
