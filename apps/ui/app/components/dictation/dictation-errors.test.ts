import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DictationError,
  dictationMessages,
  microphoneErrorMessage,
  transcriptionErrorMessage,
} from '#components/dictation/dictation-errors.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('microphoneErrorMessage', () => {
  it.each([
    ['NotAllowedError', dictationMessages.microphoneDenied],
    ['SecurityError', dictationMessages.microphoneDenied],
    ['NotFoundError', dictationMessages.microphoneMissing],
    ['OverconstrainedError', dictationMessages.microphoneMissing],
    ['NotReadableError', dictationMessages.microphoneBusy],
    ['AbortError', dictationMessages.microphoneBusy],
  ])('should word %s from the browser', (name, message) => {
    expect(microphoneErrorMessage(new DOMException('Requested device not found', name))).toBe(message);
  });

  it('should keep worded errors and hide anything technical', () => {
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn() } });
    expect(microphoneErrorMessage(new DictationError(dictationMessages.microphoneDisconnected))).toBe(
      dictationMessages.microphoneDisconnected,
    );
    expect(microphoneErrorMessage(new Error('AudioWorklet module failed to load'))).toBe(
      dictationMessages.microphoneFailed,
    );
    expect(microphoneErrorMessage('boom')).toBe(dictationMessages.microphoneFailed);
  });

  it('should say dictation is unavailable where the browser has no microphone API', () => {
    vi.stubGlobal('navigator', {});
    expect(microphoneErrorMessage(new TypeError("Cannot read properties of undefined (reading 'getUserMedia')"))).toBe(
      dictationMessages.microphoneUnsupported,
    );
  });
});

describe('transcriptionErrorMessage', () => {
  it('should tell offline from unreachable when the connection fails', () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(transcriptionErrorMessage(new TypeError('Failed to fetch'))).toBe(dictationMessages.offline);
    vi.stubGlobal('navigator', { onLine: true });
    expect(transcriptionErrorMessage(new TypeError('Failed to fetch'))).toBe(dictationMessages.unreachable);
  });

  it('should keep worded errors and hide parse failures', () => {
    expect(transcriptionErrorMessage(new DictationError(dictationMessages.sessionExpired))).toBe(
      dictationMessages.sessionExpired,
    );
    expect(transcriptionErrorMessage(new SyntaxError('Unexpected token < in JSON'))).toBe(
      dictationMessages.transcriptionFailed,
    );
  });
});
