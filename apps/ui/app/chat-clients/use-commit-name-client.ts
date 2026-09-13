import { useNameGeneratorClient } from '#chat-clients/_internal/name-generator-client.js';
import type { NameGeneratorClient } from '#chat-clients/_internal/name-generator-client.js';

/**
 * Profile-scoped chat client for the **commit-name** generator profile.
 *
 * Hits `POST /v1/chat` with `{ agent: { profile: 'commit_name' }, messages: [singleUserMessage] }`
 * and resolves with the assistant's accumulated commit message. UI sites call
 * `generate(prompt)` rather than threading `model: 'commit-name-generator'`
 * through user-message metadata.
 *
 * @public
 */
export const useCommitNameClient = (): NameGeneratorClient => useNameGeneratorClient('commit_name');
