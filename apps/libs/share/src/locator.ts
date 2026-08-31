import { ShareError } from '#provider.js';

const providerIdPattern = /^[a-z][a-z0-9-]*$/u;
const referencePattern = /^[A-Za-z0-9._-]+$/u;
const gistReferencePattern = /^[0-9a-f]+(?:\.[0-9a-f]{40})?$/u;

/** Maximum opaque provider reference carried in one share route. @public */
export const shareReferenceMaxCharacters = 8192;

/** Provider-qualified location parsed from `/s/:slug`. @public */
export type ShareLocator = {
  readonly providerId: string;
  readonly reference?: string;
};

/** Fragment-only secret fields kept separate from route locators. @public */
export type ShareLocatorSecrets = Readonly<Record<string, string>>;

/** Parsed provider locator and fragment secrets. @public */
export type ParsedShareUrl = {
  readonly locator: ShareLocator;
  readonly secrets: ShareLocatorSecrets;
};

const assertReference = (providerId: string, reference: string): void => {
  if (reference.length > shareReferenceMaxCharacters || !referencePattern.test(reference)) {
    throw new ShareError('SHARE_LOCATOR_INVALID', 'The share reference is malformed.');
  }
  if (providerId === 'github-gist' && !gistReferencePattern.test(reference)) {
    throw new ShareError('SHARE_LOCATOR_INVALID', 'The GitHub Gist reference is malformed.');
  }
};

/** Parse one canonical provider-qualified share-route slug. @public */
export const parseShareSlug = (slug: string): ShareLocator => {
  if (slug === 'direct') {
    return { providerId: 'direct' };
  }
  const separator = slug.indexOf('~');
  if (separator === -1) {
    throw new ShareError('SHARE_LOCATOR_INVALID', 'The share locator must identify its provider.');
  }
  if (slug.includes('~', separator + 1)) {
    throw new ShareError('SHARE_LOCATOR_INVALID', 'The share locator is malformed.');
  }
  const providerId = slug.slice(0, separator);
  const reference = slug.slice(separator + 1);
  if (!providerIdPattern.test(providerId) || reference.length === 0) {
    throw new ShareError('SHARE_LOCATOR_INVALID', 'The share locator is malformed.');
  }
  if (providerId === 'direct') {
    throw new ShareError('SHARE_LOCATOR_INVALID', 'Direct shares must not contain a route reference.');
  }
  assertReference(providerId, reference);
  return { providerId, reference };
};

const parseFragment = (fragment: string): Map<string, string> => {
  const values = new Map<string, string>();
  const parameters = new URLSearchParams(fragment.startsWith('#') ? fragment.slice(1) : fragment);
  for (const [key, value] of parameters) {
    if (values.has(key) || value.length === 0) {
      throw new ShareError('SHARE_LOCATOR_INVALID', 'The share link contains malformed secret fields.');
    }
    values.set(key, value);
  }
  return values;
};

const requireExactFields = (values: Map<string, string>, fields: readonly string[]): ShareLocatorSecrets => {
  if (values.size !== fields.length || fields.some((field) => !values.has(field))) {
    throw new ShareError('SHARE_LOCATOR_INVALID', 'The share link contains unexpected secret fields.');
  }
  return Object.fromEntries(fields.map((field) => [field, values.get(field)!]));
};

/** Parse a route slug and its client-only fragment under provider-specific rules. @public */
export const parseShareUrl = (input: { readonly slug: string; readonly fragment: string }): ParsedShareUrl => {
  const locator = parseShareSlug(input.slug);
  const values = parseFragment(input.fragment);
  if (locator.providerId === 'direct') {
    if (values.get('v') !== '2') {
      throw new ShareError('SHARE_LOCATOR_INVALID', 'This share-link version is not supported.');
    }
    if (values.has('zip')) {
      return { locator, secrets: requireExactFields(values, ['v', 'zip']) };
    }
    return {
      locator,
      secrets: values.has('p')
        ? requireExactFields(values, ['v', 'jwe', 'p'])
        : requireExactFields(values, ['v', 'jwe']),
    };
  }
  if (locator.providerId === 'github-gist') {
    return { locator, secrets: values.size === 0 ? {} : requireExactFields(values, ['p']) };
  }
  if (values.size > 0) {
    throw new ShareError('SHARE_LOCATOR_INVALID', 'This share link must not contain secret fields.');
  }
  return { locator, secrets: {} };
};

/** Format one canonical provider-qualified share URL. @public */
export const formatShareUrl = (input: {
  readonly origin: string;
  readonly locator: ShareLocator;
  readonly secrets?: ShareLocatorSecrets;
}): string => {
  const { providerId, reference } = input.locator;
  if (!providerIdPattern.test(providerId)) {
    throw new ShareError('SHARE_LOCATOR_INVALID', 'The share provider id is malformed.');
  }
  if (providerId === 'direct' && reference !== undefined) {
    throw new ShareError('SHARE_LOCATOR_INVALID', 'Direct shares must not contain a route reference.');
  }
  if (providerId !== 'direct') {
    if (!reference) {
      throw new ShareError('SHARE_LOCATOR_INVALID', 'The share provider requires a reference.');
    }
    assertReference(providerId, reference);
  }
  const slug = providerId === 'direct' ? 'direct' : `${providerId}~${reference}`;
  const url = new URL(`/s/${slug}`, input.origin);
  const secrets = input.secrets ?? {};
  const parameters = new URLSearchParams();
  for (const key of Object.keys(secrets).sort()) {
    const value = secrets[key];
    if (value) {
      parameters.set(key, value);
    }
  }
  const fragment = parameters.toString();
  if (fragment) {
    url.hash = fragment;
  }
  return url.toString();
};

/** Format a provider-qualified application path without requiring a browser origin. @public */
export const formatSharePath = (locator: ShareLocator): string => {
  const url = new URL(formatShareUrl({ origin: 'https://tau.invalid', locator }));
  return `${url.pathname}${url.hash}`;
};
