import { z } from 'zod';

/** `GET /v1/voice/status`: whether the API can transcribe dictation, and through which vendor. @public */
export const dictationStatusSchema = z.object({
  available: z.boolean(),
  provider: z.string().optional(),
});

/** Dictation availability reported by the API. @public */
export type DictationStatus = z.infer<typeof dictationStatusSchema>;

/**
 * One NDJSON line of `POST /v1/voice/transcriptions`. Deltas preview the text;
 * `done` carries the authoritative transcript; `error` ends a stream that already started.
 * @public
 */
export const dictationEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('delta'), text: z.string() }),
  z.object({ type: z.literal('done'), text: z.string() }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);

/** A streamed dictation transcription event. @public */
export type DictationEvent = z.infer<typeof dictationEventSchema>;

/** Largest WAV the dictation route accepts: the OpenAI file-transcription limit. @public */
export const dictationMaxAudioBytes = 25_000_000;
