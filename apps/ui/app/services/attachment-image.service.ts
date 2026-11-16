/**
 * The composer's image conversion: every image the storage policy decides to convert goes through `client.transcode`
 * in a dedicated runtime worker (web) or Electron utility process (desktop), never on the main thread (I3).
 *
 * - No client exists until the first image that needs converting; canonical images within the limits pass through
 *   `normalizeImageAttachment` without reaching the port (I6).
 * - Conversions run one at a time, each with a 30 s deadline that terminates the worker (I5).
 * - Any failed conversion discards the client, because a codec abort leaves its module unusable; the next image gets
 *   a new one (I5).
 * - The client is released {@link attachmentImageIdleMilliseconds} after the last conversion settles.
 *
 * The host-specific half is `attachmentImageBackend`, replaced at module resolution in desktop builds.
 *
 * The draft's image step (`attachment-image.actor.ts`) imports this module on the first image it converts, and the
 * composer and the image step read the convertible formats from `attachment-transcode-sources-store.ts`, so neither
 * puts it on Home's critical path.
 *
 * @module
 */

import { normalizeImageAttachment } from '@taucad/agent-host/wire';
import type {
  AttachmentTranscodeInput,
  AttachmentTranscodePort,
  NormalizedImageAttachment,
} from '@taucad/agent-host/wire';
import type { TranscodeResult } from '@taucad/runtime/transcoder';
import type { ExportFile } from '@taucad/runtime/types';
import { attachmentImageBackend } from '#services/attachment-image-backend.js';

/** How long the conversion worker is kept after the last conversion settles. */
export const attachmentImageIdleMilliseconds = 60_000;

/** The wall-clock deadline of one conversion; the transport terminates the worker when it passes. */
export const attachmentImageTranscodeTimeoutMilliseconds = 30_000;

/** The part of a runtime client the service drives; each backend adapts its own. */
export type AttachmentImageClient = {
  readonly connect: () => Promise<void>;
  /** Terminates the worker or utility process and stops observing it. */
  readonly terminate: () => void;
  readonly setTranscodeTimeout: (milliseconds: number) => void;
  /**
   * The runtime client's own `transcode`. Declared as a method, so a client typed over its runtime's edge union is
   * accepted: the service passes a source format read from the bytes and admitted through the derived source list,
   * and the transcoder admits it again from its header.
   */
  transcode(input: AttachmentImageTranscodeInput): Promise<TranscodeResult>;
};

/** One conversion request as the service sends it. */
export type AttachmentImageTranscodeInput = {
  readonly from: string;
  readonly to: string;
  readonly files: ExportFile[];
  readonly options: Readonly<Record<string, unknown>>;
};

/** Host-selected execution: a web worker in the browser, an Electron utility process on the desktop. */
export type AttachmentImageBackend = {
  readonly createClient: () => Promise<AttachmentImageClient>;
};

export type AttachmentImageServiceDependencies = Partial<AttachmentImageBackend> & {
  readonly idleMilliseconds?: number;
};

/** Resolves once `promise` settles, whether it resolved or rejected. */
const settled = async (promise: Promise<unknown>): Promise<void> => {
  try {
    await promise;
  } catch {
    // The conversion's own caller handles its failure.
  }
};

/** Terminate a client once it has started; a client that failed to start has nothing to terminate. */
const terminateWhenStarted = async (client: Promise<AttachmentImageClient>): Promise<void> => {
  let started: AttachmentImageClient;
  try {
    started = await client;
  } catch {
    // It never started.
    return;
  }
  started.terminate();
};

/** A conversion the runtime refused or could not finish; the storage policy reports it as `transcode-failed`. */
export class AttachmentImageConversionError extends Error {
  public override readonly name = 'AttachmentImageConversionError';
}

/** One lazily created conversion client, released when idle and discarded after any failure. */
export class AttachmentImageService {
  /** Converts one image to a stored JPEG; the storage policy's transcode port. */
  public readonly transcode: AttachmentTranscodePort;
  private readonly createClient: () => Promise<AttachmentImageClient>;
  private readonly idleMilliseconds: number;
  private client: Promise<AttachmentImageClient> | undefined;
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  public constructor(dependencies: AttachmentImageServiceDependencies = {}) {
    this.createClient = dependencies.createClient ?? attachmentImageBackend.createClient;
    this.idleMilliseconds = dependencies.idleMilliseconds ?? attachmentImageIdleMilliseconds;
    this.transcode = async (input) => this.enqueue(input);
  }

  /** Whether a conversion client exists (or is starting) now. */
  public get hasClient(): boolean {
    return this.client !== undefined;
  }

  /** Release the client and refuse further conversions. */
  public dispose(): void {
    this.disposed = true;
    this.cancelIdleRelease();
    this.release();
  }

  private async enqueue(input: AttachmentTranscodeInput): Promise<Uint8Array<ArrayBuffer>> {
    if (this.disposed) {
      throw new AttachmentImageConversionError('The image converter was disposed.');
    }
    this.pending += 1;
    this.cancelIdleRelease();
    const previous = this.tail;
    const run = (async (): Promise<Uint8Array<ArrayBuffer>> => {
      await previous;
      return this.run(input);
    })();
    // The next conversion waits for this one to settle, whatever its outcome.
    this.tail = settled(run);
    try {
      return await run;
    } finally {
      this.pending -= 1;
      // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- dispose() can run while this conversion awaits.
      if (this.pending === 0 && !this.disposed) {
        this.scheduleIdleRelease();
      }
    }
  }

  private async run(input: AttachmentTranscodeInput): Promise<Uint8Array<ArrayBuffer>> {
    // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- dispose() can run while this conversion waited in the queue.
    if (this.disposed) {
      throw new AttachmentImageConversionError('The image converter was disposed.');
    }
    this.client ??= this.startClient();
    try {
      const client = await this.client;
      const result = await client.transcode({
        from: input.from,
        to: input.to,
        files: input.files.map((file) => ({ name: file.name, mimeType: file.mimeType, bytes: file.bytes })),
        options: input.options,
      });
      if (!result.success) {
        throw new AttachmentImageConversionError(result.issues[0]?.message ?? 'The image could not be converted.');
      }
      const [file] = result.data;
      if (file === undefined || result.data.length !== 1) {
        throw new AttachmentImageConversionError(
          `The converter returned ${result.data.length} files where one was expected.`,
        );
      }
      return file.bytes;
    } catch (error) {
      // I5: a decoder abort leaves the worker's module unusable, so the next image starts a new one.
      this.release();
      throw error;
    }
  }

  private async startClient(): Promise<AttachmentImageClient> {
    const client = await this.createClient();
    try {
      client.setTranscodeTimeout(attachmentImageTranscodeTimeoutMilliseconds);
      await client.connect();
    } catch (error) {
      client.terminate();
      throw error;
    }
    return client;
  }

  private release(): void {
    const { client } = this;
    this.client = undefined;
    if (client !== undefined) {
      void terminateWhenStarted(client);
    }
  }

  private scheduleIdleRelease(): void {
    if (this.client === undefined || this.idleTimer !== undefined) {
      return;
    }
    this.idleTimer = setTimeout(() => {
      this.idleTimer = undefined;
      if (this.pending === 0) {
        this.release();
      }
    }, this.idleMilliseconds);
  }

  private cancelIdleRelease(): void {
    clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }
}

let shared: AttachmentImageService | undefined;

/**
 * The page's one conversion service, shared by every composer, so one worker serves them all.
 *
 * @returns The shared service.
 */
export const attachmentImageService = (): AttachmentImageService => {
  shared ??= new AttachmentImageService();
  return shared;
};

/**
 * Apply the storage policy to one composer image: pass a canonical image through, convert any other image the
 * runtime has an edge for, or refuse it by name.
 *
 * @param bytes - The image as the person chose it.
 * @param dependencies - The convertible formats (`loadAttachmentTranscodeSources` in the app), and the transcode port;
 * the shared service by default.
 * @returns What to store, or why not.
 */
export const normalizeComposerImage = async (
  bytes: Uint8Array<ArrayBuffer>,
  dependencies: {
    readonly transcode?: AttachmentTranscodePort;
    readonly loadTranscodeSources: () => Promise<readonly string[]>;
  },
): Promise<NormalizedImageAttachment> =>
  normalizeImageAttachment({
    bytes,
    transcode: dependencies.transcode ?? (async (input) => attachmentImageService().transcode(input)),
    transcodeSources: await dependencies.loadTranscodeSources(),
  });
