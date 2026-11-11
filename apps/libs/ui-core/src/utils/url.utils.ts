/**
 * Extracts a clean domain name from a URL by removing 'www.' prefix and the TLD
 */
export function extractDomainFromUrl(url: string, { includeTld = false }: { includeTld?: boolean } = {}): string {
  const sourceUrl = new URL(url);
  return sourceUrl.hostname
    .replace('www.', '')
    .split('.')
    .slice(0, includeTld ? undefined : -1)
    .join('.');
}

/**
 * Safely extracts a domain from a URL, returning undefined if the URL is invalid.
 * Useful for streaming scenarios where the URL may be incomplete.
 */
export function safeExtractDomainFromUrl(url: string, options?: { includeTld?: boolean }): string | undefined {
  if (!URL.canParse(url)) {
    return undefined;
  }

  return extractDomainFromUrl(url, options);
}

/**
 * Creates a Google Favicon URL for a given source URL
 */
export function createFaviconUrl(sourceUrl: string): string {
  const faviconUrl = new URL(
    'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&size=128',
  );
  faviconUrl.searchParams.set('url', sourceUrl);
  return faviconUrl.href;
}

/**
 * Safely creates a favicon URL, returning undefined if the source URL is invalid.
 * Useful for streaming scenarios where the URL may be incomplete.
 */
export function safeCreateFaviconUrl(sourceUrl: string): string | undefined {
  if (!URL.canParse(sourceUrl)) {
    return undefined;
  }

  return createFaviconUrl(sourceUrl);
}
