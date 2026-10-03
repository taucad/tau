import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { DictationEvent, DictationStatus } from '@taucad/chat/schemas';
import { TranscriptionProviderError, transcriptionProvidersKey } from '#api/voice/voice.types.js';
import type { TranscriptionEvent, TranscriptionProvider } from '#api/voice/voice.types.js';

/** Routes dictation to the first configured speech-to-text provider. */
@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);

  public constructor(@Inject(transcriptionProvidersKey) private readonly providers: readonly TranscriptionProvider[]) {}

  public status(): DictationStatus {
    const provider = this.provider();
    return provider ? { available: true, provider: provider.id } : { available: false };
  }

  /**
   * Starts a transcription and waits for its first event, so refusals surface as HTTP errors
   * before the response commits; later failures become a final `error` line.
   */
  public async transcribe(input: {
    readonly audio: Uint8Array<ArrayBuffer>;
    readonly contentType: string;
    readonly signal: AbortSignal;
  }): Promise<AsyncIterable<DictationEvent>> {
    const provider = this.provider();
    if (!provider) {
      throw new ServiceUnavailableException('Dictation is not configured on this server.');
    }
    const events = provider.transcribe(input)[Symbol.asyncIterator]();
    const first = await this.next(provider, events);
    const { logger } = this;
    const rest: AsyncIterable<TranscriptionEvent> = { [Symbol.asyncIterator]: () => events };
    return (async function* () {
      try {
        if (!first.done) {
          yield first.value;
          yield* rest;
        }
      } catch (error) {
        if (input.signal.aborted) {
          return;
        }
        logger.warn(`Dictation stream from ${provider.id} failed: ${String(error)}`);
        yield { type: 'error', message: 'Transcription stopped unexpectedly. Try dictation again.' };
      }
    })();
  }

  private provider(): TranscriptionProvider | undefined {
    return this.providers.find((provider) => provider.isConfigured());
  }

  private async next(
    provider: TranscriptionProvider,
    events: AsyncIterator<TranscriptionEvent>,
  ): Promise<IteratorResult<TranscriptionEvent>> {
    try {
      return await events.next();
    } catch (error) {
      if (!(error instanceof TranscriptionProviderError)) {
        throw error;
      }
      this.logger.warn(`Dictation provider ${provider.id} refused: ${error.message}`);
      throw new ServiceUnavailableException(
        error.status === 400
          ? 'The recording could not be transcribed. Try recording again.'
          : 'The dictation service is unavailable. Try again shortly.',
      );
    }
  }
}
