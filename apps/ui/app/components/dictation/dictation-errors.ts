/** A dictation failure worded for the person dictating; its message is shown as is. */
export class DictationError extends Error {
  public override readonly name = 'DictationError';
}

/** A dictation failure people already understand without being told, so it ends quietly. */
export class SilentDictationError extends Error {
  public override readonly name = 'SilentDictationError';
}

/** Every message dictation can show. Each says what happened and what to do, never a technical cause. */
export const dictationMessages = {
  microphoneDenied: 'Microphone access was denied. Allow microphone access in system settings and try again.',
  microphoneMissing: 'No microphone was found. Connect one and try again.',
  microphoneBusy: 'Your microphone is being used by another app. Close it and try again.',
  microphoneUnsupported: 'Dictation is not available in this browser.',
  microphoneFailed: 'Could not start dictation. Check your microphone and try again.',
  microphoneStopped: 'Microphone capture stopped unexpectedly. Try dictation again.',
  microphoneDisconnected: 'The microphone disconnected. Reconnect it and try again.',
  microphoneUnfinished: 'Microphone did not finish recording. Try again.',
  sessionExpired: 'Your session has expired. Sign in again to use dictation.',
  recordingTooLong: 'That recording is too long to transcribe. Try a shorter one.',
  transcriptionFailed: 'Could not transcribe your recording. Try again.',
  serviceUnavailable: 'The dictation service is unavailable. Try again shortly.',
  transcriptionStopped: 'Transcription stopped unexpectedly. Try dictation again.',
  transcriptionUnfinished: 'Transcription ended before it finished. Try dictation again.',
  offline: 'You are offline. Reconnect and try dictation again.',
  unreachable: 'Could not reach Tau. Check your connection and try again.',
  recordingLimit: 'Dictation stopped at the length limit. Transcribing what you recorded.',
} as const;

/**
 * Words a microphone or audio failure from the browser for the person dictating.
 *
 * @param error - What `getUserMedia`, the audio context or its worklet threw.
 * @returns The message to show.
 */
export const microphoneErrorMessage = (error: unknown): string => {
  if (error instanceof DictationError) {
    return error.message;
  }
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError':
      case 'SecurityError': {
        return dictationMessages.microphoneDenied;
      }
      case 'NotFoundError':
      case 'OverconstrainedError': {
        return dictationMessages.microphoneMissing;
      }
      case 'NotReadableError':
      case 'AbortError': {
        return dictationMessages.microphoneBusy;
      }
      default: {
        break;
      }
    }
  }
  if (!('mediaDevices' in navigator)) {
    // Insecure origins and older browsers expose no microphone API at all.
    return dictationMessages.microphoneUnsupported;
  }
  return dictationMessages.microphoneFailed;
};

/**
 * Words a transcription request's failure for the person dictating.
 *
 * @param error - What sending the recording or reading its result threw.
 * @returns The message to show.
 */
export const transcriptionErrorMessage = (error: unknown): string => {
  if (error instanceof DictationError) {
    return error.message;
  }
  // `fetch` and stream reads reject with a TypeError when the connection fails.
  if (error instanceof TypeError) {
    return navigator.onLine ? dictationMessages.unreachable : dictationMessages.offline;
  }
  return dictationMessages.transcriptionFailed;
};
