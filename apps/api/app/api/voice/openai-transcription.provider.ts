import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '#config/environment.config.js';
import { TranscriptionProviderError } from '#api/voice/voice.types.js';
import type { TranscriptionEvent, TranscriptionProvider } from '#api/voice/voice.types.js';

/** OpenAI's recommended model for completed recordings; it streams text while it transcribes. */
const openAiTranscriptionModel = 'gpt-transcribe';
const openAiOrigin = 'https://api.openai.com';
const transcriptionPath = '/v1/audio/transcriptions';

/** File transcription with `stream=true`: Server-Sent Events of `transcript.text.delta` then `.done`. */
@Injectable()
export class OpenAiTranscriptionProvider implements TranscriptionProvider {
  public get id(): string {
    return 'openai';
  }

  public constructor(private readonly config: ConfigService<Environment, true>) {}

  public isConfigured(): boolean {
    const key: string | undefined = this.config.get('OPENAI_API_KEY', { infer: true });
    return (key !== undefined && key !== '') || this.upstream() !== undefined;
  }

  public async *transcribe(input: {
    readonly audio: Uint8Array<ArrayBuffer>;
    readonly contentType: string;
    readonly signal: AbortSignal;
  }): AsyncIterable<TranscriptionEvent> {
    const form = new FormData();
    form.append('file', new Blob([input.audio], { type: input.contentType }), 'dictation.wav');
    form.append('model', openAiTranscriptionModel);
    form.append('stream', 'true');
    const response = await fetch(new URL(transcriptionPath, this.upstream() ?? openAiOrigin), {
      method: 'POST',
      headers: { authorization: `Bearer ${this.config.get('OPENAI_API_KEY', { infer: true }) ?? ''}` },
      body: form,
      signal: input.signal,
    });
    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => '');
      throw new TranscriptionProviderError(
        `OpenAI transcription failed (${response.status}): ${detail.slice(0, 300)}`,
        response.status,
      );
    }
    let buffered = '';
    for await (const chunk of response.body.pipeThrough(new TextDecoderStream())) {
      buffered += chunk;
      const lines = buffered.split('\n');
      buffered = lines.pop() ?? '';
      for (const line of lines) {
        const event = parseEvent(line);
        if (event) {
          yield event;
        }
      }
    }
    const last = parseEvent(buffered);
    if (last) {
      yield last;
    }
  }

  /** The development-only e2e seam; see `TAU_TRANSCRIPTION_UPSTREAM_URL`. */
  private upstream(): string | undefined {
    return this.config.get('TAU_TRANSCRIPTION_UPSTREAM_URL', { infer: true });
  }
}

const parseEvent = (line: string): TranscriptionEvent | undefined => {
  if (!line.startsWith('data:')) {
    return undefined;
  }
  const data: unknown = JSON.parse(line.slice(5));
  if (typeof data !== 'object' || data === null || !('type' in data)) {
    return undefined;
  }
  if (data.type === 'transcript.text.delta' && 'delta' in data && typeof data.delta === 'string') {
    return { type: 'delta', text: data.delta };
  }
  if (data.type === 'transcript.text.done' && 'text' in data && typeof data.text === 'string') {
    return { type: 'done', text: data.text };
  }
  if (data.type === 'error') {
    throw new TranscriptionProviderError(
      `OpenAI transcription stream failed: ${JSON.stringify(data).slice(0, 300)}`,
      502,
    );
  }
  return undefined;
};
