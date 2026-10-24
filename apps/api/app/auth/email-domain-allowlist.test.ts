import { describe, expect, it } from 'vitest';
import { isEmailDomainAllowed } from '#auth/email-domain-allowlist.js';

describe('isEmailDomainAllowed', () => {
  const allowed = ['tau.new', 'fontein.co'];

  it('allows every address when the list is empty', () => {
    expect(isEmailDomainAllowed('anyone@example.test', [])).toBe(true);
  });

  it('matches the domain exactly and without case', () => {
    expect(isEmailDomainAllowed('richard@tau.new', allowed)).toBe(true);
    expect(isEmailDomainAllowed('Richard@Fontein.CO', allowed)).toBe(true);
  });

  it('refuses other domains, subdomains and look-alikes', () => {
    expect(isEmailDomainAllowed('someone@example.test', allowed)).toBe(false);
    expect(isEmailDomainAllowed('someone@x.tau.new', allowed)).toBe(false);
    expect(isEmailDomainAllowed('someone@tau.new.evil.test', allowed)).toBe(false);
    expect(isEmailDomainAllowed('tau.new@evil.test', allowed)).toBe(false);
  });

  it('refuses an address with no domain', () => {
    expect(isEmailDomainAllowed('tau.new', allowed)).toBe(false);
  });
});
