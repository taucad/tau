import { describe, expect, it } from 'vitest';
import { errorCategory } from '@taucad/types/constants';
import {
  chatTurnNotStartedCode,
  parseAdmissionFailureForPersistence,
  parseErrorForPersistence,
} from '#utils/error.utils.js';

const googleInvalidArgumentBody = [
  {
    error: {
      code: 400,
      message: 'Request contains an invalid argument.',
      status: 'INVALID_ARGUMENT',
    },
  },
];

const googleInvalidArgumentByteList = [...new TextEncoder().encode(JSON.stringify(googleInvalidArgumentBody))].join(
  ',',
);

describe('parseErrorForPersistence', () => {
  it('classifies Chrome mid-stream TypeError("network error") as network (R8)', () => {
    const parsed = parseErrorForPersistence(new TypeError('network error'));
    expect(parsed.category).toBe(errorCategory.network);
  });

  it('classifies Failed to fetch as network', () => {
    const parsed = parseErrorForPersistence(new TypeError('Failed to fetch'));
    expect(parsed.category).toBe(errorCategory.network);
  });

  it('classifies TypeError with NetworkError substring as network', () => {
    const parsed = parseErrorForPersistence(new TypeError('NetworkError when attempting to fetch resource'));
    expect(parsed.category).toBe(errorCategory.network);
  });

  it('classifies Safari Load failed as network', () => {
    const parsed = parseErrorForPersistence(new Error('Load failed'));
    expect(parsed.category).toBe(errorCategory.network);
  });

  it('classifies Chrome net::ERR_ failures as network', () => {
    const parsed = parseErrorForPersistence(new Error('net::ERR_INTERNET_DISCONNECTED'));
    expect(parsed.category).toBe(errorCategory.network);
  });

  it('falls through unrelated errors to generic', () => {
    const parsed = parseErrorForPersistence(new Error('boom'));
    expect(parsed.category).toBe(errorCategory.generic);
    expect(parsed.message).toBe('boom');
  });

  /* A refusal thrown by the host or the channel (not a run's terminal record) names its card by its own code. */
  it('should keep the code a thrown refusal carries', () => {
    const parsed = parseErrorForPersistence(
      Object.assign(new Error('The agent owner speaks another wire version; update Tau on that host.'), {
        code: 'WIRE_VERSION_UNSUPPORTED',
      }),
    );

    expect(parsed).toMatchObject({ category: errorCategory.generic, code: 'WIRE_VERSION_UNSUPPORTED' });
  });

  it('decodes Google byte-list provider errors before persistence', () => {
    const parsed = parseErrorForPersistence(
      new Error(`Google request failed with status code 400: ${googleInvalidArgumentByteList}`),
    );

    expect(parsed.category).toBe(errorCategory.toolError);
    expect(parsed.httpStatus).toBe(400);
    expect(parsed.code).toBe('INVALID_ARGUMENT');
    expect(parsed.message).toBe('Request contains an invalid argument.');
    expect(parsed.raw).toContain('Google request failed with status code 400');
    expect(parsed.message).not.toContain('91,123');
  });

  it.each([
    ['SESSION_LOG_INTEGRITY', 'This chat hit a problem while Tau was tidying its history.'],
    ['SUMMARY_REQUIRED', 'This chat hit a problem while Tau was tidying its history.'],
    ['NO_EVICTABLE_HISTORY', 'Tau could not make room for the next step.'],
    ['CIRCUIT_BREAKER_OPEN', 'Tau could not make room for the next step.'],
    ['REQUEST_TOO_LARGE', 'Tau could not make room for the next step.'],
  ])('should replace the raw %s host sentence with actionable copy', (code, message) => {
    const rawMessage = `Internal host sentence for ${code}`;
    const parsed = parseErrorForPersistence(
      new Error(
        JSON.stringify({
          category: errorCategory.generic,
          title: 'Something went wrong',
          message: rawMessage,
          code,
        }),
      ),
    );

    expect(parsed.code).toBe(code);
    expect(parsed.message).toBe(message);
    expect(parsed.message).not.toContain(rawMessage);
    expect(parsed.raw).toContain(rawMessage);
  });
});

describe('parseAdmissionFailureForPersistence', () => {
  it('should mark an uncoded dispatch failure as a turn that never started', () => {
    const parsed = parseAdmissionFailureForPersistence(
      new Error('This chat is still holding a workspace from an earlier run. Reload the page to release it.'),
    );

    expect(parsed.code).toBe(chatTurnNotStartedCode);
    expect(parsed.message).toBe(
      'This chat is still holding a workspace from an earlier run. Reload the page to release it.',
    );
  });

  it('should keep a thrown refusal at admission on the turn-not-started card', () => {
    const parsed = parseAdmissionFailureForPersistence(
      Object.assign(new Error('The composer did not bind in time.'), { code: 'COMPOSER_BINDING_TIMEOUT' }),
    );

    expect(parsed.code).toBe(chatTurnNotStartedCode);
  });

  it('should leave a coded refusal on its own card', () => {
    const parsed = parseAdmissionFailureForPersistence(
      new Error(
        JSON.stringify({
          category: errorCategory.credits,
          title: 'Credit Limit Reached',
          message: 'Add credits to start a turn on GPT-6 Astra.',
          code: 'INSUFFICIENT_CREDIT',
          httpStatus: 402,
        }),
      ),
    );

    expect(parsed.code).toBe('INSUFFICIENT_CREDIT');
  });
});
