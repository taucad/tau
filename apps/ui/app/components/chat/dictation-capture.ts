import processorUrl from '#components/chat/dictation-processor.js?worker&url';

export type DictationCapture = {
  /** Stops the microphone, drains the worklet and returns the whole recording as WAV. */
  finish(): Promise<Blob>;
  cancel(): void;
};

/** Mono PCM16 little-endian WAV; the API forwards these bytes to the speech provider unchanged. */
export function encodeDictationWav(chunks: readonly Float32Array[], sampleRate: number): Blob {
  const sampleCount = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const bytes = new Uint8Array(44 + sampleCount * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string): void => {
    bytes.set(new TextEncoder().encode(value), offset);
  };
  text(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, sampleCount * 2, true);
  let offset = 44;
  for (const chunk of chunks) {
    for (const sample of chunk) {
      const bounded = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, Math.round(bounded * (bounded < 0 ? 32_768 : 32_767)), true);
      offset += 2;
    }
  }
  return new Blob([bytes], { type: 'audio/wav' });
}

/** Owns the microphone, worklet and context from permission through the final flushed batch. */
export async function captureDictation({
  signal,
  maxSamples,
  onLevel,
  onLimit,
  onError,
}: {
  readonly signal: AbortSignal;
  /** Recording length at which {@link onLimit} fires once, so the caller can stop in time. */
  readonly maxSamples: number;
  readonly onLevel: (level: number) => void;
  readonly onLimit: () => void;
  readonly onError: (error: Error) => void;
}): Promise<DictationCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  let context: AudioContext | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let processor: AudioWorkletNode | undefined;
  const chunks: Float32Array[] = [];
  let samples = 0;
  let released = false;
  let closing = Promise.resolve();
  const closeContext = async (): Promise<void> => {
    try {
      await context?.close();
    } catch {
      // A context already closed during cancellation needs no second close.
    }
  };
  let finishCapture: Promise<Blob> | undefined;
  let resolveFlushed: (() => void) | undefined;
  /** Milliseconds to acknowledge the stopped worklet. */
  const flushWait = 2000;
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  const cancel = (): void => {
    if (released) {
      return;
    }
    released = true;
    for (const track of stream.getTracks()) {
      track.stop();
    }
    source?.disconnect();
    if (processor) {
      processor.disconnect();
      processor.port.close();
    }
    if (context) {
      closing = closeContext();
    }
    clearTimeout(flushTimer);
    resolveFlushed?.();
    signal.removeEventListener('abort', cancel);
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    signal.throwIfAborted();
    context = new AudioContext({ sampleRate: 24_000 });
    await context.audioWorklet.addModule(processorUrl);
    signal.throwIfAborted();
    source = context.createMediaStreamSource(stream);
    processor = new AudioWorkletNode(context, 'tau-dictation');
    const { sampleRate } = context;
    processor.port.addEventListener('message', ({ data }: MessageEvent<unknown>) => {
      if (released || typeof data !== 'object' || data === null || !('type' in data)) {
        return;
      }
      if (data.type === 'flushed') {
        resolveFlushed?.();
      } else if (data.type === 'audio' && 'samples' in data && data.samples instanceof Float32Array) {
        const batch = data.samples;
        onLevel(Math.sqrt(batch.reduce((sum, sample) => sum + sample * sample, 0) / batch.length));
        chunks.push(batch);
        const reached = samples < maxSamples && samples + batch.length >= maxSamples;
        samples += batch.length;
        if (reached) {
          onLimit();
        }
      }
    });
    processor.port.start();
    processor.addEventListener('processorerror', () => {
      onError(new Error('Microphone capture stopped unexpectedly. Try dictation again.'));
      cancel();
    });
    const microphoneEnded = (): void => {
      if (!released && finishCapture === undefined) {
        onError(new Error('The microphone disconnected. Reconnect it and try again.'));
        cancel();
      }
    };
    for (const track of stream.getAudioTracks()) {
      track.addEventListener('ended', microphoneEnded, { once: true });
    }
    source.connect(processor);
    // The processor emits silence, keeping it scheduled without microphone feedback.
    processor.connect(context.destination);
    await context.resume();
    signal.throwIfAborted();
    return {
      cancel,
      finish: async () => {
        finishCapture ??= (async () => {
          try {
            for (const track of stream.getTracks()) {
              track.stop();
            }
            await new Promise<void>((resolve, reject) => {
              resolveFlushed = resolve;
              flushTimer = setTimeout(() => {
                reject(new Error('Microphone did not finish recording. Try again.'));
              }, flushWait);
              processor?.port.postMessage({ type: 'flush' });
            });
            clearTimeout(flushTimer);
            signal.throwIfAborted();
            return encodeDictationWav(chunks, sampleRate);
          } finally {
            cancel();
            await closing;
          }
        })();
        return finishCapture;
      },
    };
  } catch (error) {
    cancel();
    throw error;
  }
}
