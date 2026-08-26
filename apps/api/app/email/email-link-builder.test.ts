import { describe, expect, it } from 'vitest';
import {
  assertEmailTemplateUrlAllowed,
  buildFrontendMagicLinkVerifyUrl,
  buildFrontendResetPasswordUrl,
  buildFrontendVerificationUrl,
  buildPublicationViewUrl,
  sanitizeFrontendRedirectPath,
} from '#email/email-link-builder.js';

describe('email link builder', () => {
  it('rewrites Better Auth verification links to the frontend verification route', () => {
    expect(
      buildFrontendVerificationUrl({
        frontendURL: 'http://localhost:3000',
        generatedUrl: 'http://localhost:4000/v1/auth/verify-email?token=secret&callbackURL=%2Fv%2Fpub_123',
        token: 'secret',
      }),
    ).toBe('http://localhost:3000/auth/verify-email?token=secret&redirectTo=%2Fv%2Fpub_123');
  });

  it('rewrites Better Auth reset links to the frontend reset route', () => {
    expect(
      buildFrontendResetPasswordUrl({
        frontendURL: 'http://localhost:3000',
        token: 'secret',
      }),
    ).toBe('http://localhost:3000/auth/reset-password?token=secret');
  });

  it('rewrites Better Auth magic links to the frontend verifier route', () => {
    expect(
      buildFrontendMagicLinkVerifyUrl({
        frontendURL: 'http://localhost:3000',
        generatedUrl: 'http://localhost:4000/v1/auth/magic-link/verify?token=secret&callbackURL=%2Fv%2Fpub_123',
        token: 'secret',
      }),
    ).toBe('http://localhost:3000/auth/magic-link/verify?token=secret&redirectTo=%2Fv%2Fpub_123');
  });

  it('builds publication viewer links from the frontend origin', () => {
    expect(buildPublicationViewUrl({ frontendURL: 'https://tau.new/', publicationId: 'pub_123' })).toBe(
      'https://tau.new/v/pub_123',
    );
  });

  it('keeps relative and same-origin redirects but rejects external redirects', () => {
    expect(
      sanitizeFrontendRedirectPath({ callbackURL: '/projects/abc?tab=share', frontendURL: 'https://tau.new' }),
    ).toBe('/projects/abc?tab=share');
    expect(
      sanitizeFrontendRedirectPath({
        callbackURL: 'https://tau.new/v/pub_123',
        frontendURL: 'https://tau.new',
      }),
    ).toBe('/v/pub_123');
    expect(
      sanitizeFrontendRedirectPath({
        callbackURL: 'https://evil.example/steal',
        frontendURL: 'https://tau.new',
      }),
    ).toBe('/');
  });

  it('rejects outbound auth email URLs that point at the API origin', () => {
    expect(() =>
      assertEmailTemplateUrlAllowed({
        frontendURL: 'http://localhost:3000',
        template: {
          kind: 'reset-password',
          email: 'user@example.com',
          url: 'http://localhost:4000/v1/auth/reset-password/token',
        },
      }),
    ).toThrow(/origin/u);
  });

  it('rejects outbound auth email URLs on the wrong frontend path', () => {
    expect(() =>
      assertEmailTemplateUrlAllowed({
        frontendURL: 'https://tau.new',
        template: {
          kind: 'magic-link',
          email: 'user@example.com',
          url: 'https://tau.new/auth/reset-password?token=secret',
        },
      }),
    ).toThrow(/path/u);
  });

  it('accepts frontend auth and publication email URLs', () => {
    expect(() =>
      assertEmailTemplateUrlAllowed({
        frontendURL: 'https://tau.new',
        template: {
          kind: 'magic-link',
          email: 'user@example.com',
          url: 'https://tau.new/auth/magic-link/verify?token=secret&redirectTo=%2F',
        },
      }),
    ).not.toThrow();
    expect(() =>
      assertEmailTemplateUrlAllowed({
        frontendURL: 'https://tau.new',
        template: {
          kind: 'publication-invite',
          recipientEmail: 'friend@example.com',
          ownerName: 'Ada',
          publicationTitle: 'Bracket',
          url: 'https://tau.new/v/pub_123',
        },
      }),
    ).not.toThrow();
  });
});
