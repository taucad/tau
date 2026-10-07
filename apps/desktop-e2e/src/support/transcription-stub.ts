import { createServer } from 'node:http';
import { desktopE2EProviderStubUrl } from '#support/config.js';

/** What the stub measured in the WAV the API forwarded. */
export type TranscriptionReceipt = {
  readonly model: string;
  readonly stream: string;
  readonly sampleRate: number;
  readonly samples: number;
  readonly frequency: number;
  readonly rms: number;
};

export type TranscriptionStub = {
  readonly receipts: readonly TranscriptionReceipt[];
  /** Holds each transcription after its first delta until {@link release}. */
  hold(): void;
  release(): void;
  close(): Promise<void>;
};

/** Reads a mono PCM16 WAV and estimates the tone over complete periods after the capture ramp. */
const measure = (wav: Uint8Array<ArrayBuffer>): Omit<TranscriptionReceipt, 'model' | 'stream'> => {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const sampleRate = view.getUint32(24, true);
  const samples = view.getUint32(40, true) / 2;
  const warmup = Math.floor(sampleRate / 10);
  let crossings = 0;
  let sumSquares = 0;
  let firstCrossing: number | undefined;
  let lastCrossing = 0;
  let previous = 0;
  for (let index = warmup; index < samples; index++) {
    const value = view.getInt16(44 + index * 2, true) / 32_768;
    sumSquares += value * value;
    if (previous <= 0 && value > 0) {
      firstCrossing ??= index;
      lastCrossing = index;
      crossings++;
    }
    previous = value;
  }
  const frequency =
    firstCrossing === undefined || crossings < 2 ? 0 : ((crossings - 1) * sampleRate) / (lastCrossing - firstCrossing);
  return { sampleRate, samples, frequency, rms: Math.sqrt(sumSquares / Math.max(1, samples - warmup)) };
};

const textField = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
};

/**
 * Serves OpenAI's `/v1/audio/transcriptions` stream shape on the provider stub port, which the
 * API reaches through `TAU_TRANSCRIPTION_UPSTREAM_URL`. Every recording transcribes to one fixed phrase.
 */
export const startTranscriptionStub = async (text: string): Promise<TranscriptionStub> => {
  const receipts: TranscriptionReceipt[] = [];
  let gate: PromiseWithResolvers<void> | undefined;
  const server = createServer((request, response) => {
    // async-iife: bootstrap
    // Node owns request-listener settlement; failures become connection errors.
    void (async () => {
      try {
        if (request.method !== 'POST' || request.url !== '/v1/audio/transcriptions') {
          throw new Error(`Unexpected transcription request: ${request.method ?? 'unknown'} ${request.url ?? ''}`);
        }
        const chunks: Array<Uint8Array<ArrayBuffer>> = [];
        for await (const chunk of request) {
          chunks.push(chunk as Uint8Array<ArrayBuffer>);
        }
        const form = await new Response(new Blob(chunks), {
          headers: { 'content-type': request.headers['content-type'] ?? '' },
        }).formData();
        const file = form.get('file');
        if (!(file instanceof Blob)) {
          throw new TypeError('Transcription request carried no file.');
        }
        receipts.push({
          model: textField(form, 'model'),
          stream: textField(form, 'stream'),
          ...measure(new Uint8Array(await file.arrayBuffer())),
        });
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        const [first = '', ...rest] = text.split(' ');
        response.write(`data: ${JSON.stringify({ type: 'transcript.text.delta', delta: first })}\n\n`);
        await gate?.promise;
        response.write(`data: ${JSON.stringify({ type: 'transcript.text.delta', delta: ` ${rest.join(' ')}` })}\n\n`);
        response.write(`data: ${JSON.stringify({ type: 'transcript.text.done', text })}\n\n`);
        response.end('data: [DONE]\n\n');
      } catch (error) {
        console.error('[desktop-transcription-stub] rejected request', error);
        response.destroy(error instanceof Error ? error : new Error(String(error)));
      }
    })();
  });
  const stub = new URL(desktopE2EProviderStubUrl);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(Number(stub.port), stub.hostname, () => {
      server.off('error', reject);
      resolve();
    });
  });
  return {
    receipts,
    hold: () => {
      gate = Promise.withResolvers<void>();
    },
    release: () => {
      gate?.resolve();
      gate = undefined;
    },
    close: async () =>
      new Promise<void>((resolve) => {
        gate?.resolve();
        server.close(() => {
          resolve();
        });
        server.closeAllConnections();
      }),
  };
};
