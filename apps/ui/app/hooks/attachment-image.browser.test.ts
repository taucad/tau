/**
 * Composer image conversion in Chromium (blueprint WP5).
 *
 * - Host parity (b): every `golden.json` case of the raster transcoder, and of the HEIF transcoder (WP7), runs
 *   through `client.transcode` in the attachment worker over the web-worker transport and must produce the recorded
 *   bytes. A 16384×16384 HEIC is refused from its header there too.
 * - The worker's lifecycle: none for a canonical image, one for the first image that needs converting, none once idle.
 * - The composer's intake and draft image step through the real worker: labels from bytes by pick and by paste, the
 *   1568 px fit, the white matte, TIFF conversion and a refusal that names what was refused.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createActor, createAsyncLogic, waitFor } from 'xstate';
import { probeImage } from '@taucad/utils/image-probe';
import { handleClipboardImagePaste } from '@taucad/chat-ui/components/chat-paste-handler';
import { readAttachmentFile } from '@taucad/chat-ui/utils/attachment-intake';
import type { StoredAttachment } from '@taucad/chat-ui/utils/attachment.utils';
import { draftMachine, pendingDraftImages } from '#hooks/draft.machine.js';
import type { DraftAttachmentModel, PendingDraftImage } from '#hooks/draft.machine.js';
import { createResizeImageActor } from '#hooks/attachment-image.actor.js';
import { attachmentImageBackend } from '#services/attachment-image-backend.js';
import type { AttachmentImageClient } from '#services/attachment-image.service.js';
import { AttachmentImageService } from '#services/attachment-image.service.js';
import { loadAttachmentTranscodeSources } from '#services/attachment-transcode-sources-store.js';
import { attachmentRefusalCopy } from '#utils/attachment-refusal.js';

const fixtureUrls = import.meta.glob<string>('../../../../packages/plugins/image/src/raster/fixtures/*', {
  query: '?url',
  import: 'default',
  eager: true,
});

const fixture = async (name: string): Promise<Uint8Array<ArrayBuffer>> => {
  const url = fixtureUrls[`../../../../packages/plugins/image/src/raster/fixtures/${name}`];
  if (url === undefined) {
    throw new Error(`No raster fixture named ${name}`);
  }
  const response = await fetch(url);
  return new Uint8Array(await response.arrayBuffer());
};

type GoldenCase = {
  readonly fixture: string;
  readonly from: string;
  readonly to: string;
  readonly options: Record<string, unknown>;
  readonly sha256: string;
  readonly width: number;
  readonly height: number;
};

const golden = JSON.parse(new TextDecoder().decode(await fixture('golden.json'))) as {
  readonly cases: readonly GoldenCase[];
};

const sha256 = async (bytes: Uint8Array<ArrayBuffer>): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

describe('raster transcoder host parity (b): Chromium, web-worker transport', () => {
  let client: AttachmentImageClient;

  beforeAll(async () => {
    client = await attachmentImageBackend.createClient();
    await client.connect();
  });

  afterAll(() => {
    client.terminate();
  });

  it('should cover every source and target format', () => {
    expect(new Set(golden.cases.map(({ from }) => from))).toEqual(
      new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'tiff']),
    );
    expect(new Set(golden.cases.map(({ to }) => to))).toEqual(new Set(['jpeg', 'png', 'webp']));
  });

  it.each(
    golden.cases.map((entry) => [`${entry.fixture} → ${entry.to} ${JSON.stringify(entry.options)}`, entry] as const),
  )('should reproduce the golden output of %s', async (_label, entry) => {
    const result = await client.transcode({
      from: entry.from,
      to: entry.to,
      files: [{ name: entry.fixture, bytes: await fixture(entry.fixture), mimeType: 'application/octet-stream' }],
      options: entry.options,
    });
    if (!result.success) {
      expect.fail(result.issues.map(({ message }) => message).join('; '));
    }
    const [file] = result.data;
    const probe = probeImage(file!.bytes);
    expect({ sha256: await sha256(file!.bytes), width: probe?.width, height: probe?.height }).toEqual({
      sha256: entry.sha256,
      width: entry.width,
      height: entry.height,
    });
  });
});

const heifFixtureUrls = import.meta.glob<string>('../../../../packages/plugins/heif/src/fixtures/*', {
  query: '?url',
  import: 'default',
  eager: true,
});

const heifFixture = async (name: string): Promise<Uint8Array<ArrayBuffer>> => {
  const url = heifFixtureUrls[`../../../../packages/plugins/heif/src/fixtures/${name}`];
  if (url === undefined) {
    throw new Error(`No HEIF fixture named ${name}`);
  }
  const response = await fetch(url);
  return new Uint8Array(await response.arrayBuffer());
};

const heifGolden = JSON.parse(new TextDecoder().decode(await heifFixture('golden.json'))) as {
  readonly cases: readonly GoldenCase[];
};

describe('HEIF transcoder host parity (b): Chromium, web-worker transport', () => {
  let client: AttachmentImageClient;

  beforeAll(async () => {
    client = await attachmentImageBackend.createClient();
    await client.connect();
  });

  afterAll(() => {
    client.terminate();
  });

  it('should cover small.heic and the rotated heic-rot6.heic', () => {
    expect(new Set(heifGolden.cases.map(({ fixture }) => fixture))).toEqual(new Set(['small.heic', 'heic-rot6.heic']));
  });

  it.each(
    heifGolden.cases.map(
      (entry) => [`${entry.fixture} (${entry.from}) → ${entry.to} ${JSON.stringify(entry.options)}`, entry] as const,
    ),
  )('should reproduce the golden output of %s', async (_label, entry) => {
    const result = await client.transcode({
      from: entry.from,
      to: entry.to,
      files: [{ name: entry.fixture, bytes: await heifFixture(entry.fixture), mimeType: 'application/octet-stream' }],
      options: entry.options,
    });
    if (!result.success) {
      expect.fail(result.issues.map(({ message }) => message).join('; '));
    }
    const [file] = result.data;
    const probe = probeImage(file!.bytes);
    expect({ sha256: await sha256(file!.bytes), width: probe?.width, height: probe?.height }).toEqual({
      sha256: entry.sha256,
      width: entry.width,
      height: entry.height,
    });
  });

  it('should refuse a 16384×16384 HEIC from its header', async () => {
    const result = await client.transcode({
      from: 'heic',
      to: 'jpeg',
      files: [{ name: 'bomb.heic', bytes: await heifFixture('bomb-16384.heic'), mimeType: 'image/heic' }],
      options: {},
    });
    expect(result.success).toBe(false);
    expect(result.success ? '' : result.issues[0]?.message).toBe(
      'HEIC of 16384×16384 exceeds the 50000000-pixel limit',
    );
  });
});

/** Counts the workers this page constructs and terminates, without changing what they do. */
const countWorkers = () => {
  const created: Worker[] = [];
  const terminated = new Set<Worker>();
  const nativeWorker = globalThis.Worker;
  class CountingWorker extends nativeWorker {
    public constructor(url: string | URL, options?: WorkerOptions) {
      super(url, options);
      created.push(this);
    }

    public override terminate(): void {
      terminated.add(this);
      super.terminate();
    }
  }
  vi.stubGlobal('Worker', CountingWorker);
  return { created, terminated };
};

const visionModel: DraftAttachmentModel = {
  name: 'Vision',
  support: { modalities: { input: ['text', 'image', 'pdf'], output: ['text'] } },
};

type Stored = { readonly bytes: Uint8Array<ArrayBuffer>; readonly mediaType: string };

/** A composer draft whose image step converts through `service`, and whose store records what it was given. */
const composerDraft = (service: AttachmentImageService) => {
  const stored: Stored[] = [];
  const failures: Error[] = [];
  /** The thumbnail slots the composer held as each pick entered the draft. */
  const pendingAtPick: Array<readonly PendingDraftImage[]> = [];
  const actor = createActor(
    draftMachine.provide({
      actors: {
        resizeImageActor: createResizeImageActor({ transcode: service.transcode }),
        storeAttachmentActor: createAsyncLogic<
          { type: 'attachmentStored'; attachment: StoredAttachment },
          { bytes: Uint8Array<ArrayBuffer>; mediaType: string }
        >({
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
    }),
    { input: {} },
  );
  actor.on('imageResizeFailed', (event) => {
    failures.push(event.error);
  });
  actor.start();
  const settle = async (): Promise<void> => {
    await waitFor(actor, (snapshot) => snapshot.context.attachmentQueue.length === 0, { timeout: 30_000 });
  };
  return {
    stored,
    failures,
    pendingAtPick,
    /** The thumbnail slots the composer holds now. */
    get pending(): readonly PendingDraftImage[] {
      return pendingDraftImages(actor.getSnapshot().context, 'main');
    },
    /** Pick a file as the composer does: intake, then the draft. */
    async pick(file: File): Promise<void> {
      const intake = await readAttachmentFile(file, { transcodeSources: await loadAttachmentTranscodeSources() });
      if (intake.outcome === 'refused') {
        throw new Error(attachmentRefusalCopy(intake).description);
      }
      const { source } = intake;
      actor.send(
        typeof source === 'string'
          ? { type: 'addDraftAttachment', dataUrl: source, declaredType: file.type, model: visionModel }
          : { type: 'addDraftAttachment', ...source, declaredType: file.type, model: visionModel },
      );
      pendingAtPick.push(pendingDraftImages(actor.getSnapshot().context, 'main'));
      await settle();
    },
    /** Paste a file as the composer does. */
    async paste(file: File): Promise<void> {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      const pasted = Promise.withResolvers<string>();
      handleClipboardImagePaste({
        event: { clipboardData: transfer, preventDefault: () => undefined },
        onImage: (dataUrl) => {
          pasted.resolve(dataUrl);
        },
        onRefused: (refusal) => {
          pasted.reject(new Error(refusal.reason));
        },
        loadTranscodeSources: loadAttachmentTranscodeSources,
      });
      actor.send({ type: 'addDraftAttachment', dataUrl: await pasted.promise, model: visionModel });
      await settle();
    },
    stop(): void {
      actor.stop();
    },
  };
};

/** Encode a canvas drawing as `type` (test input only; the product never draws on a canvas). */
const drawn = async ({
  width,
  height,
  type,
  paint,
}: Readonly<{
  width: number;
  height: number;
  type: 'image/jpeg' | 'image/png';
  paint: (context: OffscreenCanvasRenderingContext2D) => void;
}>): Promise<Uint8Array<ArrayBuffer>> => {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d')!;
  paint(context);
  const blob = await canvas.convertToBlob({ type, quality: 0.95 });
  return new Uint8Array(await blob.arrayBuffer());
};

/** The RGBA of one pixel of an encoded image, decoded by the browser (test oracle only). */
const pixelAt = async (bytes: Uint8Array<ArrayBuffer>, x: number, y: number): Promise<readonly number[]> => {
  const bitmap = await createImageBitmap(new Blob([bytes]));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d')!;
  context.drawImage(bitmap, 0, 0);
  return [...context.getImageData(x, y, 1, 1).data];
};

describe('composer image conversion through the attachment worker', () => {
  let service: AttachmentImageService;

  afterEach(() => {
    service.dispose();
    vi.unstubAllGlobals();
  });

  it('should start no worker for a canonical image, one for the first image to convert, and none once idle', async () => {
    const workers = countWorkers();
    service = new AttachmentImageService({ idleMilliseconds: 250 });
    const draft = composerDraft(service);
    try {
      await draft.pick(new File([await fixture('small.png')], 'small.png', { type: 'image/png' }));
      expect(draft.stored.map(({ mediaType }) => mediaType)).toEqual(['image/png']);
      expect(workers.created).toHaveLength(0);

      await draft.pick(new File([await fixture('small.tiff')], 'scan.tiff', { type: 'image/tiff' }));
      expect(draft.stored.map(({ mediaType }) => mediaType)).toEqual(['image/png', 'image/jpeg']);
      expect(workers.created).toHaveLength(1);
      expect(service.hasClient).toBe(true);

      await expect.poll(() => service.hasClient, { timeout: 5000 }).toBe(false);
      expect(workers.terminated.has(workers.created[0]!)).toBe(true);
    } finally {
      draft.stop();
    }
  });

  it('should store a WebP named .jpg as image/webp, by pick and by paste', async () => {
    service = new AttachmentImageService();
    const draft = composerDraft(service);
    const webp = await fixture('small.webp');
    try {
      await draft.pick(new File([webp], 'photo.jpg', { type: 'image/jpeg' }));
      await draft.paste(new File([webp], 'photo.jpg', { type: 'image/jpeg' }));

      expect(draft.stored.map(({ mediaType }) => mediaType)).toEqual(['image/webp', 'image/webp']);
      expect(draft.stored.every(({ bytes }) => bytes.byteLength === webp.byteLength)).toBe(true);
    } finally {
      draft.stop();
    }
  });

  it('should convert a HEIC typed application/octet-stream to JPEG, by pick and by paste', async () => {
    service = new AttachmentImageService();
    const draft = composerDraft(service);
    const heic = await heifFixture('small.heic');
    try {
      await draft.pick(new File([heic], 'IMG_0001.HEIC', { type: 'application/octet-stream' }));
      await draft.paste(new File([heic], 'IMG_0001.HEIC', { type: 'application/octet-stream' }));

      expect(draft.failures).toEqual([]);
      expect(draft.stored.map(({ mediaType }) => mediaType)).toEqual(['image/jpeg', 'image/jpeg']);
    } finally {
      draft.stop();
    }
  });

  it('should hold a converting slot for a HEIC until its JPEG is stored, and an adding slot for a PNG', async () => {
    service = new AttachmentImageService();
    const draft = composerDraft(service);
    try {
      await draft.pick(new File([await heifFixture('heic-rot6.heic')], 'IMG_0002.HEIC', { type: 'image/heic' }));
      await draft.pick(new File([await fixture('small.png')], 'small.png', { type: 'image/png' }));

      expect(draft.pendingAtPick).toEqual([[{ isConverting: true }], [{ isConverting: false }]]);
      expect(draft.pending).toEqual([]);
      expect(draft.failures).toEqual([]);
      expect(draft.stored.map(({ mediaType }) => mediaType)).toEqual(['image/jpeg', 'image/png']);
    } finally {
      draft.stop();
    }
  });

  it('should release the slot of a refused image, with the refusal unchanged', async () => {
    service = new AttachmentImageService();
    const draft = composerDraft(service);
    try {
      await draft.pick(new File([await heifFixture('bomb-16384.heic')], 'IMG_0003.HEIC', { type: 'image/heic' }));

      expect(draft.pendingAtPick).toEqual([[{ isConverting: true }]]);
      expect(draft.pending).toEqual([]);
      expect(draft.failures).toHaveLength(1);
      expect(draft.stored).toEqual([]);
    } finally {
      draft.stop();
    }
  });

  it('should refuse a PSD typed application/octet-stream by its format, and a ZIP as any other file', async () => {
    // A 32×48, 8-bit Photoshop header: recognised from its bytes, never stored or converted.
    const psd = new Uint8Array(26);
    const view = new DataView(psd.buffer);
    psd.set(new TextEncoder().encode('8BPS'));
    view.setUint16(4, 1);
    view.setUint16(12, 3);
    view.setUint32(14, 32);
    view.setUint32(18, 48);
    view.setUint16(22, 8);
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const transcodeSources = await loadAttachmentTranscodeSources();
    const copyOf = async (bytes: Uint8Array<ArrayBuffer>, name: string) => {
      const intake = await readAttachmentFile(new File([bytes], name, { type: 'application/octet-stream' }), {
        transcodeSources,
      });
      return intake.outcome === 'refused' ? attachmentRefusalCopy(intake) : intake;
    };

    await expect(copyOf(psd, 'layout.psd')).resolves.toEqual({
      title: "Couldn't attach this image",
      description: "Photoshop (PSD) images can't be attached. Save it as JPEG or PNG and attach it again.",
    });
    await expect(copyOf(zip, 'models.zip')).resolves.toEqual({
      title: "Couldn't attach this file",
      description: 'Only images and PDFs can be attached.',
    });
    service = new AttachmentImageService();
  });

  it('should store a 12 MP JPEG as a JPEG at 1568 px', async () => {
    service = new AttachmentImageService();
    const draft = composerDraft(service);
    const photo = await drawn({
      width: 4032,
      height: 3024,
      type: 'image/jpeg',
      paint: (context) => {
        const gradient = context.createLinearGradient(0, 0, 4032, 3024);
        gradient.addColorStop(0, 'rgb(32 64 128)');
        gradient.addColorStop(1, 'rgb(224 160 64)');
        context.fillStyle = gradient;
        context.fillRect(0, 0, 4032, 3024);
      },
    });
    try {
      await draft.pick(new File([photo], 'IMG_0001.jpg', { type: 'image/jpeg' }));

      const [stored] = draft.stored;
      expect(stored?.mediaType).toBe('image/jpeg');
      expect(probeImage(stored!.bytes)).toMatchObject({ format: 'jpeg', width: 1568, height: 1176 });
      expect(stored!.bytes.byteLength).toBeLessThanOrEqual(1024 * 1024);
    } finally {
      draft.stop();
    }
  });

  it('should store an oversized transparent PNG with white where it was transparent', async () => {
    service = new AttachmentImageService();
    const draft = composerDraft(service);
    const png = await drawn({
      width: 2000,
      height: 2000,
      type: 'image/png',
      paint: (context) => {
        context.fillStyle = 'rgb(255 0 0)';
        context.fillRect(1000, 1000, 1000, 1000);
      },
    });
    try {
      await draft.pick(new File([png], 'cutout.png', { type: 'image/png' }));

      const [stored] = draft.stored;
      expect(stored?.mediaType).toBe('image/jpeg');
      const [red, green, blue] = await pixelAt(stored!.bytes, 10, 10);
      expect(Math.min(red!, green!, blue!)).toBeGreaterThanOrEqual(245);
      const [cornerRed, cornerGreen] = await pixelAt(stored!.bytes, 1500, 1500);
      expect(cornerRed).toBeGreaterThanOrEqual(200);
      expect(cornerGreen).toBeLessThanOrEqual(60);
    } finally {
      draft.stop();
    }
  });

  it('should refuse a .zip with copy that says what can be attached', async () => {
    const zip = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], 'models.zip', { type: 'application/zip' });

    const intake = await readAttachmentFile(zip, { transcodeSources: await loadAttachmentTranscodeSources() });

    expect(intake).toEqual({ outcome: 'refused', reason: 'not-an-image' });
    expect(intake.outcome === 'refused' ? attachmentRefusalCopy(intake) : undefined).toEqual({
      title: "Couldn't attach this file",
      description: 'Only images and PDFs can be attached.',
    });
    service = new AttachmentImageService();
  });
});
