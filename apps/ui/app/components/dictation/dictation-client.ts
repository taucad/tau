import { dictationEventSchema, dictationStatusSchema } from '@taucad/chat/schemas';
import type { DictationStatus } from '@taucad/chat/schemas';
import { ENV } from '#environment.config.js';

const unavailable: DictationStatus = { available: false };

/** Whether the signed-in user's Tau API can transcribe; signed-out and older APIs read as unavailable. */
export async function fetchDictationStatus(signal?: AbortSignal): Promise<DictationStatus> {
  const response = await fetch(`${ENV.TAU_API_URL}/v1/voice/status`, { credentials: 'include', signal });
  if (!response.ok) {
    return unavailable;
  }
  const parsed = dictationStatusSchema.safeParse(await response.json());
  return parsed.success ? parsed.data : unavailable;
}

const errorMessage = async (response: Response): Promise<string> => {
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string') {
      return body.error;
    }
  } catch {
    // A body that is not the API's error shape falls through to the generic message.
  }
  return 'Could not transcribe dictation. Try again.';
};

/**
 * Posts one recording and reads the API's NDJSON events.
 *
 * @returns The provider's final transcript.
 */
export async function transcribeDictation(
  wav: Blob,
  options: { readonly signal: AbortSignal; readonly onPreview: (text: string) => void },
): Promise<string> {
  const response = await fetch(`${ENV.TAU_API_URL}/v1/voice/transcriptions`, {
    method: 'POST',
    headers: { 'content-type': 'audio/wav' },
    credentials: 'include',
    body: wav,
    signal: options.signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(await errorMessage(response));
  }
  let preview = '';
  let buffered = '';
  for await (const chunk of response.body.pipeThrough(new TextDecoderStream())) {
    buffered += chunk;
    const lines = buffered.split('\n');
    buffered = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim() === '') {
        continue;
      }
      const event = dictationEventSchema.parse(JSON.parse(line));
      if (event.type === 'error') {
        throw new Error(event.message);
      }
      if (event.type === 'done') {
        return event.text;
      }
      preview += event.text;
      options.onPreview(preview);
    }
  }
  throw new Error('Transcription ended before it finished. Try dictation again.');
}
