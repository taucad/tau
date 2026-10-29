import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchDictationStatus, transcribeDictation } from '#components/dictation/dictation-client.js';
import { SilentDictationError, dictationMessages } from '#components/dictation/dictation-errors.js';

// eslint-disable-next-line @typescript-eslint/naming-convention -- environment module shape
vi.mock('#environment.config.js', () => ({ ENV: { TAU_API_URL: 'https://api.test' } }));

const ndjson = (...chunks: string[]) =>
  new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'application/x-ndjson' } },
  );

const wav = new Blob([new Uint8Array([1])], { type: 'audio/wav' });
const { signal } = new AbortController();

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchDictationStatus', () => {
  it('should read availability and treat refusals as unavailable', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ available: true, provider: 'openai' }))
      .mockResolvedValueOnce(new Response('{}', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchDictationStatus()).resolves.toEqual({ available: true, provider: 'openai' });
    await expect(fetchDictationStatus()).resolves.toEqual({ available: false });
    expect(fetchMock.mock.calls[0]).toEqual([
      'https://api.test/v1/voice/status',
      { credentials: 'include', signal: undefined },
    ]);
  });
});

describe('transcribeDictation', () => {
  it('should post the WAV, preview accumulated deltas across split lines and return the final text', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        ndjson(
          '{"type":"delta","text":"Build"}\n{"type":"del',
          'ta","text":" a"}\n',
          '{"type":"done","text":"Build a bracket."}\n',
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const onPreview = vi.fn();

    await expect(transcribeDictation(wav, { signal, onPreview })).resolves.toBe('Build a bracket.');

    expect(onPreview.mock.calls).toEqual([['Build'], ['Build a']]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.test/v1/voice/transcriptions');
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'include',
      body: wav,
      headers: { 'content-type': 'audio/wav' },
    });
  });

  it('should read the stream where ReadableStream is not async iterable, as in Safari', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(ReadableStream.prototype, Symbol.asyncIterator);
    // WebKit ships ReadableStream without Symbol.asyncIterator, so `for await` over a body throws.
    Reflect.deleteProperty(ReadableStream.prototype, Symbol.asyncIterator);
    try {
      vi.stubGlobal(
        'fetch',
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(ndjson('{"type":"delta","text":"Build"}\n', '{"type":"done","text":"Build."}\n')),
      );
      const onPreview = vi.fn();

      await expect(transcribeDictation(wav, { signal, onPreview })).resolves.toBe('Build.');
      expect(onPreview.mock.calls).toEqual([['Build']]);
    } finally {
      if (descriptor) {
        Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, descriptor);
      }
    }
  });

  it('should word API refusals, streamed errors and truncated streams without technical detail', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json({ error: 'Dictation is not configured on this server.' }, { status: 503 }))
        .mockResolvedValueOnce(
          Response.json({ error: 'The recording could not be transcribed. Try recording again.' }, { status: 503 }),
        )
        .mockResolvedValueOnce(Response.json({ error: 'Unauthorized' }, { status: 401 }))
        .mockResolvedValueOnce(Response.json({ error: 'Payload Too Large' }, { status: 413 }))
        .mockResolvedValueOnce(Response.json({ error: 'Send the recording as audio/wav.' }, { status: 400 }))
        .mockResolvedValueOnce(new Response('<html>Bad gateway</html>', { status: 502 }))
        .mockResolvedValueOnce(ndjson('{"type":"error","message":"Upstream exploded: ECONNRESET"}\n'))
        .mockResolvedValueOnce(ndjson('{"type":"surprise"}\n'))
        .mockResolvedValueOnce(ndjson('{"type":"delta","text":"Build"}\n')),
    );
    const transcribe = async () => transcribeDictation(wav, { signal, onPreview: vi.fn() });

    for (const message of [
      dictationMessages.serviceUnavailable,
      dictationMessages.transcriptionFailed,
      dictationMessages.sessionExpired,
      dictationMessages.recordingTooLong,
      dictationMessages.transcriptionFailed,
      dictationMessages.serviceUnavailable,
      dictationMessages.transcriptionStopped,
      dictationMessages.transcriptionFailed,
      dictationMessages.transcriptionUnfinished,
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- Responses are consumed in order.
      await expect(transcribe()).rejects.toThrow(message);
    }
  });

  it('should end quietly when another tab is already transcribing', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ error: 'A dictation is already being transcribed.' }, { status: 429 })),
    );

    await expect(transcribeDictation(wav, { signal, onPreview: vi.fn() })).rejects.toBeInstanceOf(SilentDictationError);
  });
});
