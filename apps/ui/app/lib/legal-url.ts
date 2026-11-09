import { websiteOrigin } from '#lib/website-origin.js';

/**
 * Link to one of Tau's legal pages, which the website (`apps/www`) owns.
 *
 * @param page - Page and optional anchor, for example `privacy#2-improving-tau-with-your-chats`.
 * @returns `/legal/<page>` on the website origin for this client (`websiteOrigin`).
 */
export const legalUrl = (page: string): string => `${websiteOrigin()}/legal/${page}`;
