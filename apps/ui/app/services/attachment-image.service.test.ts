import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AttachmentTranscodeInput } from '@taucad/agent-host/wire';
import type { TranscodeResult } from '@taucad/runtime/transcoder';
import {
  AttachmentImageConversionError,
  AttachmentImageService,
  attachmentImageIdleMilliseconds,
  attachmentImageTranscodeTimeoutMilliseconds,
  normalizeComposerImage,
} from '#services/attachment-image.service.js';
import type { AttachmentImageClient } from '#services/attachment-image.service.js';

const converted = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x20, 0x00, 0x30, 0x03]);

const request: AttachmentTranscodeInput = {
  from: 'png',
  to: 'jpeg',
  files: [{ name: 'attachment.png', mimeType: 'image/png', bytes: new Uint8Array([1, 2, 3]) }],
  options: { maxEdge: 1568, maxBytes: 1_048_576, background: '#FFFFFF' },
};

type FakeClient = AttachmentImageClient & {
  readonly terminate: ReturnType<typeof vi.fn<() => void>>;
  readonly setTranscodeTimeout: ReturnType<typeof vi.fn<(milliseconds: number) => void>>;
};

/** A backend whose clients answer `results` in turn and record what they were asked. */
const fakeBackend = (results: Array<TranscodeResult | Error> = []) => {
  const clients: FakeClient[] = [];
  const calls: unknown[] = [];
  const createClient = vi.fn(async (): Promise<AttachmentImageClient> => {
    const client: FakeClient = {
      connect: vi.fn(async () => undefined),
      terminate: vi.fn(),
      setTranscodeTimeout: vi.fn(),
      async transcode(input) {
        calls.push(input);
        const next = results.shift() ?? {
          success: true,
          data: [{ name: 'attachment.jpg', mimeType: 'image/jpeg', bytes: converted }],
          issues: [],
        };
        if (next instanceof Error) {
          throw next;
        }
        return next;
      },
    };
    clients.push(client);
    return client;
  });
  return { createClient, clients, calls };
};

describe('AttachmentImageService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create no client until the first conversion', () => {
    const backend = fakeBackend();
    const service = new AttachmentImageService({ createClient: backend.createClient });

    expect(service.hasClient).toBe(false);
    expect(backend.createClient).not.toHaveBeenCalled();
  });

  it('should convert through client.transcode with a 30 s deadline and return the one output file', async () => {
    const backend = fakeBackend();
    const service = new AttachmentImageService({ createClient: backend.createClient });

    await expect(service.transcode(request)).resolves.toBe(converted);

    expect(backend.clients).toHaveLength(1);
    expect(backend.clients[0]!.setTranscodeTimeout).toHaveBeenCalledWith(attachmentImageTranscodeTimeoutMilliseconds);
    expect(backend.calls).toEqual([{ from: 'png', to: 'jpeg', files: [request.files[0]], options: request.options }]);
  });

  it('should reuse one client while busy and release it 60 s after the last conversion', async () => {
    const backend = fakeBackend();
    const service = new AttachmentImageService({ createClient: backend.createClient });

    await Promise.all([service.transcode(request), service.transcode(request)]);
    await vi.advanceTimersByTimeAsync(attachmentImageIdleMilliseconds - 1);
    await service.transcode(request);
    await vi.advanceTimersByTimeAsync(attachmentImageIdleMilliseconds - 1);

    expect(backend.createClient).toHaveBeenCalledOnce();
    expect(service.hasClient).toBe(true);

    await vi.advanceTimersByTimeAsync(1);

    expect(service.hasClient).toBe(false);
    expect(backend.clients[0]!.terminate).toHaveBeenCalledOnce();
  });

  it('should discard the client after a refused conversion and start a new one for the next image', async () => {
    const backend = fakeBackend([
      {
        success: false,
        issues: [
          { message: 'PNG of 9000×9000 exceeds the limit', code: 'RUNTIME', type: 'runtime', severity: 'error' },
        ],
      },
    ]);
    const service = new AttachmentImageService({ createClient: backend.createClient });

    await expect(service.transcode(request)).rejects.toThrow(
      new AttachmentImageConversionError('PNG of 9000×9000 exceeds the limit'),
    );
    expect(backend.clients[0]!.terminate).toHaveBeenCalledOnce();

    await expect(service.transcode(request)).resolves.toBe(converted);
    expect(backend.createClient).toHaveBeenCalledTimes(2);
  });

  it('should discard the client after a transport failure such as a timeout', async () => {
    const backend = fakeBackend([new Error('Transcode timed out.')]);
    const service = new AttachmentImageService({ createClient: backend.createClient });

    await expect(service.transcode(request)).rejects.toThrow('Transcode timed out.');

    expect(backend.clients[0]!.terminate).toHaveBeenCalledOnce();
    expect(service.hasClient).toBe(false);
  });

  it('should refuse output that is not exactly one file', async () => {
    const backend = fakeBackend([{ success: true, data: [], issues: [] }]);
    const service = new AttachmentImageService({ createClient: backend.createClient });

    await expect(service.transcode(request)).rejects.toBeInstanceOf(AttachmentImageConversionError);
  });

  it('should release its client on dispose and refuse later conversions', async () => {
    const backend = fakeBackend();
    const service = new AttachmentImageService({ createClient: backend.createClient });
    await service.transcode(request);

    service.dispose();
    await vi.advanceTimersByTimeAsync(0);

    expect(backend.clients[0]!.terminate).toHaveBeenCalledOnce();
    await expect(service.transcode(request)).rejects.toBeInstanceOf(AttachmentImageConversionError);
  });
});

describe('normalizeComposerImage', () => {
  it('should pass a canonical image through without calling the port (I6)', async () => {
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00,
      0x30, 0x00, 0x00, 0x00, 0x20, 0x08, 0x02, 0x00, 0x00, 0x00,
    ]);
    const transcode = vi.fn(async () => converted);

    await expect(
      normalizeComposerImage(png, { transcode, loadTranscodeSources: async () => ['png'] }),
    ).resolves.toMatchObject({ status: 'stored', mediaType: 'image/png', bytes: png, converted: false });
    expect(transcode).not.toHaveBeenCalled();
  });
});
