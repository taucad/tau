// @vitest-environment jsdom
import { useRef, useState } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tauEditorPanelDragMime, tauFileDragMime, tauViewerPanelDragMime } from '@taucad/types/constants';
import type { ChatTextareaDragKind } from '#components/chat/chat-textarea-types.js';
import type { ChatDragEvent } from '#components/chat/chat-drop-zone.js';
import {
  ChatDropOverlay,
  chatDragKindOf,
  chatDropZoneKindOf,
  useChatDropZone,
} from '#components/chat/chat-drop-zone.js';

afterEach(() => {
  cleanup();
});

describe('chatDropZoneKindOf', () => {
  it.each([
    ['viewer', [tauViewerPanelDragMime]],
    ['reference', [tauEditorPanelDragMime]],
    ['reference', [tauFileDragMime]],
    ['image', ['Files']],
    ['image', ['Files', 'application/x-moz-file']],
  ] as const)('should take a %s drag carrying %j', (kind, types) => {
    expect(chatDropZoneKindOf(types)).toBe(kind);
  });

  it.each([[['text/plain']], [['text/plain', 'text/html']], [['text/uri-list']], [[]]])(
    'should leave a drag carrying only %j to the page',
    (types) => {
      expect(chatDropZoneKindOf(types)).toBeUndefined();
    },
  );

  it('should name every kind the composer itself names', () => {
    for (const types of [[tauViewerPanelDragMime], [tauEditorPanelDragMime], [tauFileDragMime], ['Files']]) {
      expect(chatDropZoneKindOf(types)).toBe(chatDragKindOf(types));
    }
  });
});

type HarnessProperties = {
  readonly isEnabled?: boolean;
  readonly onDrop: (event: ChatDragEvent) => Promise<void>;
};

/** A pane holding a transcript, an edit box and the main composer, as the chat panel does. */
function Harness({ isEnabled = true, onDrop }: HarnessProperties): React.JSX.Element {
  const containerReference = useRef<HTMLDivElement>(null);
  const [dragKind, setDragKind] = useState<ChatTextareaDragKind | undefined>(undefined);
  const zone = useChatDropZone({
    isEnabled,
    containerReference,
    onDragOver(event) {
      event.preventDefault();
      setDragKind(chatDragKindOf(event.dataTransfer.types));
    },
    onDragLeave() {
      setDragKind(undefined);
    },
    async onDrop(event) {
      setDragKind(undefined);
      await onDrop(event);
    },
  });
  return (
    <section aria-label='Chat' data-chat-drop-zone=''>
      <p>An earlier answer</p>
      <div data-chat-composer='edit'>
        <p>Edit box</p>
      </div>
      <div data-chat-composer='main'>
        <div ref={containerReference}>Composer</div>
      </div>
      <output aria-label='Drop zone'>{zone === undefined ? 'none' : (zone.getAttribute('aria-label') ?? '')}</output>
      <output aria-label='Drag kind'>{dragKind ?? 'none'}</output>
    </section>
  );
}

const dragEvent = (
  type: string,
  types: readonly string[],
  init: { relatedTarget?: EventTarget; files?: readonly File[] } = {},
): Event => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    dataTransfer: {
      value: { types, files: init.files ?? [], getData: () => '' },
    },
    relatedTarget: { value: init.relatedTarget ?? null },
  });
  return event;
};

const fire = (target: Element, event: Event): Event => {
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};

describe('useChatDropZone', () => {
  it('should find the pane the composer sits in', () => {
    render(<Harness onDrop={vi.fn(async () => undefined)} />);

    expect(screen.getByRole('status', { name: 'Drop zone' })).toHaveTextContent('Chat');
  });

  it('should find no pane when it is not enabled, so the composer keeps its own target', () => {
    render(<Harness isEnabled={false} onDrop={vi.fn(async () => undefined)} />);

    expect(screen.getByRole('status', { name: 'Drop zone' })).toHaveTextContent('none');
    const event = fire(screen.getByText('An earlier answer'), dragEvent('dragover', ['Files']));
    expect(event.defaultPrevented).toBe(false);
    expect(screen.getByRole('status', { name: 'Drag kind' })).toHaveTextContent('none');
  });

  it('should take files dragged over the transcript, far from the composer', () => {
    render(<Harness onDrop={vi.fn(async () => undefined)} />);

    const event = fire(screen.getByText('An earlier answer'), dragEvent('dragover', ['Files']));

    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByRole('status', { name: 'Drag kind' })).toHaveTextContent('image');
  });

  it('should take a viewer tab dragged anywhere in the pane, keeping its own kind', () => {
    render(<Harness onDrop={vi.fn(async () => undefined)} />);

    fire(screen.getByText('An earlier answer'), dragEvent('dragenter', [tauViewerPanelDragMime]));

    expect(screen.getByRole('status', { name: 'Drag kind' })).toHaveTextContent('viewer');
  });

  it('should leave a text selection drag to the page', () => {
    render(<Harness onDrop={vi.fn(async () => undefined)} />);

    const event = fire(screen.getByText('An earlier answer'), dragEvent('dragover', ['text/plain']));

    expect(event.defaultPrevented).toBe(false);
    expect(screen.getByRole('status', { name: 'Drag kind' })).toHaveTextContent('none');
  });

  it('should hand a drop anywhere in the pane to the composer once', async () => {
    const onDrop = vi.fn(async (_event: ChatDragEvent) => undefined);
    render(<Harness onDrop={onDrop} />);
    const photo = new File(['photo'], 'photo.heic', { type: 'image/heic' });

    fire(screen.getByText('An earlier answer'), dragEvent('dragover', ['Files'], { files: [photo] }));
    const event = fire(screen.getByText('An earlier answer'), dragEvent('drop', ['Files'], { files: [photo] }));
    await act(async () => undefined);

    expect(onDrop).toHaveBeenCalledOnce();
    expect(onDrop.mock.calls[0]![0].dataTransfer.files).toEqual([photo]);
    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByRole('status', { name: 'Drag kind' })).toHaveTextContent('none');
  });

  it('should leave a drop on another composer in the pane to that composer', async () => {
    const onDrop = vi.fn(async (_event: ChatDragEvent) => undefined);
    render(<Harness onDrop={onDrop} />);

    fire(screen.getByText('An earlier answer'), dragEvent('dragover', ['Files']));
    fire(screen.getByText('Edit box'), dragEvent('dragover', ['Files']));
    expect(screen.getByRole('status', { name: 'Drag kind' })).toHaveTextContent('none');
    const event = fire(screen.getByText('Edit box'), dragEvent('drop', ['Files']));
    await act(async () => undefined);

    expect(onDrop).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('should hold the target while the drag moves between elements inside the pane', () => {
    render(<Harness onDrop={vi.fn(async () => undefined)} />);
    const transcript = screen.getByText('An earlier answer');

    fire(transcript, dragEvent('dragover', ['Files']));
    fire(transcript, dragEvent('dragleave', ['Files'], { relatedTarget: screen.getByText('Composer') }));

    expect(screen.getByRole('status', { name: 'Drag kind' })).toHaveTextContent('image');
  });

  it('should release the target when the drag leaves the pane', () => {
    render(<Harness onDrop={vi.fn(async () => undefined)} />);
    const transcript = screen.getByText('An earlier answer');

    fire(transcript, dragEvent('dragover', ['Files']));
    fire(transcript, dragEvent('dragleave', ['Files'], { relatedTarget: document.body }));

    expect(screen.getByRole('status', { name: 'Drag kind' })).toHaveTextContent('none');
  });

  it('should stop listening once unmounted', () => {
    const onDrop = vi.fn(async (_event: ChatDragEvent) => undefined);
    const { unmount } = render(<Harness onDrop={onDrop} />);
    const pane = screen.getByRole('region', { name: 'Chat' });
    unmount();
    document.body.append(pane);

    const event = fire(pane, dragEvent('dragover', ['Files']));

    expect(event.defaultPrevented).toBe(false);
    pane.remove();
  });
});

describe('ChatDropOverlay', () => {
  it('should centre the kind copy over the whole area without a fill or blur', () => {
    render(<ChatDropOverlay kind='image' />);

    const label = screen.getByText('Add files');
    const overlay = label.parentElement!;
    expect(overlay).toHaveClass('pointer-events-none', 'absolute', 'inset-0', 'items-center', 'justify-center');
    expect(overlay.className).not.toMatch(/\bbg-|backdrop-blur/u);
  });

  it.each([
    ['viewer', 'Add screenshot'],
    ['reference', 'Add reference'],
  ] as const)('should keep the %s copy', (kind, copy) => {
    render(<ChatDropOverlay kind={kind} />);

    expect(screen.getByText(copy)).toBeInTheDocument();
  });
});
