import { dictationEventSchema, dictationStatusSchema } from '@taucad/chat/schemas';
import type { DictationStatus } from '@taucad/chat/schemas';
import { ENV } from '#environment.config.js';
import { recordApiRequestId } from '#lib/api-request-id.js';
import { DictationError, SilentDictationError, dictationMessages } from '#components/dictation/dictation-errors.js';

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

/** The API's refusal of an unusable recording, already worded for people. */
const recordingRejected = 'The recording could not be transcribed. Try recording again.';

const refusalBody = async (response: Response): Promise<string | undefined> => {
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string') {
      return body.error;
    }
  } catch {
    // A body that is not the API's error shape carries no reason to show.
  }
  return undefined;
};

/**
 * Words the API's refusal by its status, so a raw status text or proxy page never reaches people.
 *
 * @returns The error to throw: silent when another tab is already transcribing.
 */
const refusal = async (response: Response): Promise<Error> => {
  switch (response.status) {
    case 401: {
      return new DictationError(dictationMessages.sessionExpired);
    }
    case 413: {
      return new DictationError(dictationMessages.recordingTooLong);
    }
    case 429: {
      return new SilentDictationError('A dictation is already being transcribed.');
    }
    case 503: {
      return new DictationError(
        (await refusalBody(response)) === recordingRejected
          ? dictationMessages.transcriptionFailed
          : dictationMessages.serviceUnavailable,
      );
    }
    default: {
      return new DictationError(
        response.status >= 500 ? dictationMessages.serviceUnavailable : dictationMessages.transcriptionFailed,
      );
    }
  }
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
    throw recordApiRequestId(await refusal(response), response);
  }
  let preview = '';
  let buffered = '';
  // WebKit's ReadableStream is not async iterable, so `for await` over the body fails on Safari.
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  try {
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- NDJSON events must be consumed in order.
      const read = await reader.read();
      if (read.done) {
        break;
      }
      buffered += read.value;
      const lines = buffered.split('\n');
      buffered = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim() === '') {
          continue;
        }
        const event = dictationEventSchema.safeParse(JSON.parse(line) as unknown);
        if (!event.success) {
          throw new DictationError(dictationMessages.transcriptionFailed);
        }
        if (event.data.type === 'error') {
          throw new DictationError(dictationMessages.transcriptionStopped);
        }
        if (event.data.type === 'done') {
          return event.data.text;
        }
        preview += event.data.text;
        options.onPreview(preview);
      }
    }
  } finally {
    // Releases the connection when a done or error event ends the read early, as `for await` did.
    void reader.cancel();
  }
  throw new DictationError(dictationMessages.transcriptionUnfinished);
}
