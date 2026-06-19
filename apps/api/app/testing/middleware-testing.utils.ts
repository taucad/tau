import type { BaseMessage } from '@langchain/core/messages';
import type { vi } from 'vitest';

// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Middleware hooks have union types that are impractical to fully type in tests
type HookFunction = (...args: any[]) => any;

/**
 * Resolves a LangGraph middleware hook, which may be exported as a plain function
 * or as `{ hook: fn }`. Throws if the hook is undefined.
 */
export const resolveMiddlewareHook = (hook: HookFunction | { hook: HookFunction } | undefined): HookFunction => {
  if (!hook) {
    throw new Error('hook not defined');
  }
  return typeof hook === 'function' ? hook : hook.hook;
};

type WrapModelCallMiddleware = { wrapModelCall?: (...args: never[]) => unknown };
type WrapToolCallMiddleware = { wrapToolCall?: (...args: never[]) => unknown };

/**
 * Invokes `wrapModelCall` on a middleware with correct type casts.
 * Centralizes the guard + `Parameters<typeof wrapModelCall>` boilerplate.
 */
export const invokeWrapModelCall = async <M extends WrapModelCallMiddleware>(
  middleware: M,
  request: { messages: BaseMessage[]; state?: Record<string, unknown>; [key: string]: unknown },
  handler: ReturnType<typeof vi.fn>,
): Promise<unknown> => {
  const { wrapModelCall } = middleware;
  if (!wrapModelCall) {
    throw new Error('wrapModelCall is not defined on middleware');
  }

  return wrapModelCall(request as Parameters<typeof wrapModelCall>[0], handler as Parameters<typeof wrapModelCall>[1]);
};

/**
 * Invokes `wrapToolCall` on a middleware with correct type casts.
 * Centralizes the guard + `Parameters<typeof wrapToolCall>` boilerplate.
 */
export const invokeWrapToolCall = async <M extends WrapToolCallMiddleware>(
  middleware: M,
  payload: {
    toolCall: { name: string; id: string; args: Record<string, unknown> };
    runtime: { context: Record<string, unknown> };
  },
  handler: ReturnType<typeof vi.fn>,
): Promise<unknown> => {
  const { wrapToolCall } = middleware;
  if (!wrapToolCall) {
    throw new Error('wrapToolCall not defined');
  }

  return wrapToolCall(
    payload as unknown as Parameters<typeof wrapToolCall>[0],
    handler as Parameters<typeof wrapToolCall>[1],
  );
};
