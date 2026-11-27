import { useSyncExternalStore } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MessageAnnotations } from '@taucad/chat/annotations';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { ImageMarkupDialog } from '#components/comments/image-markup-dialog.js';

const url = `attachments/${'a'.repeat(64)}.png`;

const store = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state: { annotations: MessageAnnotations | undefined } = { annotations: undefined };
  return {
    state,
    set(annotations: MessageAnnotations | undefined) {
      state.annotations = annotations;
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});

vi.mock('@taucad/chat-ui/hooks/use-attachment-source', () => ({
  useAttachmentSource: () => ({ status: 'ready', src: 'data:image/png;base64,AAAA' }),
}));
const phone = vi.hoisted(() => ({ isPhone: false }));
vi.mock('@taucad/ui/hooks/use-mobile', () => ({ useIsMobile: () => phone.isPhone }));
vi.mock('#components/dictation/use-dictation.js', () => ({
  useDictation: () => ({ available: false, phase: 'idle', transcript: '', waveform: [] }),
}));

// The jsdom environment has no PointerEvent, so fireEvent's pointer events would lose their pointer id.
class TestPointerEvent extends MouseEvent {
  public readonly pointerId: number;
  public readonly isPrimary: boolean;
  public readonly pointerType: string;
  public constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.isPrimary = init.isPrimary ?? true;
    this.pointerType = init.pointerType ?? 'mouse';
  }
}
Object.defineProperty(globalThis, 'PointerEvent', { value: TestPointerEvent, configurable: true });

const blank = (): MessageAnnotations => ({
  version: 1,
  comments: [],
  images: [{ id: 'img-1', width: 1000, height: 500, attachment: url, marks: [] }],
});

const renderDialog = (): HTMLElement => {
  function Harness(): React.JSX.Element {
    const annotations = useSyncExternalStore(store.subscribe, () => store.state.annotations);
    return (
      <ImageMarkupDialog
        image={{ url, mediaType: 'image/png' }}
        directory={undefined}
        record={{ annotations, setAnnotations: store.set, dropAttachments: vi.fn() }}
        onClose={vi.fn()}
      />
    );
  }
  render(
    <TooltipProvider>
      <Harness />
    </TooltipProvider>,
  );
  return screen.getByRole('img', { name: /^Image with/u });
};

/** A press, travel and release on the surface, at fractions of its 1000 by 500 box. */
const drag = (surface: HTMLElement, from: [number, number], to: [number, number]): void => {
  act(() => {
    fireEvent.pointerDown(surface, { button: 0, clientX: from[0] * 1000, clientY: from[1] * 500 });
    fireEvent.pointerMove(surface, { clientX: to[0] * 1000, clientY: to[1] * 500 });
    fireEvent.pointerUp(surface, { clientX: to[0] * 1000, clientY: to[1] * 500 });
  });
};

const click = (surface: HTMLElement, at: [number, number]): void => {
  act(() => {
    fireEvent.pointerDown(surface, { button: 0, clientX: at[0] * 1000, clientY: at[1] * 500 });
    fireEvent.pointerUp(surface, { clientX: at[0] * 1000, clientY: at[1] * 500 });
  });
};

const marks = () => store.state.annotations?.images[0]?.marks ?? [];

describe('ImageMarkupDialog', () => {
  beforeEach(() => {
    phone.isPhone = false;
    store.set(blank());
    HTMLElement.prototype.setPointerCapture = vi.fn();
    // The painter is tested on its own; here the canvas has no context to draw on.
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as unknown as HTMLCanvasElement['getContext'];
    HTMLElement.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 1000, 500);
  });

  it('should pin a comment on the picture where it is clicked, and open its card', () => {
    const surface = renderDialog();
    click(surface, [0.25, 0.5]);
    expect(store.state.annotations?.comments).toEqual([{ number: 1, text: '', image: 'img-1', at: [0.25, 0.5] }]);
    expect(screen.getByRole('textbox', { name: 'Comment 1' })).toBeInTheDocument();
  });

  it('should draw a pen stroke, and undo and redo it', async () => {
    const user = userEvent.setup();
    const surface = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Pen (P)' }));
    drag(surface, [0.1, 0.1], [0.4, 0.3]);
    expect(marks()).toEqual([
      {
        kind: 'pen',
        points: [
          [0.1, 0.1],
          [0.1, 0.1],
          [0.4, 0.3],
        ],
      },
    ]);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(marks()).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(marks()).toHaveLength(1);
  });

  it('should draw an arrow by click and click as well as by a drag', async () => {
    const user = userEvent.setup();
    const surface = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Arrow (A)' }));
    click(surface, [0.1, 0.5]);
    expect(marks()).toEqual([]);
    act(() => {
      fireEvent.pointerMove(surface, { clientX: 500, clientY: 250 });
    });
    click(surface, [0.5, 0.5]);
    expect(marks()).toEqual([{ kind: 'arrow', from: { at: [0.1, 0.5] }, to: { at: [0.5, 0.5] } }]);
  });

  it("should move a drawn mark by dragging its ink, or an arrow's tip alone, whatever the tool", () => {
    store.set({
      ...blank(),
      images: [
        {
          ...blank().images[0]!,
          marks: [
            { kind: 'arrow', from: { at: [0.1, 0.5] }, to: { at: [0.5, 0.5] } },
            { kind: 'rectangle', from: [0.6, 0.2], to: [0.8, 0.8] },
          ],
        },
      ],
    });
    const surface = renderDialog();
    drag(surface, [0.5, 0.5], [0.5, 0.8]);
    expect(marks()[0]).toEqual({ kind: 'arrow', from: { at: [0.1, 0.5] }, to: { at: [0.5, 0.8] } });
    drag(surface, [0.6, 0.5], [0.7, 0.5]);
    expect(marks()[1]).toEqual({ kind: 'rectangle', from: [0.7, 0.2], to: [0.9, 0.8] });
    // Neither press placed a pin, though the comment tool is on.
    expect(store.state.annotations?.comments).toEqual([]);
  });

  it('should move a picture pin by dragging its head', () => {
    store.set({ ...blank(), comments: [{ number: 1, text: 'Here', image: 'img-1', at: [0.2, 0.2] }] });
    const surface = renderDialog();
    const head = screen.getByRole('button', { name: 'Comment 1: Here' });
    act(() => {
      fireEvent.pointerDown(head, { button: 0, clientX: 200, clientY: 100 });
      fireEvent.pointerMove(surface, { clientX: 600, clientY: 300 });
      fireEvent.pointerUp(surface, { clientX: 600, clientY: 300 });
    });
    expect(store.state.annotations?.comments[0]?.at).toEqual([0.6, 0.6]);
  });

  it('should place a pin at the centre and nudge it with the arrow keys, by keyboard alone', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('button', { name: 'Comment at the centre' }));
    expect(store.state.annotations?.comments[0]?.at).toEqual([0.5, 0.5]);
    await user.click(screen.getByRole('button', { name: 'Done' }));
    const head = screen.getByRole('button', { name: 'Comment 1' });
    head.focus();
    await user.keyboard('{ArrowRight}{Shift>}{ArrowDown}{/Shift}');
    const at = store.state.annotations?.comments[0]?.at;
    expect(at?.[0]).toBeCloseTo(0.51);
    expect(at?.[1]).toBeCloseTo(0.55);
  });

  it('should dock the open card under the picture on a phone, with its own Done', async () => {
    phone.isPhone = true;
    const user = userEvent.setup();
    const surface = renderDialog();
    click(surface, [0.25, 0.5]);
    const card = screen.getByRole('group', { name: 'Comment 1' });
    expect(card).toContainElement(screen.getByRole('textbox', { name: 'Comment 1' }));
    await user.click(within(card).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('group', { name: 'Comment 1' })).not.toBeInTheDocument();
  });

  it('should zoom by a two finger pinch, which neither draws nor pins', () => {
    const surface = renderDialog();
    const touch = { pointerType: 'touch', button: 0 } as const;
    act(() => {
      fireEvent.pointerDown(surface, { ...touch, pointerId: 1, clientX: 400, clientY: 250 });
      fireEvent.pointerDown(surface, { ...touch, pointerId: 2, isPrimary: false, clientX: 600, clientY: 250 });
      fireEvent.pointerMove(surface, { ...touch, pointerId: 2, clientX: 800, clientY: 250 });
      fireEvent.pointerUp(surface, { ...touch, pointerId: 2, clientX: 800, clientY: 250 });
      fireEvent.pointerUp(surface, { ...touch, pointerId: 1, clientX: 400, clientY: 250 });
    });
    expect(store.state.annotations?.comments).toEqual([]);
    expect(marks()).toEqual([]);
    // The fingers spread from 200 to 400 pixels apart: twice the size.
    expect(surface.parentElement?.style.width).toMatch(/^calc\(2 \*/u);
  });
});
