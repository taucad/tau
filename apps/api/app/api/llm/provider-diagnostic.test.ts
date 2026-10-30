import { describe, expect, it } from 'vitest';
import { errorDiagnostic, providerDiagnostic, textMarker } from '#api/llm/provider-diagnostic.js';

const quoted = 'PRIVATE_PROMPT_FRAGMENT_7d2e';

describe('providerDiagnostic', () => {
  it("should keep a provider's vocabulary and replace every sentence with its length and digest", () => {
    const body = {
      error: {
        code: 400,
        status: 'INVALID_ARGUMENT',
        type: 'invalid_request_error',
        param: 'messages[0].content',
        message: `Invalid value: '${quoted}'`,
        details: [
          { '@type': 'type.googleapis.com/google.rpc.BadRequest', fieldViolations: [{ field: 'contents[1]' }] },
        ],
      },
    };

    const diagnostic = providerDiagnostic(body);

    expect(JSON.parse(diagnostic)).toEqual({
      error: {
        ...body.error,
        message: textMarker(body.error.message),
      },
    });
    expect(diagnostic).not.toContain(quoted);
  });

  it('should keep a value only when it is one token under a vocabulary key', () => {
    const sentence = `not ${quoted}`;

    expect(JSON.parse(providerDiagnostic({ code: sentence, reason: 'API_KEY_INVALID', user: quoted }))).toEqual({
      code: textMarker(sentence),
      reason: 'API_KEY_INVALID',
      user: textMarker(quoted),
    });
  });

  it('should give the same marker for the same sentence and a different one otherwise', () => {
    expect(textMarker('a')).toBe(textMarker('a'));
    expect(textMarker('a')).not.toBe(textMarker('b'));
    expect(textMarker('abc')).toMatch(/^\[text 3 [\da-f]{8}\]$/u);
  });
});

describe('errorDiagnostic', () => {
  it("should name the error's class and codes and never its message", () => {
    const sdk = Object.assign(new Error(`400 {"error":{"message":"${quoted}"}}`), {
      name: 'BadRequestError',
      status: 400,
    });
    const network = new TypeError('fetch failed', {
      cause: Object.assign(new Error(`connect ECONNREFUSED ${quoted}`), { code: 'ECONNREFUSED' }),
    });

    expect(errorDiagnostic(sdk)).toBe('BadRequestError 400');
    expect(errorDiagnostic(network)).toBe('TypeError ECONNREFUSED');
    expect(errorDiagnostic(quoted)).toBe('string');
  });
});
