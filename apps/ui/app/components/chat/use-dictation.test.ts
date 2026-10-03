// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { captureDictation, DictationCapture } from '#components/chat/dictation-capture.js';
import type { transcribeDictation } from '#components/chat/dictation-client.js';
import { useDictation } from '#components/chat/use-dictation.js';

const dependencies = vi.hoisted(() => ({
  capture: vi.fn<typeof captureDictation>(),
  status: vi.fn(),
  transcribe: vi.fn<typeof transcribeDictation>(),
}));
vi.mock('#components/chat/dictation-capture.js', () => ({ captureDictation: dependencies.capture }));
vi.mock('#components/chat/dictation-client.js', () => ({
  fetchDictationStatus: dependencies.status,
  transcribeDictation: dependencies.transcribe,
}));

const wav = new Blob([new Uint8Array([1])], { type: 'audio/wav' });
let capture: DictationCapture;

beforeEach(() => {
  vi.clearAllMocks();
  capture = { finish: vi.fn().mockResolvedValue(wav), cancel: vi.fn() };
  dependencies.status.mockResolvedValue({ available: true, provider: 'openai' });
  dependencies.capture.mockResolvedValue(capture);
});

const begin = async (onTranscript = vi.fn()) => {
  const hook = renderHook(({ draftOwner }) => useDictation(onTranscript, draftOwner), {
    initialProps: { draftOwner: {} as unknown },
  });
  await waitFor(() => {
    expect(hook.result.current.available).toBe(true);
  });
  await act(async () => hook.result.current.start());
  expect(hook.result.current.phase).toBe('recording');
  return { ...hook, onTranscript };
};

describe('useDictation', () => {
  it('should preview streamed text while transcribing and insert the final transcript once', async () => {
    const response = Promise.withResolvers<string>();
    let preview: ((text: string) => void) | undefined;
    dependencies.transcribe.mockImplementation(async (_wav, options) => {
      preview = options.onPreview;
      return response.promise;
    });
    const { result, onTranscript } = await begin();

    let stopped: Promise<boolean> | undefined;
    act(() => {
      stopped = result.current.stop();
    });
    await waitFor(() => {
      expect(result.current.phase).toBe('transcribing');
    });
    expect(dependencies.transcribe).toHaveBeenCalledWith(wav, expect.anything());
    act(() => {
      preview?.('Build a');
    });
    expect(result.current.transcript).toBe('Build a');
    expect(onTranscript).not.toHaveBeenCalled();
    await act(async () => {
      response.resolve(' Build a bracket. ');
      await stopped;
    });

    await expect(stopped).resolves.toBe(true);
    expect(onTranscript).toHaveBeenCalledExactlyOnceWith('Build a bracket.');
    expect(result.current).toMatchObject({ phase: 'idle', transcript: '', error: undefined });
  });

  it('should cancel a pending transcription without inserting it', async () => {
    const response = Promise.withResolvers<string>();
    dependencies.transcribe.mockReturnValue(response.promise);
    const { result, onTranscript } = await begin();
    act(() => {
      void result.current.stop();
    });
    await waitFor(() => {
      expect(result.current.phase).toBe('transcribing');
    });
    const { signal } = dependencies.transcribe.mock.calls[0]![1];

    act(() => {
      result.current.cancel();
    });
    await act(async () => {
      response.resolve('Too late');
    });

    expect(signal.aborted).toBe(true);
    expect(onTranscript).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('idle');
  });

  it('should report API errors and empty speech without touching the draft', async () => {
    dependencies.transcribe.mockRejectedValueOnce(
      new Error('The dictation service is unavailable. Try again shortly.'),
    );
    dependencies.transcribe.mockResolvedValueOnce('  ');
    const { result, onTranscript } = await begin();

    await act(async () => result.current.stop());
    expect(result.current.error).toBe('The dictation service is unavailable. Try again shortly.');
    await act(async () => result.current.start());
    await act(async () => result.current.stop());

    expect(result.current.error).toBe('No speech was recognized. Check your microphone and try again.');
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it('should release the microphone on draft-owner changes and unmount', async () => {
    const { rerender, unmount, result } = await begin();
    rerender({ draftOwner: {} });
    expect(capture.cancel).toHaveBeenCalledOnce();
    expect(result.current.phase).toBe('idle');

    await act(async () => result.current.start());
    unmount();

    expect(capture.cancel).toHaveBeenCalledTimes(2);
  });

  it('should stop at the recording limit', async () => {
    dependencies.transcribe.mockResolvedValue('Long dictation.');
    const onTranscript = vi.fn();
    await begin(onTranscript);
    const { maxSamples, onLimit } = dependencies.capture.mock.calls[0]![0];

    await act(async () => {
      onLimit();
    });

    expect(maxSamples).toBe(12_499_978);
    await waitFor(() => {
      expect(onTranscript).toHaveBeenCalledWith('Long dictation.');
    });
  });

  it('should refuse to start while unavailable and surface microphone denial', async () => {
    dependencies.status.mockResolvedValueOnce({ available: false });
    const unavailable = renderHook(() => useDictation(vi.fn(), undefined));
    await waitFor(() => {
      expect(unavailable.result.current.available).toBe(false);
    });
    await act(async () => unavailable.result.current.start());
    expect(dependencies.capture).not.toHaveBeenCalled();

    dependencies.capture.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'));
    const denied = renderHook(() => useDictation(vi.fn(), undefined));
    await waitFor(() => {
      expect(denied.result.current.available).toBe(true);
    });
    await act(async () => denied.result.current.start());

    expect(denied.result.current.error).toMatch(/Microphone access was denied/u);
    await expect(denied.result.current.stop()).resolves.toBe(false);
  });
});
