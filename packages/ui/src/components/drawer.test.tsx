import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '#components/drawer.js';

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
  Object.defineProperty(globalThis, 'visualViewport', { configurable: true, value: viewport });
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
  it('should give list rows a 44px touch height and keep the caller className', () => {
    const content = renderDrawer(undefined);

    expect(content).toHaveClass('[&_[data-slot=command-item]]:min-h-10', 'custom-drawer');
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
