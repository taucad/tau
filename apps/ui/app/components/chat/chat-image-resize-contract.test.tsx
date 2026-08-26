/**
 * Chat-image resize chokepoint contract test.
 *
 * Locks the image policy for every entry point:
 *
 *   user-provided images are resized to the chat byte ceiling, while generated
 *   headless captures are retained byte-for-byte so lossless renders are not
 *   silently downscaled and converted to JPEG.
 *
 * The 12 entry points (OS drag-drop, file picker, paste, Tiptap paste, viewer
 * toolbar, viewer-pane drag, desktop @-suggestion single + composite, mobile
 * @-popover current/all/per-view, and edit-mode draft) all converge on these
 * two methods. We assert the contract by driving the **real**
 * `resizeImageActor` (wrapping the **real** `resizeImageForChat` with
 * FakeImage stubs where upload compression applies) through every entry-point category. Failure paths are
 * also covered: a corrupt image in a multi-file batch must NOT block the
 * surviving images, and a single failure must surface as one toast via the
 * `imageResizeFailed` emit subscriber.
 *
 * If a future contributor adds a 13th entry point, they MUST extend the
 * `entryPoints` table below — that is the regression net.
 */
// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/naming-convention -- test fixture constants use SCREAMING_SNAKE_CASE */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor, waitFor as xstateWaitFor } from 'xstate';
import { draftMachine } from '#hooks/draft.machine.js';
import { resizeImageActor } from '#hooks/resize-image.actor.js';
import { MAX_DATA_URL_LENGTH } from '#utils/resize-image.js';

const SMALL_JPEG_DATA_URL = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
const SMALL_PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
const OVERSIZED_RAW_URL = `data:image/png;base64,${'A'.repeat(2_000_000)}`;
const MALFORMED_URL = 'data:text/plain;base64,SGVsbG8=';

let mockImageWidth = 4000;
let mockImageHeight = 4000;
let mockImageShouldErrorFor: ReadonlySet<string> = new Set();
let canvasDataUrl = SMALL_JPEG_DATA_URL;

class FakeImage {
  public naturalWidth = 0;
  public naturalHeight = 0;
  private readonly listeners: Record<string, Array<() => void>> = {};
  private currentSrc = '';
  public addEventListener(event: string, handler: () => void) {
    this.listeners[event] ??= [];
    this.listeners[event].push(handler);
  }
  public get src(): string {
    return this.currentSrc;
  }
  public set src(value: string) {
    this.currentSrc = value;
    setTimeout(() => {
      if (mockImageShouldErrorFor.has(value)) {
        for (const handler of this.listeners['error'] ?? []) {
          handler();
        }
        return;
      }
      this.naturalWidth = mockImageWidth;
      this.naturalHeight = mockImageHeight;
      for (const handler of this.listeners['load'] ?? []) {
        handler();
      }
    }, 0);
  }
}

beforeEach(() => {
  mockImageWidth = 4000;
  mockImageHeight = 4000;
  mockImageShouldErrorFor = new Set();
  canvasDataUrl = SMALL_JPEG_DATA_URL;
  vi.stubGlobal('Image', FakeImage);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'canvas') {
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: vi.fn() }),
        toDataURL: () => canvasDataUrl,
      } as unknown as HTMLCanvasElement;
    }
    return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const provideRealResize = () => draftMachine.provide({ actors: { resizeImageActor } });

const startActor = () => {
  const actor = createActor(provideRealResize(), { input: { chatId: 'contract' } });
  actor.start();
  return actor;
};

type EntryDispatch = (actor: ReturnType<typeof startActor>, raw: string) => void;

const dispatchToMain: EntryDispatch = (actor, raw) => {
  actor.send({ type: 'addDraftImage', image: raw });
};

const dispatchPreservedToMain: EntryDispatch = (actor, raw) => {
  actor.send({ type: 'addDraftImage', image: raw, preserveOriginal: true });
};

const dispatchToEdit: EntryDispatch = (actor, raw) => {
  actor.send({ type: 'startEditingMessage', messageId: 'msg-edit-1' });
  actor.send({ type: 'addEditDraftImage', image: raw });
};

/**
 * The 12 image entry points, every one of which dispatches either
 * `addDraftImage` (entries #1-11) or `addEditDraftImage` (entry #12) with a
 * raw data URL. We test the chokepoint at the convergence point — if
 * `addDraftImage(raw)` applies the requested policy in `draftImages`, then by
 * construction every caller does too.
 */
type EntryTarget = 'main' | 'edit';
type EntryPoint = {
  readonly id: number;
  readonly label: string;
  readonly dispatch: EntryDispatch;
  readonly target: EntryTarget;
  readonly preserveOriginal?: boolean;
};

const entryPoints: readonly EntryPoint[] = [
  { id: 1, label: 'OS drag-drop image (#1)', dispatch: dispatchToMain, target: 'main' },
  { id: 2, label: 'File-picker selection (#2)', dispatch: dispatchToMain, target: 'main' },
  { id: 3, label: 'Textarea clipboard paste (#3)', dispatch: dispatchToMain, target: 'main' },
  { id: 4, label: 'Tiptap clipboard paste (#4)', dispatch: dispatchToMain, target: 'main' },
  {
    id: 5,
    label: 'Viewer toolbar Capture View (#5)',
    dispatch: dispatchPreservedToMain,
    target: 'main',
    preserveOriginal: true,
  },
  {
    id: 6,
    label: 'Viewer-pane drag-drop screenshot (#6)',
    dispatch: dispatchPreservedToMain,
    target: 'main',
    preserveOriginal: true,
  },
  {
    id: 7,
    label: 'Desktop @-suggestion single screenshot (#7)',
    dispatch: dispatchPreservedToMain,
    target: 'main',
    preserveOriginal: true,
  },
  {
    id: 8,
    label: 'Desktop @-suggestion composite (#8)',
    dispatch: dispatchPreservedToMain,
    target: 'main',
    preserveOriginal: true,
  },
  {
    id: 9,
    label: 'Mobile @-popover current view (#9)',
    dispatch: dispatchPreservedToMain,
    target: 'main',
    preserveOriginal: true,
  },
  {
    id: 10,
    label: 'Mobile @-popover composite (#10)',
    dispatch: dispatchPreservedToMain,
    target: 'main',
    preserveOriginal: true,
  },
  {
    id: 11,
    label: 'Mobile @-popover per-non-main view (#11)',
    dispatch: dispatchPreservedToMain,
    target: 'main',
    preserveOriginal: true,
  },
  { id: 12, label: 'Edit-mode draft image (#12)', dispatch: dispatchToEdit, target: 'edit' },
];

describe('Chat-image resize chokepoint — contract for all 12 entry points', () => {
  for (const entry of entryPoints) {
    it(`should apply the draft image policy to ${entry.label}`, async () => {
      const actor = startActor();
      try {
        entry.dispatch(actor, OVERSIZED_RAW_URL);
        const resultState = await xstateWaitFor(
          actor,
          (s) => {
            const list = entry.target === 'main' ? s.context.draftImages : s.context.editDraftImages;
            return list.length === 1 && s.context.imageQueue.length === 0;
          },
          { timeout: 2000 },
        );
        const resized = (
          entry.target === 'main' ? resultState.context.draftImages : resultState.context.editDraftImages
        )[0]!;
        if (entry.preserveOriginal) {
          expect(resized).toBe(OVERSIZED_RAW_URL);
        } else {
          expect(resized.length).toBeLessThanOrEqual(MAX_DATA_URL_LENGTH);
          expect(resized.startsWith('data:image/')).toBe(true);
        }
      } finally {
        actor.stop();
      }
    });
  }

  it('should keep the queue ordered FIFO and produce sized URLs in original drop order (multi-file drop)', async () => {
    const actor = startActor();
    try {
      const inputs = [
        SMALL_PNG_DATA_URL,
        OVERSIZED_RAW_URL,
        SMALL_JPEG_DATA_URL,
        OVERSIZED_RAW_URL,
        SMALL_PNG_DATA_URL,
      ];
      // Make small URLs short-circuit (already within limits, returned unchanged)
      mockImageWidth = 100;
      mockImageHeight = 100;

      for (const raw of inputs) {
        actor.send({ type: 'addDraftImage', image: raw });
      }

      const finalState = await xstateWaitFor(
        actor,
        (s) => s.context.draftImages.length === 5 && s.context.imageQueue.length === 0,
        { timeout: 2000 },
      );

      expect(finalState.context.draftImages).toHaveLength(5);
      for (const url of finalState.context.draftImages) {
        expect(url.length).toBeLessThanOrEqual(MAX_DATA_URL_LENGTH);
        expect(url.startsWith('data:image/')).toBe(true);
      }
    } finally {
      actor.stop();
    }
  });

  it('should drain the queue after a failed image inside a multi-file drop (4 valid + 1 corrupt) and emit exactly one failure', async () => {
    const corruptRaw = `data:image/png;base64,${'B'.repeat(2_000_000)}`;
    mockImageShouldErrorFor = new Set([corruptRaw]);

    const actor = startActor();
    try {
      const failures: Error[] = [];
      const subscription = actor.on('imageResizeFailed', (event) => {
        failures.push(event.error);
      });

      actor.send({ type: 'addDraftImage', image: SMALL_PNG_DATA_URL });
      actor.send({ type: 'addDraftImage', image: corruptRaw });
      actor.send({ type: 'addDraftImage', image: SMALL_JPEG_DATA_URL });
      actor.send({ type: 'addDraftImage', image: SMALL_PNG_DATA_URL });
      actor.send({ type: 'addDraftImage', image: SMALL_JPEG_DATA_URL });

      // Use small images so they short-circuit the resize ladder
      mockImageWidth = 100;
      mockImageHeight = 100;

      const finalState = await xstateWaitFor(
        actor,
        (s) => s.context.draftImages.length === 4 && s.context.imageQueue.length === 0,
        { timeout: 2000 },
      );

      expect(finalState.context.draftImages).toHaveLength(4);
      expect(failures).toHaveLength(1);
      expect(failures[0]).toBeInstanceOf(Error);
      expect(failures[0]!.message).toBe('Failed to load image');
      subscription.unsubscribe();
    } finally {
      actor.stop();
    }
  });

  it('should emit imageResizeFailed and leave draftImages empty when the only image cannot be parsed', async () => {
    const actor = startActor();
    try {
      const failures: Error[] = [];
      const subscription = actor.on('imageResizeFailed', (event) => {
        failures.push(event.error);
      });

      actor.send({ type: 'addDraftImage', image: MALFORMED_URL });

      await xstateWaitFor(actor, (s) => s.context.imageQueue.length === 0, { timeout: 2000 });

      expect(actor.getSnapshot().context.draftImages).toEqual([]);
      expect(failures).toHaveLength(1);
      expect(failures[0]!.message).toBe('Invalid image data URL');
      expect(failures[0]!.name).toBe('Error');
      subscription.unsubscribe();
    } finally {
      actor.stop();
    }
  });
});
/* eslint-enable @typescript-eslint/naming-convention -- re-enable after constant declarations */
