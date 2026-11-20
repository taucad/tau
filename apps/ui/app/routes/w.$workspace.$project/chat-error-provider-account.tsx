/*
 * Tau Cloud's provider-account card. The self-host build swaps this module for `chat-error-provider-account.self-host.js`
 * through the source alias list in `apps/ui/vite.config.ts`; the card itself is Core
 * (`chat-error-provider-account-funded.tsx`), so an adaptive build renders it without the Cloud chunk.
 */
// oxlint-disable-next-line no-barrel-files/no-barrel-files -- the details parser is shared by every ceiling.
export { providerEntryFrom } from '#routes/w.$workspace.$project/chat-error-provider-account.self-host.js';
// oxlint-disable-next-line no-barrel-files/no-barrel-files -- the pinned `cloud` build's card is the Core funded card.
export { ChatErrorProviderAccountFunded as ChatErrorProviderAccount } from '#routes/w.$workspace.$project/chat-error-provider-account-funded.js';
