/** @typedef {{event: string, event_id: string, page: string, placement?: string, campaign?: string, returning?: boolean}} MarketingEvent */
/** Keep all analytics payloads enumerated. Never serialize location or DOM text. */
export const allowedPages = new Set([
  '/',
  '/product/',
  '/vision/',
  '/pricing/',
  '/download/',
  '/blog/',
  '/privacy/',
  '/contact/',
  '/use-cases/',
  '/use-cases/prototyping/',
  '/use-cases/engineering/',
  '/use-cases/learning/',
]);
export const campaignCodes = new Set(['launch', 'blog', 'github', 'docs']);
/**
 * @typedef {{name: unknown, page: unknown, placement?: unknown, campaign?: unknown, returning?: unknown, eventId: unknown}} EventInput
 */

/** Every `data-placement` the templates emit; the site tests hold the two in step. */
export const ctaPlacements = new Set([
  'header',
  'primary',
  'hero',
  'product',
  'closing',
  'download',
  'download-web',
  'pricing-free',
  'pricing-pro',
]);

/**
 * Keep optional event properties within the first-party contract.
 * @internal
 * @param input - Untrusted caller values.
 * @type {(input: EventInput) => MarketingEvent | undefined}
 */
export const sanitizeEvent = ({ name, page, placement, campaign, returning, eventId }) => {
  if (
    typeof name !== 'string' ||
    typeof page !== 'string' ||
    !['marketing_page_view', 'marketing_cta_click', 'marketing_download_click'].includes(name) ||
    !allowedPages.has(page)
  ) {
    return undefined;
  }
  if (typeof eventId !== 'string' || !/^[a-f\d-]{36}$/u.test(eventId)) {
    return undefined;
  }
  return {
    event: name,
    event_id: eventId,
    page,
    ...(typeof placement === 'string' && ctaPlacements.has(placement) ? { placement } : {}),
    ...(typeof campaign === 'string' && campaignCodes.has(campaign) ? { campaign } : {}),
    ...(typeof returning === 'boolean' ? { returning } : {}),
  };
};
