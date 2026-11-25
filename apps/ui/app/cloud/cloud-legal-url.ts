import { websiteOrigin } from '#lib/website-origin.js';

/**
 * The Cloud chunk's own copy of `lib/legal-url` (gate G1, one-way dependency): tiny and pure, so the chunk shares no
 * module with the route chunks that link the legal pages. Keep the two identical.
 *
 * @param page - Page and optional anchor, for example `terms#refunds`.
 * @returns `/legal/<page>` on the website origin for this client.
 */
export const cloudLegalUrl = (page: string): string => `${websiteOrigin()}/legal/${page}`;
