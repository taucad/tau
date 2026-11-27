/**
 * Chat-image chokepoint contract test.
 *
 * Locks the image policy for every entry point:
 *
 *   user-provided images go through the one storage policy — canonical images within the limits pass through
 *   unchanged and never reach the converter (I6), any other image is converted to JPEG through the runtime's
 *   transcode port (I3) — while generated headless captures are retained byte-for-byte so lossless renders are not
 *   silently downscaled and converted to JPEG.
 *
 * The 12 entry points (OS drag-drop, file picker, paste, Tiptap paste, viewer
 * toolbar, viewer-pane drag, desktop @-suggestion single + composite, mobile
 * @-popover current/all/per-view, and edit-mode draft) all converge on
 * `addDraftAttachment` / `addEditDraftAttachment`. We assert the contract by driving the **real**
 * `resizeImageActor` (the real `normalizeImageAttachment`, with a fake transcode port standing in for the runtime
 * worker) through every entry-point category. Failure paths are also covered: a corrupt image in a multi-file batch
 * must NOT block the surviving images, and a single failure must surface as one refusal via the
 * `imageResizeFailed` emit subscriber.
 *
 * If a future contributor adds a 13th entry point, they MUST extend the
 * `entryPoints` table below — that is the regression net.
 */
// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/naming-convention -- test fixture constants use SCREAMING_SNAKE_CASE */
import { describe, expect, it, vi } from 'vitest';
import { createActor, createAsyncLogic, waitFor as xstateWaitFor } from 'xstate';
import { uint8ArrayToBase64 } from 'uint8array-extras';
import { attachmentImageBackground, attachmentImageLimits } from '@taucad/agent-host/wire';
import type { AttachmentTranscodeInput } from '@taucad/agent-host/wire';
import { draftMachine } from '@taucad/chat-ui/hooks/draft.machine';
import { createResizeImageActor } from '#hooks/attachment-image.actor.js';
import type { StoredAttachment } from '@taucad/chat-ui/utils/attachment.utils';
import type { DraftAttachmentModel } from '@taucad/chat-ui/hooks/draft.machine';
import { AttachmentRefusedError } from '@taucad/chat-ui/utils/attachment-refusal';

/** A PNG header of the given size; the policy reads only headers. */
const pngOf = (width: number, height: number): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(33);
  const view = new DataView(bytes.buffer);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes.set([0x08, 0x06, 0x00, 0x00, 0x00], 24);
  return bytes;
};

/** A baseline JPEG frame header of the given size. */
const jpegOf = (width: number, height: number): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0, 0, 0, 0, 0x03, 0x01, 0x22, 0x00]);
  const view = new DataView(bytes.buffer);
  view.setUint16(7, height);
  view.setUint16(9, width);
  return bytes;
};

const dataUrlOf = (mediaType: string, bytes: Uint8Array<ArrayBuffer>): string =>
  `data:${mediaType};base64,${uint8ArrayToBase64(bytes)}`;

const SMALL_JPEG_DATA_URL = dataUrlOf('image/jpeg', jpegOf(100, 100));
const SMALL_PNG_DATA_URL = dataUrlOf('image/png', pngOf(100, 100));
const OVERSIZED_PNG_DATA_URL = dataUrlOf('image/png', pngOf(4000, 4000));
/** A PNG signature with no header: the policy refuses it as unreadable. */
const CORRUPT_PNG_DATA_URL = dataUrlOf('image/png', pngOf(4000, 4000).slice(0, 12));
const MALFORMED_URL = 'data:image/png,not-base64';

/** What the fake runtime converts every image to: a 1200×1200 JPEG header. */
const CONVERTED = jpegOf(1200, 1200);

const visionModel: DraftAttachmentModel = {
  name: 'Vision',
  support: { modalities: { input: ['text', 'image'], output: ['text'] } },
};

type StoreInput = { bytes: Uint8Array<ArrayBuffer>; mediaType: string; filename?: string };

/** What reached `storing`, in order: the bytes the draft will reference. */
const stored: StoreInput[] = [];

/** The conversions the fake runtime was asked for, in order. */
const conversions: AttachmentTranscodeInput[] = [];
const transcode = vi.fn(async (input: AttachmentTranscodeInput): Promise<Uint8Array<ArrayBuffer>> => {
  conversions.push(input);
  return CONVERTED;
});

const provideRealResize = () =>
  draftMachine.provide({
    actors: {
      resizeImageActor: createResizeImageActor({
        transcode,
        loadTranscodeSources: async () => ['jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'tiff'],
      }),
      storeAttachmentActor: createAsyncLogic<{ type: 'attachmentStored'; attachment: StoredAttachment }, StoreInput>({
        run: async ({ input }) => {
          stored.push(input);
          return {
            type: 'attachmentStored',
            // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the fake store mints the brand as `put` does.
            attachment: {
              hash: String(stored.length).padStart(64, '0'),
              mediaType: input.mediaType,
              byteLength: input.bytes.byteLength,
            } as StoredAttachment,
          };
        },
      }),
    },
  });

const startActor = () => {
  stored.length = 0;
  conversions.length = 0;
  const actor = createActor(provideRealResize(), { input: {} });
  actor.start();
  return actor;
};

type EntryDispatch = (actor: ReturnType<typeof startActor>, raw: string) => void;

const dispatchToMain: EntryDispatch = (actor, raw) => {
  actor.send({ type: 'addDraftAttachment', dataUrl: raw, model: visionModel });
};

const dispatchPreservedToMain: EntryDispatch = (actor, raw) => {
  actor.send({ type: 'addDraftAttachment', dataUrl: raw, preserveOriginal: true, model: visionModel });
};

const dispatchToEdit: EntryDispatch = (actor, raw) => {
  actor.send({ type: 'startEditingMessage', messageId: 'msg-edit-1' });
  actor.send({ type: 'addEditDraftAttachment', dataUrl: raw, model: visionModel });
};

/**
 * The 12 image entry points, every one of which dispatches either
 * `addDraftAttachment` (entries #1-11) or `addEditDraftAttachment` (entry #12)
 * with a raw data URL. We test the chokepoint at the convergence point — if
 * `addDraftAttachment(raw)` applies the requested policy to the bytes it
 * stores, then by construction every caller does too.
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
        entry.dispatch(actor, OVERSIZED_PNG_DATA_URL);
        const resultState = await xstateWaitFor(
          actor,
          (s) => {
            const list = entry.target === 'main' ? s.context.draftAttachments : s.context.editDraftAttachments;
            return list.length === 1 && s.context.attachmentQueue.length === 0;
          },
          { timeout: 2000 },
        );
        expect(
          (entry.target === 'main'
            ? resultState.context.draftAttachments
            : resultState.context.editDraftAttachments)[0],
        ).toMatchObject({ hash: '1'.padStart(64, '0') });
        const [kept] = stored;
        if (entry.preserveOriginal) {
          expect(kept).toMatchObject({ mediaType: 'image/png', bytes: pngOf(4000, 4000) });
          expect(conversions).toEqual([]);
        } else {
          expect(kept).toMatchObject({ mediaType: 'image/jpeg', bytes: CONVERTED });
          expect(conversions).toEqual([
            expect.objectContaining({
              from: 'png',
              to: 'jpeg',
              options: {
                maxEdge: attachmentImageLimits.maxEdge,
                maxBytes: attachmentImageLimits.maxBytes,
                background: attachmentImageBackground,
              },
            }),
          ]);
        }
      } finally {
        actor.stop();
      }
    });
  }

  it('should keep the queue ordered FIFO, pass canonical images through and convert only the oversized ones', async () => {
    const actor = startActor();
    try {
      const inputs = [
        SMALL_PNG_DATA_URL,
        OVERSIZED_PNG_DATA_URL,
        SMALL_JPEG_DATA_URL,
        OVERSIZED_PNG_DATA_URL,
        SMALL_PNG_DATA_URL,
      ];

      for (const raw of inputs) {
        actor.send({ type: 'addDraftAttachment', dataUrl: raw, model: visionModel });
      }

      const finalState = await xstateWaitFor(
        actor,
        (s) => s.context.draftAttachments.length === 5 && s.context.attachmentQueue.length === 0,
        { timeout: 2000 },
      );

      expect(finalState.context.draftAttachments.map((attachment) => attachment.hash)).toEqual(
        ['1', '2', '3', '4', '5'].map((index) => index.padStart(64, '0')),
      );
      // Canonical images within the limits pass through byte for byte; the oversized ones were converted to JPEG.
      expect(stored.map((input) => input.mediaType)).toEqual([
        'image/png',
        'image/jpeg',
        'image/jpeg',
        'image/jpeg',
        'image/png',
      ]);
      expect(stored[0]!.bytes).toEqual(pngOf(100, 100));
      expect(stored[2]!.bytes).toEqual(jpegOf(100, 100));
      expect(conversions).toHaveLength(2);
    } finally {
      actor.stop();
    }
  });

  it('should drain the queue after a corrupt image inside a multi-file drop (4 valid + 1 corrupt) and emit exactly one refusal', async () => {
    const actor = startActor();
    try {
      const failures: Error[] = [];
      const subscription = actor.on('imageResizeFailed', (event) => {
        failures.push(event.error);
      });

      actor.send({ type: 'addDraftAttachment', dataUrl: SMALL_PNG_DATA_URL, model: visionModel });
      actor.send({ type: 'addDraftAttachment', dataUrl: CORRUPT_PNG_DATA_URL, model: visionModel });
      actor.send({ type: 'addDraftAttachment', dataUrl: SMALL_JPEG_DATA_URL, model: visionModel });
      actor.send({ type: 'addDraftAttachment', dataUrl: SMALL_PNG_DATA_URL, model: visionModel });
      actor.send({ type: 'addDraftAttachment', dataUrl: SMALL_JPEG_DATA_URL, model: visionModel });

      const finalState = await xstateWaitFor(
        actor,
        (s) => s.context.draftAttachments.length === 4 && s.context.attachmentQueue.length === 0,
        { timeout: 2000 },
      );

      expect(finalState.context.draftAttachments).toHaveLength(4);
      expect(failures).toHaveLength(1);
      expect(failures[0]).toBeInstanceOf(AttachmentRefusedError);
      expect((failures[0] as AttachmentRefusedError).copy).toEqual({
        title: "Couldn't attach this image",
        description: "This PNG file is damaged or incomplete, so it couldn't be read.",
      });
      expect(conversions).toEqual([]);
      subscription.unsubscribe();
    } finally {
      actor.stop();
    }
  });

  it('should refuse an image whose conversion fails, by name, and keep nothing', async () => {
    transcode.mockRejectedValueOnce(new Error('worker terminated'));
    const actor = startActor();
    try {
      const failures: Error[] = [];
      const subscription = actor.on('imageResizeFailed', (event) => {
        failures.push(event.error);
      });

      actor.send({ type: 'addDraftAttachment', dataUrl: OVERSIZED_PNG_DATA_URL, model: visionModel });
      await xstateWaitFor(actor, (s) => s.context.attachmentQueue.length === 0, { timeout: 2000 });

      expect(stored).toEqual([]);
      expect((failures[0] as AttachmentRefusedError).copy.description).toBe(
        "Couldn't convert this PNG image. Try again, or save it as JPEG and attach that.",
      );
      subscription.unsubscribe();
    } finally {
      actor.stop();
    }
  });

  it('should emit attachmentStoreFailed and leave draftAttachments empty when the only image cannot be parsed', async () => {
    const actor = startActor();
    try {
      const failures: Error[] = [];
      const subscription = actor.on('attachmentStoreFailed', (event) => {
        failures.push(event.error);
      });

      actor.send({ type: 'addDraftAttachment', dataUrl: MALFORMED_URL, model: visionModel });

      await xstateWaitFor(actor, (s) => s.context.attachmentQueue.length === 0, { timeout: 2000 });

      expect(actor.getSnapshot().context.draftAttachments).toEqual([]);
      expect(stored).toEqual([]);
      expect(failures).toHaveLength(1);
      expect(failures[0]!.message).toBe('The attachment is not a base64 data URL.');
      expect(failures[0]!.name).toBe('Error');
      subscription.unsubscribe();
    } finally {
      actor.stop();
    }
  });
});
/* eslint-enable @typescript-eslint/naming-convention -- re-enable after constant declarations */
