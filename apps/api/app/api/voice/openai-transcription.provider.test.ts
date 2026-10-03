import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { Environment } from '#config/environment.config.js';
import { OpenAiTranscriptionProvider } from '#api/voice/openai-transcription.provider.js';
import { TranscriptionProviderError } from '#api/voice/voice.types.js';
import type { TranscriptionEvent } from '#api/voice/voice.types.js';

const providerWith = (environment: Partial<Pick<Environment, 'OPENAI_API_KEY' | 'TAU_TRANSCRIPTION_UPSTREAM_URL'>>) => {
  const config = mock<ConfigService<Environment, true>>();
  config.get.mockImplementation((key: keyof typeof environment) => environment[key]);
  return new OpenAiTranscriptionProvider(config);
};
// eslint-disable-next-line @typescript-eslint/naming-convention -- environment keys
const providerWithKey = (key: string | undefined) => providerWith({ OPENAI_API_KEY: key });

const sse = (...chunks: string[]) =>
  new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );

const collect = async (events: AsyncIterable<TranscriptionEvent>) => {
  const received: TranscriptionEvent[] = [];
  for await (const event of events) {
    received.push(event);
  }
  return received;
};

const hrefOf = (url: Parameters<typeof fetch>[0]): string =>
  url instanceof URL ? url.href : typeof url === 'string' ? url : url.url;

const input = { audio: new Uint8Array([1, 2, 3]), contentType: 'audio/wav', signal: new AbortController().signal };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OpenAiTranscriptionProvider', () => {
  it('should be configured only with an API key', () => {
    expect(providerWithKey('sk-test').isConfigured()).toBe(true);
    expect(providerWithKey(undefined).isConfigured()).toBe(false);
    expect(providerWithKey('').isConfigured()).toBe(false);
  });

  it('should send keyless development traffic to the e2e upstream seam', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(sse('data: {"type":"transcript.text.done","text":"ok"}\n'));
    vi.stubGlobal('fetch', fetchMock);
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment keys
    const provider = providerWith({ TAU_TRANSCRIPTION_UPSTREAM_URL: 'http://127.0.0.1:4015' });

    expect(provider.isConfigured()).toBe(true);
    await expect(collect(provider.transcribe(input))).resolves.toStrictEqual([{ type: 'done', text: 'ok' }]);
    expect(hrefOf(fetchMock.mock.calls[0]![0])).toBe('http://127.0.0.1:4015/v1/audio/transcriptions');
  });

  it('should stream gpt-transcribe deltas and the final text across split SSE chunks', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        sse(
          'data: {"type":"transcript.text.delta","delta":"Create"}\n\ndata: {"type":"transcript.te',
          'xt.delta","delta":" a bracket"}\n\n',
          'data: {"type":"transcript.text.done","text":"Create a bracket."}',
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const events = await collect(providerWithKey('sk-test').transcribe(input));

    expect(events).toStrictEqual([
      { type: 'delta', text: 'Create' },
      { type: 'delta', text: ' a bracket' },
      { type: 'done', text: 'Create a bracket.' },
    ]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(hrefOf(url)).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer sk-test');
    const form = init?.body as FormData;
    expect(form.get('model')).toBe('gpt-transcribe');
    expect(form.get('stream')).toBe('true');
    expect((form.get('file') as File).type).toBe('audio/wav');
  });

  it('should raise the upstream status when OpenAI refuses', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response('{"error":"bad"}', { status: 400 })));

    await expect(collect(providerWithKey('sk-test').transcribe(input))).rejects.toMatchObject(
      new TranscriptionProviderError('OpenAI transcription failed (400): {"error":"bad"}', 400),
    );
  });
});
