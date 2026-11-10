/* oxlint-disable new-cap -- NestJS decorators use PascalCase */
import { Injectable } from '@nestjs/common';
import { trace, context, SpanKind, SpanStatusCode, propagation } from '@opentelemetry/api';
import type { Tracer } from '@opentelemetry/api';

const tracer = trace.getTracer('tau-api');

/**
 * Inject W3C trace context into a carrier object for cross-service propagation.
 * Standalone function using the module-level OTEL context — no service injection needed.
 */
export const injectTraceContext = (): Record<string, string> => {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return carrier;
};

/** Token counts a model call reports, in OpenTelemetry GenAI terms. */
export type GenAiUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens?: number;
  readonly cacheWriteTokens?: number;
  readonly reasoningTokens?: number;
};

/** An open `gen_ai` chat span, ended once with the call's outcome. */
export type GenAiChatSpan = {
  readonly succeed: (usage: GenAiUsage) => void;
  readonly fail: (errorType: string) => void;
};

/**
 * Start a client span for one model call with the OpenTelemetry GenAI
 * attributes: operation, provider, requested model and output ceiling, then
 * usage or `error.type` when it ends.
 *
 * Content-free by construction: it takes no prompt or completion, so neither
 * can reach a span.
 *
 * @param request - The provider's `gen_ai.provider.name`, the provider's model id and the output ceiling.
 * @param spanTracer - The tracer, injectable for tests.
 * @returns The span's two endings; the first call wins.
 */
export const startGenAiChatSpan = (
  request: { readonly providerName: string; readonly requestModel: string; readonly maxTokens?: number },
  spanTracer: Tracer = tracer,
): GenAiChatSpan => {
  const span = spanTracer.startSpan(`chat ${request.requestModel}`, {
    kind: SpanKind.CLIENT,
    attributes: {
      'gen_ai.operation.name': 'chat',
      'gen_ai.provider.name': request.providerName,
      'gen_ai.request.model': request.requestModel,
      ...(request.maxTokens === undefined ? {} : { 'gen_ai.request.max_tokens': request.maxTokens }),
    },
  });
  let ended = false;
  return {
    succeed: (usage) => {
      if (ended) {
        return;
      }
      ended = true;
      span.setAttributes({
        'gen_ai.usage.input_tokens': usage.inputTokens,
        'gen_ai.usage.output_tokens': usage.outputTokens,
        ...(usage.cacheReadTokens === undefined
          ? {}
          : { 'gen_ai.usage.cache_read_input_tokens': usage.cacheReadTokens }),
        ...(usage.cacheWriteTokens === undefined
          ? {}
          : { 'gen_ai.usage.cache_creation_input_tokens': usage.cacheWriteTokens }),
        ...(usage.reasoningTokens === undefined ? {} : { 'gen_ai.usage.reasoning_tokens': usage.reasoningTokens }),
      });
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
    },
    fail: (errorType) => {
      if (ended) {
        return;
      }
      ended = true;
      span.setAttribute('error.type', errorType);
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.end();
    },
  };
};

@Injectable()
export class TracerService {
  public injectTraceContext(): Record<string, string> {
    return injectTraceContext();
  }
}

/**
 * Method decorator that wraps the decorated method in an OTEL span.
 * The span name defaults to `ClassName.methodName`.
 *
 * Preserves the sync/async nature of the original method:
 * - Sync methods remain sync (return value, not Promise)
 * - Async methods remain async (return Promise)
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- decorator name follows convention of PascalCase
export function Span(name?: string): MethodDecorator {
  // oxlint-disable-next-line typescript-eslint/no-restricted-types, typescript-eslint/no-wrapper-object-types -- MethodDecorator signature requires Object type
  return (_target: Object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value as (...args: unknown[]) => unknown;
    const spanName = name ?? `${_target.constructor.name}.${String(propertyKey)}`;

    // oxlint-disable-next-line typescript-eslint/no-wrapper-object-types -- MethodDecorator signature requires Object
    descriptor.value = function (this: unknown, ...args: unknown[]) {
      return tracer.startActiveSpan(spanName, (span) => {
        try {
          const result = originalMethod.apply(this, args);

          if (result instanceof Promise) {
            return (
              result
                // oxlint-disable-next-line eslint-plugin-promise/prefer-await-to-then -- must use .then/.finally to preserve Promise chain without wrapping in async
                .then(
                  (value) => {
                    span.setStatus({ code: SpanStatusCode.OK });
                    // oxlint-disable-next-line typescript-eslint/no-unsafe-return -- generic Promise chain preserves original type
                    return value;
                  },
                  (error: unknown) => {
                    span.setStatus({ code: SpanStatusCode.ERROR });
                    if (error instanceof Error) {
                      span.recordException(error);
                    }
                    throw error;
                  },
                )
                // oxlint-disable-next-line eslint-plugin-promise/prefer-await-to-then -- must use .finally to preserve Promise chain without wrapping in async
                .finally(() => {
                  span.end();
                })
            );
          }

          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
          return result;
        } catch (error) {
          span.setStatus({ code: SpanStatusCode.ERROR });
          if (error instanceof Error) {
            span.recordException(error);
          }
          span.end();
          throw error;
        }
      });
    };

    return descriptor;
  };
}
