import { Logger, VersioningType } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { dictationEventSchema, dictationStatusSchema } from '@taucad/chat/schemas';
import type { Auth } from 'better-auth';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import { AuthGuard } from '#auth/auth.guard.js';
import { authInstanceKey } from '#constants/auth.constant.js';
import { HttpExceptionFilter } from '#filters/http-exception.filter.js';
import { VoiceController } from '#api/voice/voice.controller.js';
import { VoiceService } from '#api/voice/voice.service.js';
import { TranscriptionProviderError, transcriptionProvidersKey } from '#api/voice/voice.types.js';
import type { TranscriptionEvent, TranscriptionProvider } from '#api/voice/voice.types.js';

type Session = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>;
type Received = { audio: Uint8Array<ArrayBuffer>; contentType: string };

/** A provider that streams nothing; the route under test never reaches it. */
const noEvents = async function* (): AsyncGenerator<TranscriptionEvent> {
  // No transcription events.
};

/** A provider that refuses before its first event, as OpenAI does for unreadable audio. */
const refusing = (error: Error) => (): AsyncIterable<TranscriptionEvent> => ({
  [Symbol.asyncIterator]: () => ({
    next: async () => {
      throw error;
    },
  }),
});

const stubProvider = (script: (received: Received) => AsyncIterable<TranscriptionEvent>, configured = true) => {
  const calls: Received[] = [];
  const provider: TranscriptionProvider = {
    id: 'stub',
    isConfigured: () => configured,
    transcribe: (input) => {
      calls.push({ audio: input.audio, contentType: input.contentType });
      return script(input);
    },
  };
  return { provider, calls };
};

const apps: NestFastifyApplication[] = [];
const createApp = async (provider: TranscriptionProvider, signedIn = true) => {
  const auth = mockDeep<Auth>();
  auth.api.getSession.mockResolvedValue(signedIn ? mock<Session>({ user: { id: 'user-1' } }) : null);
  const module = await Test.createTestingModule({
    controllers: [VoiceController],
    providers: [
      Reflector,
      AuthGuard,
      VoiceService,
      { provide: authInstanceKey, useValue: auth },
      { provide: transcriptionProvidersKey, useValue: [provider] },
    ],
  }).compile();
  const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableVersioning({ type: VersioningType.URI });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  apps.push(app);
  return app;
};

const wav = new TextEncoder().encode('RIFF-test-audio');
const post = async (app: NestFastifyApplication, payload: Uint8Array<ArrayBuffer> = wav) =>
  app.inject({
    method: 'POST',
    url: '/v1/voice/transcriptions',
    headers: { 'content-type': 'audio/wav' },
    payload: Buffer.from(payload),
  });
const lines = (body: string) =>
  body
    .trim()
    .split('\n')
    .map((line) => dictationEventSchema.parse(JSON.parse(line)));

beforeAll(() => {
  Logger.overrideLogger(false);
});

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe('VoiceController over HTTP', () => {
  it('should report the first configured provider, or none', async () => {
    const available = await createApp(stubProvider(noEvents).provider);
    const unavailable = await createApp(stubProvider(noEvents, false).provider);

    const [on, off] = await Promise.all([
      available.inject({ method: 'GET', url: '/v1/voice/status' }),
      unavailable.inject({ method: 'GET', url: '/v1/voice/status' }),
    ]);

    expect(dictationStatusSchema.parse(on.json())).toStrictEqual({ available: true, provider: 'stub' });
    expect(dictationStatusSchema.parse(off.json())).toStrictEqual({ available: false });
  });

  it('should require a signed-in user', async () => {
    const app = await createApp(stubProvider(noEvents).provider, false);

    const [transcription, status] = [await post(app), await app.inject({ method: 'GET', url: '/v1/voice/status' })];

    expect(transcription.statusCode).toBe(401);
    expect(status.statusCode).toBe(401);
  });

  it('should forward the WAV bytes and stream provider events as NDJSON', async () => {
    const { provider, calls } = stubProvider(async function* () {
      yield { type: 'delta', text: 'Create a' };
      yield { type: 'delta', text: ' bracket' };
      yield { type: 'done', text: 'Create a bracket.' };
    });
    const app = await createApp(provider);

    const response = await post(app);

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/x-ndjson');
    expect(lines(response.body)).toStrictEqual([
      { type: 'delta', text: 'Create a' },
      { type: 'delta', text: ' bracket' },
      { type: 'done', text: 'Create a bracket.' },
    ]);
    expect(calls[0]!.audio).toStrictEqual(wav);
    expect(calls[0]!.contentType).toBe('audio/wav');
  });

  it('should reject an empty or non-WAV body before calling the provider', async () => {
    const { provider, calls } = stubProvider(noEvents);
    const app = await createApp(provider);

    const empty = await post(app, new Uint8Array(0));
    const json = await app.inject({ method: 'POST', url: '/v1/voice/transcriptions', payload: { audio: 'x' } });

    expect(empty.statusCode).toBe(400);
    expect(json.statusCode).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('should turn a provider refusal into an HTTP error before the stream commits', async () => {
    const app = await createApp(stubProvider(refusing(new TranscriptionProviderError('bad audio', 400))).provider);

    const response = await post(app);

    expect(response.statusCode).toBe(503);
    expect(response.json<{ error: string }>().error).toBe(
      'The recording could not be transcribed. Try recording again.',
    );
  });

  it('should end a stream that fails after it started with an error line', async () => {
    const app = await createApp(
      stubProvider(async function* () {
        yield { type: 'delta', text: 'Create' };
        throw new TranscriptionProviderError('connection reset', 502);
      }).provider,
    );

    const response = await post(app);

    expect(response.statusCode).toBe(200);
    expect(lines(response.body)).toStrictEqual([
      { type: 'delta', text: 'Create' },
      { type: 'error', message: 'Transcription stopped unexpectedly. Try dictation again.' },
    ]);
  });

  it('should refuse when no provider is configured', async () => {
    const app = await createApp(stubProvider(noEvents, false).provider);

    const response = await post(app);

    expect(response.statusCode).toBe(503);
  });
});
