import { afterEach, describe, expect, it, vi } from 'vitest';
import { createShareArtifactWorkerCodec } from '#artifact-worker.js';
import { isShareError } from '#provider.js';

/** A stand-in for the dedicated worker: it answers each request with the reply the test gives it. */
class ReplyingWorker {
  public static reply: (id: number) => unknown = () => undefined;
  private readonly listeners: Array<(event: MessageEvent) => void> = [];

  public addEventListener(_type: 'message', listener: (event: MessageEvent) => void): void {
    this.listeners.push(listener);
  }

  public postMessage(message: { readonly id: number }): void {
    queueMicrotask(() => {
      for (const listener of this.listeners) {
        listener({ data: ReplyingWorker.reply(message.id) } as MessageEvent);
      }
    });
  }

  public terminate(): void {
    this.listeners.length = 0;
  }
}

describe('createShareArtifactWorkerCodec', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects with a ShareError when the worker refuses a password, so callers can branch on its code', async () => {
    vi.stubGlobal('Worker', ReplyingWorker);
    ReplyingWorker.reply = (id) => ({
      id,
      success: false,
      code: 'SHARE_ARTIFACT_INVALID',
      message: 'The encrypted project could not be authenticated.',
    });
    const codec = createShareArtifactWorkerCodec();

    const failure: unknown = await codec
      .openWithPassword({ compactJwe: 'sealed', password: 'wrong-review-password-32-characters' })
      .catch((error: unknown) => error);

    expect(isShareError(failure)).toBe(true);
    expect(failure).toMatchObject({
      code: 'SHARE_ARTIFACT_INVALID',
      message: 'The encrypted project could not be authenticated.',
    });
    codec.dispose();
  });

  it('keeps a reply without a known share code a plain Error', async () => {
    vi.stubGlobal('Worker', ReplyingWorker);
    ReplyingWorker.reply = (id) => ({ id, success: false, code: 'NOT_A_SHARE_CODE', message: 'Worker crashed.' });
    const codec = createShareArtifactWorkerCodec();

    const failure: unknown = await codec.openPlain('packed').catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(isShareError(failure)).toBe(false);
    expect(failure).toMatchObject({ message: 'Worker crashed.' });
    codec.dispose();
  });
});
