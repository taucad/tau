import { describe, expect, it } from 'vitest';
import { errorCategory } from '@taucad/types/constants';
import { parseErrorForPersistence } from '#utils/error.utils.js';

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
});
