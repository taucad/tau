import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnnotationCamera, MessageAnnotations } from '@taucad/chat/annotations';
import { useCommentPins } from '@taucad/viewer/cad/comment-pins';
import type { CommentSurfacePick } from '@taucad/viewer/cad/comment-pins';
import { ViewerCommentHeads, ViewerComments } from '#components/comments/viewer-comments.js';
import { ShownCommentsProvider, useShownComments } from '#components/comments/shown-comments.js';

const camera: AnnotationCamera = {
  frameId: 'tau:root',
  position: [1, 1, 1],
  target: [0, 0, 0],
  up: [0, 0, 1],
  projection: { kind: 'perspective', verticalFieldOfView: 45, zoom: 1 },
  clipping: { near: 0.01, far: 10 },
  aspect: 1.5,
};

const scene = { path: 'main.ts', revision: 'r1', scene: 's1' };

const annotations: MessageAnnotations = {
  version: 1,
  comments: [{ number: 1, text: 'Taller', image: 'img-1', model: { point: [0, 0, 0], normal: [0, 0, 1] } }],
  images: [{ id: 'img-1', width: 800, height: 533, view: { ...scene, camera }, forPin: true, marks: [] }],
  nextNumber: 2,
};

type DraftContext = {
  draftAnnotations: MessageAnnotations | undefined;
  draftAttachments: readonly unknown[];
  activeEditMessageId?: string;
};

const draft = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const context: Record<string, unknown> = {};
  const state = { snapshot: { context } };
  return {
    state,
    actor: {
      send: vi.fn(),
      getSnapshot: () => state.snapshot,
      subscribe(listener: () => void) {
        listeners.add(listener);
        return { unsubscribe: () => listeners.delete(listener) };
      },
    },
  };
});
const graphics = vi.hoisted(() => ({
  actor: { send: vi.fn(), getSnapshot: () => ({ context: {} }), subscribe: () => ({ unsubscribe: vi.fn() }) },
}));

vi.mock('#flags/use-feature.js', () => ({ useFeatureState: () => 'on' }));
vi.mock('#hooks/active-chat-provider.js', () => ({
  useOptionalChatComposer: () => ({
    draftActorRef: draft.actor,
    execution: { execution: undefined },
    model: { model: undefined },
  }),
}));
vi.mock('#hooks/use-cad.js', () => ({ useCad: () => ({}) }));
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectRef: { send: vi.fn() } }) }));
vi.mock('#providers/headless-image-provider.js', () => ({ useOptionalHeadlessImageService: () => ({}) }));
vi.mock('#services/headless-capture.js', () => ({
  captureCadImages: vi.fn(),
  captureFilesToDataUrls: vi.fn(),
  pinPictureSize: () => [800, 533],
  presentedSceneHash: () => 's1',
}));
vi.mock('#utils/chat.utils.js', () => ({ attachmentModelForExecution: () => undefined }));
vi.mock('#components/dictation/use-dictation.js', () => ({
  useDictation: () => ({
    available: true,
    phase: 'idle',
    transcript: '',
    waveform: [],
    start: vi.fn(),
    stop: vi.fn(),
    cancel: vi.fn(),
  }),
}));
vi.mock('#components/dictation/dictation-controls.js', () => ({
  DictationControl: () => <button type='button'>Dictate</button>,
  DictationFeedback: () => null,
}));
vi.mock('@taucad/viewer/hooks/use-graphics', () => ({
  useOptionalGraphics: () => graphics.actor,
  useOptionalGraphicsSelector: () => 'r1',
}));
vi.mock('@taucad/viewer/graphics/graphics-camera', () => ({ getGraphicsCameraState: () => camera }));

// The jsdom environment has no PointerEvent, so fireEvent's pointer events would lose their pointer id.
class TestPointerEvent extends MouseEvent {
  public readonly pointerId: number;
  public readonly isPrimary: boolean;
  public constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
    this.isPrimary = init.isPrimary ?? false;
  }
}
Object.defineProperty(globalThis, 'PointerEvent', { value: TestPointerEvent, configurable: true });

const pickAt = (point: [number, number, number]): CommentSurfacePick => ({
  point,
  normal: [0, 0, 1],
  geometryKey: 'r1',
  camera: camera as unknown as CommentSurfacePick['camera'],
});

/** Stands in for the scene: gives the heads a surface whose pick is set per test. */
function Surface({ pick }: { readonly pick: CommentSurfacePick | undefined }): undefined {
  const pins = useCommentPins();
  if (pins) {
    pins.heads.surface.current = { pick: () => pick, hover: vi.fn() };
    pins.heads.place('1', { x: 5, y: 5, isOccluded: false, isOffscreen: false });
  }
  return undefined;
}

function ShowSent(): React.JSX.Element {
  const shown = useShownComments();
  return (
    <button type='button' onClick={() => shown?.show({ messageId: 'msg-1', annotations })}>
      Show sent
    </button>
  );
}

const renderViewer = (pick?: CommentSurfacePick): void => {
  render(
    <ShownCommentsProvider chatId='chat-1'>
      <ShowSent />
      <ViewerComments entryPath='main.ts' kernelView={undefined} instance={undefined} isOffered>
        <Surface pick={pick} />
        <ViewerCommentHeads />
      </ViewerComments>
    </ShownCommentsProvider>,
  );
};

const sentAnnotations = (): MessageAnnotations | undefined =>
  draft.actor.send.mock.calls
    .map(([event]) => event as { type: string; annotations?: MessageAnnotations })
    .findLast((event) => event.type === 'setDraftAnnotations')?.annotations;

describe('ViewerComments', () => {
  beforeEach(() => {
    // The jsdom environment has no pointer capture.
    HTMLElement.prototype.setPointerCapture = vi.fn();
    draft.actor.send.mockClear();
    graphics.actor.send.mockClear();
    const context: DraftContext = { draftAnnotations: annotations, draftAttachments: [] };
    draft.state.snapshot = { context };
  });

  it("should move a draft pin from its card's Move and the next click on the model", async () => {
    const user = userEvent.setup();
    renderViewer();
    await user.click(screen.getByRole('button', { name: 'Comment 1: Taller' }));
    expect(screen.getByRole('button', { name: 'Dictate' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Move' }));
    expect(screen.getByRole('status')).toHaveTextContent('Click the model where comment 1 goes');
    expect(graphics.actor.send).toHaveBeenCalledWith({ type: 'setCommentActive', payload: true });
  });

  it('should move a draft pin when its head is dragged onto the model', () => {
    renderViewer(pickAt([0.02, 0, 0]));
    const head = screen.getByRole('button', { name: 'Comment 1: Taller' });
    act(() => {
      fireEvent.pointerDown(head, { button: 0, isPrimary: true, pointerId: 1, clientX: 10, clientY: 10 });
      fireEvent.pointerMove(head, { pointerId: 1, clientX: 40, clientY: 30 });
      fireEvent.pointerUp(head, { pointerId: 1, clientX: 40, clientY: 30 });
    });
    const moved = sentAnnotations();
    expect(moved?.comments.map(({ number, text, model }) => [number, text, model?.point])).toEqual([
      [1, 'Taller', [0.02, 0, 0]],
    ]);
    expect(moved?.images).toHaveLength(1);
  });

  it('should leave a pin where it was when a drag ends over nothing', () => {
    renderViewer(undefined);
    const head = screen.getByRole('button', { name: 'Comment 1: Taller' });
    act(() => {
      fireEvent.pointerDown(head, { button: 0, isPrimary: true, pointerId: 1, clientX: 10, clientY: 10 });
      fireEvent.pointerMove(head, { pointerId: 1, clientX: 40, clientY: 30 });
      fireEvent.pointerUp(head, { pointerId: 1, clientX: 40, clientY: 30 });
    });
    expect(sentAnnotations()).toBeUndefined();
  });

  it("should show a sent message's pins read-only, under a banner that hides them", async () => {
    const user = userEvent.setup();
    draft.state.snapshot = { context: { draftAnnotations: undefined, draftAttachments: [] } };
    renderViewer(pickAt([0.02, 0, 0]));
    await user.click(screen.getByRole('button', { name: 'Show sent' }));
    expect(screen.getByRole('status')).toHaveTextContent('Showing comments from an earlier message');
    const head = screen.getByRole('button', { name: 'Comment 1: Taller' });
    expect(head).toHaveAttribute('data-sent', 'true');
    await user.click(head);
    expect(screen.queryByRole('button', { name: 'Move' })).not.toBeInTheDocument();
    act(() => {
      fireEvent.pointerDown(head, { button: 0, isPrimary: true, pointerId: 1, clientX: 10, clientY: 10 });
      fireEvent.pointerMove(head, { pointerId: 1, clientX: 40, clientY: 30 });
      fireEvent.pointerUp(head, { pointerId: 1, clientX: 40, clientY: 30 });
    });
    expect(sentAnnotations()).toBeUndefined();
    await user.click(screen.getByRole('button', { name: 'Hide' }));
    expect(screen.queryByRole('button', { name: 'Comment 1: Taller' })).not.toBeInTheDocument();
  });
});
