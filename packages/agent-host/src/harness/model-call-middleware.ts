import type { StreamFn } from '@earendil-works/pi-agent-core';
import type { Api, AssistantMessageEventStream, Context, Model, SimpleStreamOptions } from '@earendil-works/pi-ai';

/** One pi model call before it enters the provider transport. @public */
export type ModelCallRequest = {
  readonly model: Model<Api>;
  readonly context: Context;
  readonly options?: SimpleStreamOptions | undefined;
};

/** Tau's portable equivalent of LangChain's `wrapModelCall`. @public */
export type ModelCallMiddleware = (
  request: ModelCallRequest,
  next: (request: ModelCallRequest) => Promise<AssistantMessageEventStream>,
) => Promise<AssistantMessageEventStream>;

/** Compose ordered middleware onto pi's single `streamFn` slot. @public */
export const composeModelCallMiddleware = (base: StreamFn, middleware: readonly ModelCallMiddleware[]): StreamFn => {
  const terminal = async (request: ModelCallRequest): Promise<AssistantMessageEventStream> =>
    base(request.model, request.context, request.options);
  let chain = terminal;
  for (let index = middleware.length - 1; index >= 0; index--) {
    const current = middleware[index]!;
    const next = chain;
    chain = async (request) => current(request, next);
  }
  return async (model, context, options) => chain({ model, context, options });
};
