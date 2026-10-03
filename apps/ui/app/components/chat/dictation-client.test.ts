import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchDictationStatus, transcribeDictation } from '#components/chat/dictation-client.js';

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

  it('should surface the API refusal, a streamed error and a truncated stream', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json({ error: 'Dictation is not configured on this server.' }, { status: 503 }))
        .mockResolvedValueOnce(ndjson('{"type":"error","message":"Transcription stopped unexpectedly."}\n'))
        .mockResolvedValueOnce(ndjson('{"type":"delta","text":"Build"}\n')),
    );

    await expect(transcribeDictation(wav, { signal, onPreview: vi.fn() })).rejects.toThrow(
      'Dictation is not configured on this server.',
    );
    await expect(transcribeDictation(wav, { signal, onPreview: vi.fn() })).rejects.toThrow(
      'Transcription stopped unexpectedly.',
    );
    await expect(transcribeDictation(wav, { signal, onPreview: vi.fn() })).rejects.toThrow(
      'Transcription ended before it finished.',
    );
  });
});
