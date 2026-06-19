import { describe, expect, it } from 'vitest';
import { decodeProviderErrorBody } from '#api/chat/utils/provider-error-decoder.js';

const googleInvalidArgumentBody = [
  {
    error: {
      code: 400,
      message: 'Request contains an invalid argument.',
      errors: [
        {
          message: 'Request contains an invalid argument.',
          domain: 'global',
          reason: 'badRequest',
        },
      ],
      status: 'INVALID_ARGUMENT',
    },
  },
];

const encodeByteList = (value: unknown): string => [...new TextEncoder().encode(JSON.stringify(value))].join(',');

describe('decodeProviderErrorBody', () => {
  it('should decode Google status-prefixed decimal byte-list errors', () => {
    const decoded = decodeProviderErrorBody(
      `Google request failed with status code 400: ${encodeByteList(googleInvalidArgumentBody)}`,
    );

    expect(decoded).toMatchObject({
      bodyKind: 'byte-list',
      httpStatus: 400,
      providerCode: 'INVALID_ARGUMENT',
      providerStatus: 'INVALID_ARGUMENT',
      providerMessage: 'Request contains an invalid argument.',
      providerReason: 'badRequest',
    });
    expect(decoded.rawText).toContain('"status":"INVALID_ARGUMENT"');
  });

  it('should decode byte arrays and extract provider fields', () => {
    const decoded = decodeProviderErrorBody([...new TextEncoder().encode(JSON.stringify(googleInvalidArgumentBody))]);

    expect(decoded.bodyKind).toBe('bytes');
    expect(decoded.providerMessage).toBe('Request contains an invalid argument.');
    expect(decoded.providerCode).toBe('INVALID_ARGUMENT');
  });
});
