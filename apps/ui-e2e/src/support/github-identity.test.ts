import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line no-restricted-imports -- The Node-only unit target intentionally runs without browser aliases.
import { githubIdentityVariables, liveGithubOptIn, missingLiveGithubVariables, totpCode } from './github-identity.ts';

/** RFC 6238 Appendix B's SHA-1 seed, the ASCII bytes `12345678901234567890`, in base32. */
const rfc6238Secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

const everyVariable = (): Record<string, string> =>
  Object.fromEntries(
    [...githubIdentityVariables.first, ...githubIdentityVariables.second].map((name) => [name, 'set']),
  );

describe('live GitHub identities (C10, A4; R17)', () => {
  it('should name every missing variable for both identities and the opt-in, never a value', () => {
    expect(missingLiveGithubVariables(['first', 'second'], {})).toEqual([
      'TAU_E2E_GITHUB_USERNAME',
      'TAU_E2E_GITHUB_PASSWORD',
      'TAU_E2E_GITHUB_TOTP_SECRET',
      'TAU_E2E_GITHUB_SECOND_USERNAME',
      'TAU_E2E_GITHUB_SECOND_PASSWORD',
      'TAU_E2E_GITHUB_SECOND_TOTP_SECRET',
      'TAU_E2E_LIVE_GITHUB',
    ]);
  });

  it('should need only the second identity and the opt-in for the A4 row', () => {
    expect(missingLiveGithubVariables(['second'], { [githubIdentityVariables.first[0]]: 'set' })).toEqual([
      'TAU_E2E_GITHUB_SECOND_USERNAME',
      'TAU_E2E_GITHUB_SECOND_PASSWORD',
      'TAU_E2E_GITHUB_SECOND_TOTP_SECRET',
      liveGithubOptIn,
    ]);
  });

  it('should treat an empty value as missing and the opt-in as set only when it is exactly true', () => {
    const environment = { ...everyVariable(), [githubIdentityVariables.second[1]]: '', [liveGithubOptIn]: '1' };
    expect(missingLiveGithubVariables(['first', 'second'], environment)).toEqual([
      'TAU_E2E_GITHUB_SECOND_PASSWORD',
      liveGithubOptIn,
    ]);
  });

  it('should report nothing missing once both identities and the opt-in are set', () => {
    expect(missingLiveGithubVariables(['first', 'second'], { ...everyVariable(), [liveGithubOptIn]: 'true' })).toEqual(
      [],
    );
  });

  it('should compute the RFC 6238 SHA-1 test vectors as six-digit codes', () => {
    /* Appendix B lists eight digits; GitHub asks for the low six. */
    expect(totpCode(rfc6238Secret, 59_000)).toBe('287082');
    expect(totpCode(rfc6238Secret, 1_111_111_109_000)).toBe('081804');
    expect(totpCode(rfc6238Secret, 1_234_567_890_000)).toBe('005924');
    expect(totpCode(rfc6238Secret, 20_000_000_000_000)).toBe('353130');
  });

  it('should accept a secret as GitHub shows it, spaced and in lower case', () => {
    const spaced = rfc6238Secret.toLowerCase().replaceAll(/(.{4})/gu, '$1 ');
    expect(totpCode(spaced, 59_000)).toBe('287082');
  });

  it('should refuse a secret that is not base32', () => {
    expect(() => totpCode('not base32!', 59_000)).toThrow('A GitHub TOTP secret must be base32.');
  });
});
