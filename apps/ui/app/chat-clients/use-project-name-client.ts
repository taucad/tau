import { useNameGeneratorClient } from '#chat-clients/_internal/name-generator-client.js';
import type { NameGeneratorClient } from '#chat-clients/_internal/name-generator-client.js';

/**
 * Profile-scoped chat client for the **project-name** generator profile.
 *
 * Hits `POST /v1/chat` with `{ agent: { profile: 'project_name' }, messages: [singleUserMessage] }`
 * and resolves with the assistant's accumulated text. UI sites call
 * `generate(prompt)` rather than building a wire body or calling the AI SDK
 * `Chat` instance directly — the indirection is what stops the
 * `agent` block from being re-typed at every site.
 *
 * @public
 */
export const useProjectNameClient = (): NameGeneratorClient => useNameGeneratorClient('project_name');
