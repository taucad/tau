import type { EmailTemplate } from '#email/email.types.js';

const authEmailPaths = {
  'magic-link': '/auth/magic-link/verify',
  'reset-password': '/auth/reset-password',
  'verify-email': '/auth/verify-email',
} as const satisfies Record<Extract<EmailTemplate['kind'], 'magic-link' | 'reset-password' | 'verify-email'>, string>;

export const sanitizeFrontendRedirectPath = ({
  callbackURL,
  frontendURL,
}: {
  readonly callbackURL?: string | null;
  readonly frontendURL: string;
}): string => {
  if (!callbackURL) {
    return '/';
  }

  if (callbackURL.startsWith('/') && !callbackURL.startsWith('//')) {
    return callbackURL;
  }

  try {
    const frontendOrigin = new URL(frontendURL).origin;
    const callback = new URL(callbackURL);

    if (callback.origin !== frontendOrigin) {
      return '/';
    }

    return `${callback.pathname}${callback.search}${callback.hash}` || '/';
  } catch {
    return '/';
  }
};

export const buildFrontendVerificationUrl = ({
  frontendURL,
  generatedUrl,
  token,
}: {
  readonly frontendURL: string;
  readonly generatedUrl: string;
  readonly token: string;
}): string => {
  const verificationUrl = new URL(authEmailPaths['verify-email'], frontendURL);
  const generatedVerificationUrl = new URL(generatedUrl);
  const redirectTo = sanitizeFrontendRedirectPath({
    callbackURL: generatedVerificationUrl.searchParams.get('callbackURL'),
    frontendURL,
  });

  verificationUrl.searchParams.set('token', token);
  verificationUrl.searchParams.set('redirectTo', redirectTo);

  return verificationUrl.toString();
};

export const buildFrontendResetPasswordUrl = ({
  frontendURL,
  token,
}: {
  readonly frontendURL: string;
  readonly token: string;
}): string => {
  const resetUrl = new URL(authEmailPaths['reset-password'], frontendURL);
  resetUrl.searchParams.set('token', token);
  return resetUrl.toString();
};

export const buildFrontendMagicLinkVerifyUrl = ({
  frontendURL,
  generatedUrl,
  token,
}: {
  readonly frontendURL: string;
  readonly generatedUrl: string;
  readonly token: string;
}): string => {
  const magicLinkUrl = new URL(authEmailPaths['magic-link'], frontendURL);
  const generatedMagicLinkUrl = new URL(generatedUrl);
  const redirectTo = sanitizeFrontendRedirectPath({
    callbackURL: generatedMagicLinkUrl.searchParams.get('callbackURL'),
    frontendURL,
  });

  magicLinkUrl.searchParams.set('token', token);
  magicLinkUrl.searchParams.set('redirectTo', redirectTo);

  return magicLinkUrl.toString();
};

export const buildPublicationViewUrl = ({
  frontendURL,
  publicationId,
}: {
  readonly frontendURL: string;
  readonly publicationId: string;
}): string => new URL(`/v/${publicationId}`, frontendURL).toString();

export const assertEmailTemplateUrlAllowed = ({
  template,
  frontendURL,
}: {
  readonly template: EmailTemplate;
  readonly frontendURL: string;
}): void => {
  let url: URL;
  try {
    url = new URL(template.url);
  } catch {
    throw new Error(`Invalid ${template.kind} email URL`);
  }

  const frontendOrigin = new URL(frontendURL).origin;
  if (url.origin !== frontendOrigin) {
    throw new Error(`Invalid ${template.kind} email URL origin`);
  }

  if (template.kind === 'publication-invite') {
    if (!url.pathname.startsWith('/v/') || url.pathname.length <= '/v/'.length) {
      throw new Error('Invalid publication-invite email URL path');
    }

    return;
  }

  const expectedPath = authEmailPaths[template.kind];
  if (url.pathname !== expectedPath) {
    throw new Error(`Invalid ${template.kind} email URL path`);
  }
};
