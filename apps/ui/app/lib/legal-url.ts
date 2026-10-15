import { websiteOrigin } from '#lib/website-origin.js';

/**
 * Link to one of Tau's legal pages, which the website (`apps/www`) owns.
 *
 * @param page - Page and optional anchor, for example `privacy#9.2.1-ai-service-improvement`.
 * @returns `/legal/<page>` on the website origin for this client (`websiteOrigin`).
 */
export const legalUrl = (page: string): string => `${websiteOrigin()}/legal/${page}`;
