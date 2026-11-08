/* oxlint-disable new-cap -- NestJS decorators use PascalCase */
import { Injectable } from '@nestjs/common';
import { trace, context, SpanStatusCode, propagation } from '@opentelemetry/api';

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
