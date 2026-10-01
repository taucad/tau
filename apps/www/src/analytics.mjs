/** Keep all analytics payloads enumerated. Never serialize location or DOM text. */
export const allowedPages = new Set([
  '/',
  '/product/',
  '/vision/',
  '/pricing/',
  '/download/',
  '/blog/',
  '/privacy/',
  '/use-cases/',
  '/use-cases/prototyping/',
  '/use-cases/engineering/',
  '/use-cases/learning/',
]);
export const campaignCodes = new Set(['launch', 'journal', 'github', 'docs']);
export const sanitizeEvent = ({ name, page, placement, campaign, returning, eventId }) => {
  if (
    !['marketing_page_view', 'marketing_cta_click', 'marketing_download_click'].includes(name) ||
    !allowedPages.has(page)
  )
    return undefined;
  if (typeof eventId !== 'string' || !/^[a-f\d-]{36}$/u.test(eventId)) return undefined;
  return {
    event: name,
    event_id: eventId,
    page,
    ...(['header', 'primary', 'download'].includes(placement) ? { placement } : {}),
    ...(campaignCodes.has(campaign) ? { campaign } : {}),
    ...(typeof returning === 'boolean' ? { returning } : {}),
  };
};
