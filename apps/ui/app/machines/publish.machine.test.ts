import { describe, it, expect, afterEach, vi } from 'vitest';
import { createActor, waitFor } from 'xstate';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import { publishMachine, PublishUploadError } from '#machines/publish.machine.js';
import type { FileManagerRef } from '#machines/file-manager.machine.types.js';
import { publicationApiCode } from '@taucad/types/constants';

const tinyFile = new Uint8Array([1]);

const testDoubleFileManagerRef = Symbol('publish-machine-test-file-manager') as unknown as FileManagerRef;

describe('publishMachine', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should transition idle → collectingFiles → uploading → success when API returns 200', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ id: 'pub_ok', urls: { share: 'https://app/v/pub_ok', view: 'https://app/v/pub_ok' } }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const machine = publishMachine.provide({
      actors: {
        collectPublishFilesActor: fromSafeAsync(async () => ({
          type: 'publishFilesCollected',
          files: new Map<string, Uint8Array<ArrayBuffer>>([['main.ts', tinyFile]]),
        })),
      },
    });

    const actor = createActor(machine, {
      input: {
        fileManagerRef: testDoubleFileManagerRef,
        projectId: 'proj',
        projectName: 'Demo',
        entryFile: 'main.ts',
      },
    });

    actor.start();
    actor.send({ type: 'publish', visibility: 'private', title: 'Hello' });

    await waitFor(actor, (s) => s.matches('success'));
    expect(actor.getSnapshot().context.shareUrl).toBe('https://app/v/pub_ok');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    actor.stop();
  });

  it('should include sharedEmails in the publish manifest', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'pub_shared',
          urls: { share: 'https://app/v/pub_shared', view: 'https://app/v/pub_shared' },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const machine = publishMachine.provide({
      actors: {
        collectPublishFilesActor: fromSafeAsync(async () => ({
          type: 'publishFilesCollected',
          files: new Map<string, Uint8Array<ArrayBuffer>>([['main.ts', tinyFile]]),
        })),
      },
    });

    const actor = createActor(machine, {
      input: {
        fileManagerRef: testDoubleFileManagerRef,
        projectId: 'proj',
        projectName: 'Demo',
        entryFile: 'main.ts',
      },
    });

    actor.start();
    actor.send({
      type: 'publish',
      visibility: 'private',
      title: 'Hello',
      sharedEmails: ['friend@example.com', 'team@example.com'],
    });

    await waitFor(actor, (s) => s.matches('success'));
    const requestInit = fetchSpy.mock.calls[0]?.[1];
    const formData = requestInit?.body;
    expect(formData).toBeInstanceOf(FormData);
    const manifest = JSON.parse(String((formData as FormData).get('manifest'))) as { sharedEmails?: string[] };
    expect(manifest.sharedEmails).toEqual(['friend@example.com', 'team@example.com']);
    actor.stop();
  });

  it('should fail when collected payload exceeds total byte cap', async () => {
    const machine = publishMachine.provide({
      actors: {
        // @ts-expect-error -- Test double: throwing `fromSafeAsync` observable narrows XState snapshot generics vs declared actor logic.
        collectPublishFilesActor: fromSafeAsync(async () => {
          throw new Error('PAYLOAD_TOO_LARGE');
        }),
      },
    });

    const actor = createActor(machine, {
      input: {
        fileManagerRef: testDoubleFileManagerRef,
        projectId: 'proj',
        projectName: 'Demo',
        entryFile: 'main.ts',
      },
    });

    actor.start();
    actor.send({ type: 'publish', visibility: 'private', title: 'Hello' });

    await waitFor(actor, (s) => s.matches('error'));
    expect(actor.getSnapshot().context.error?.message).toBe('PAYLOAD_TOO_LARGE');
    actor.stop();
  });

  it('should surface PublishUploadError when POST returns 400', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('no', { status: 400 }));

    const machine = publishMachine.provide({
      actors: {
        collectPublishFilesActor: fromSafeAsync(async () => ({
          type: 'publishFilesCollected',
          files: new Map<string, Uint8Array<ArrayBuffer>>([['main.ts', tinyFile]]),
        })),
      },
    });

    const actor = createActor(machine, {
      input: {
        fileManagerRef: testDoubleFileManagerRef,
        projectId: 'proj',
        projectName: 'Demo',
        entryFile: 'main.ts',
      },
    });

    actor.start();
    actor.send({ type: 'publish', visibility: 'private', title: 'Hello' });

    await waitFor(actor, (s) => s.matches('error'));
    const publishError = actor.getSnapshot().context.error;
    expect(publishError).toBeInstanceOf(PublishUploadError);
    expect((publishError as PublishUploadError).status).toBe(400);
    actor.stop();
  });

  it('should surface network fault when fetch throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));

    const machine = publishMachine.provide({
      actors: {
        collectPublishFilesActor: fromSafeAsync(async () => ({
          type: 'publishFilesCollected',
          files: new Map<string, Uint8Array<ArrayBuffer>>([['main.ts', tinyFile]]),
        })),
      },
    });

    const actor = createActor(machine, {
      input: {
        fileManagerRef: testDoubleFileManagerRef,
        projectId: 'proj',
        projectName: 'Demo',
        entryFile: 'main.ts',
      },
    });

    actor.start();
    actor.send({ type: 'publish', visibility: 'private', title: 'Hello' });

    await waitFor(actor, (s) => s.matches('error'));
    const publishError = actor.getSnapshot().context.error;
    expect(publishError).toBeInstanceOf(PublishUploadError);
    expect((publishError as PublishUploadError).networkFault).toBe(true);
    actor.stop();
  });

  it('should attach apiCode for PROJECT_FORBIDDEN', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: publicationApiCode.PROJECT_FORBIDDEN }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const machine = publishMachine.provide({
      actors: {
        collectPublishFilesActor: fromSafeAsync(async () => ({
          type: 'publishFilesCollected',
          files: new Map<string, Uint8Array<ArrayBuffer>>([['main.ts', tinyFile]]),
        })),
      },
    });

    const actor = createActor(machine, {
      input: {
        fileManagerRef: testDoubleFileManagerRef,
        projectId: 'proj',
        projectName: 'Demo',
        entryFile: 'main.ts',
      },
    });

    actor.start();
    actor.send({ type: 'publish', visibility: 'private', title: 'Hello' });

    await waitFor(actor, (s) => s.matches('error'));
    const publishError = actor.getSnapshot().context.error;
    expect(publishError).toBeInstanceOf(PublishUploadError);
    expect((publishError as PublishUploadError).status).toBe(403);
    expect((publishError as PublishUploadError).apiCode).toBe(publicationApiCode.PROJECT_FORBIDDEN);
    actor.stop();
  });

  it('should map 413 responses to PublishUploadError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 413 }));

    const machine = publishMachine.provide({
      actors: {
        collectPublishFilesActor: fromSafeAsync(async () => ({
          type: 'publishFilesCollected',
          files: new Map<string, Uint8Array<ArrayBuffer>>([['main.ts', tinyFile]]),
        })),
      },
    });

    const actor = createActor(machine, {
      input: {
        fileManagerRef: testDoubleFileManagerRef,
        projectId: 'proj',
        projectName: 'Demo',
        entryFile: 'main.ts',
      },
    });

    actor.start();
    actor.send({ type: 'publish', visibility: 'private', title: 'Hello' });

    await waitFor(actor, (s) => s.matches('error'));
    const publishError = actor.getSnapshot().context.error;
    expect(publishError).toBeInstanceOf(PublishUploadError);
    expect((publishError as PublishUploadError).status).toBe(413);
    actor.stop();
  });

  it('should map 500 responses to PublishUploadError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 500 }));

    const machine = publishMachine.provide({
      actors: {
        collectPublishFilesActor: fromSafeAsync(async () => ({
          type: 'publishFilesCollected',
          files: new Map<string, Uint8Array<ArrayBuffer>>([['main.ts', tinyFile]]),
        })),
      },
    });

    const actor = createActor(machine, {
      input: {
        fileManagerRef: testDoubleFileManagerRef,
        projectId: 'proj',
        projectName: 'Demo',
        entryFile: 'main.ts',
      },
    });

    actor.start();
    actor.send({ type: 'publish', visibility: 'private', title: 'Hello' });

    await waitFor(actor, (s) => s.matches('error'));
    const error500 = actor.getSnapshot().context.error;
    expect(error500).toBeInstanceOf(PublishUploadError);
    expect((error500 as PublishUploadError).status).toBe(500);
    actor.stop();
  });

  it('should surface INVALID_RESPONSE when success JSON omits publication id', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ urls: { share: 'https://x' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const machine = publishMachine.provide({
      actors: {
        collectPublishFilesActor: fromSafeAsync(async () => ({
          type: 'publishFilesCollected',
          files: new Map<string, Uint8Array<ArrayBuffer>>([['main.ts', tinyFile]]),
        })),
      },
    });

    const actor = createActor(machine, {
      input: {
        fileManagerRef: testDoubleFileManagerRef,
        projectId: 'proj',
        projectName: 'Demo',
        entryFile: 'main.ts',
      },
    });

    actor.start();
    actor.send({ type: 'publish', visibility: 'private', title: 'Hello' });

    await waitFor(actor, (s) => s.matches('error'));
    const errorInvalid = actor.getSnapshot().context.error;
    expect(errorInvalid).toBeInstanceOf(PublishUploadError);
    expect((errorInvalid as PublishUploadError).message).toBe('INVALID_RESPONSE');
    actor.stop();
  });

  it('should retain shareUrl on success until reset', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ id: 'pub_keep', urls: { share: 'https://app/v/pub_keep', view: 'https://app/v/pub_keep' } }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const machine = publishMachine.provide({
      actors: {
        collectPublishFilesActor: fromSafeAsync(async () => ({
          type: 'publishFilesCollected',
          files: new Map<string, Uint8Array<ArrayBuffer>>([['main.ts', tinyFile]]),
        })),
      },
    });

    const actor = createActor(machine, {
      input: {
        fileManagerRef: testDoubleFileManagerRef,
        projectId: 'proj',
        projectName: 'Demo',
        entryFile: 'main.ts',
      },
    });

    actor.start();
    actor.send({ type: 'publish', visibility: 'private', title: 'Hello' });
    await waitFor(actor, (s) => s.matches('success'));
    expect(actor.getSnapshot().context.shareUrl).toBe('https://app/v/pub_keep');

    actor.send({ type: 'reset' });
    await waitFor(actor, (s) => s.matches('idle'));
    expect(actor.getSnapshot().context.shareUrl).toBeUndefined();
    actor.stop();
  });
});
