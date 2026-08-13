import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Model } from '#api/models/model.schema.js';

/**
 * DI token for the optional replay-provider seam. `TauReplayModule` (loaded only
 * when `TAU_TEST_MODE=true`) binds this to `TauReplayService`; in production the
 * token is unregistered, so `ProviderService`/`ModelService` inject it with
 * `@Optional()` and see `undefined` — the `tau` provider then does not exist.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- NestJS DI injection token.
export const TAU_REPLAY_MODEL_PROVIDER = Symbol('TAU_REPLAY_MODEL_PROVIDER');

/**
 * The contract `ProviderService` (build the model) and `ModelService` (list the
 * catalog rows) consume. Keeps the replay model class + fixtures out of the prod
 * DI graph — only the module that implements this pulls them in.
 */
export type TauReplayModelProvider = {
  /** Catalog rows to append at runtime, mirroring the Ollama append. */
  listModels: () => Model[];
  /** Construct the replay chat model bound to the fixture for `modelId`. */
  createModel: (modelId: string) => BaseChatModel;
};
