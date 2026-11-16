/**
 * The AI SDK as the chat reaches it (progressive loading PL1): the per-chat `Chat`, the UI message stream
 * processor. A deferred leaf: only `chat-sdk-loader.ts` loads it, by dynamic import, so no route
 * class's interactive tier holds `ai` (`runtime/import-boundary.node.test.ts`, `lib/critical-graph.node.test.ts`).
 */
import { createUIMessageStream, readUIMessageStream } from 'ai';
import { createChatInstance } from '@taucad/chat-ui/chat-clients/_internal/shared-chat-transport';

/**
 * What the chat uses of the AI SDK. Each member reads its binding when used, as a direct import's call site would.
 *
 * @public
 */
export const chatSdk = {
  /** A chat's SDK `Chat` over its placement transport. */
  get createChatInstance(): typeof createChatInstance {
    return createChatInstance;
  },
  /** The SDK's processor of a run's chunks into its message, with the run's own message ids. */
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the AI SDK's own export name
  get createUIMessageStream(): typeof createUIMessageStream {
    return createUIMessageStream;
  },
  /** The SDK's processor of a run's chunks into message snapshots. */
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the AI SDK's own export name
  get readUIMessageStream(): typeof readUIMessageStream {
    return readUIMessageStream;
  },
};
