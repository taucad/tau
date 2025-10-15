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
 * Creates a Google Favicon URL for a given source URL
 */
export function createFaviconUrl(sourceUrl: string): string {
  const faviconUrl = new URL(
    'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&size=128',
  );
  faviconUrl.searchParams.set('url', sourceUrl);
  return faviconUrl.href;
}
