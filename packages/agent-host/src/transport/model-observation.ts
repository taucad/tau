import { AI_TELEMETRY_SCHEMA } from '@earendil-works/pi-ai';
import type { Api, AssistantMessage, AssistantMessageEvent, LazyStreamObserver, Model } from '@earendil-works/pi-ai';
import {
  createTypedMetrics,
  createTypedSpanStarter,
  NOOP_TELEMETRY_CONTEXT,
  NOOP_TELEMETRY_METRICS,
} from '@earendil-works/pi-telemetry';
import type { TelemetryMetrics, TelemetrySpan } from '@earendil-works/pi-telemetry';
import type { ModelTelemetryParent } from '#transport/model-telemetry.js';

/*
 * Why this exists rather than a call into pi.
 *
 * `pi-ai` observes a request in `observeModelRequest`, which only its own
 * `Models` collection calls, and which its package exports do not expose. Tau
 * streams through the per-API codecs directly (`anthropicMessagesApi()` and
 * the two OpenAI ones), because the gateway owns authentication, framing,
 * payload transformation, refusal identity and retry — every one of which
 * `Models.applyAuth` would take a hand in. Routing the funded model path
 * through `Models` to obtain telemetry would put pi's auth resolution between
 * Tau and its own gateway, which is a change to the billing path made for an
 * observability reason.
 *
 * So Tau observes its own stream instead, writing exactly the spans, events
 * and metrics pi publishes in `AI_TELEMETRY_SCHEMA`. That schema is imported
 * rather than copied, and `model-telemetry.test.ts` asserts every
 * name and attribute written here is declared in it, so an upstream change
 * fails this build rather than drifting into a differently-shaped span.
 */

/** Everything the observation needs about the request it is watching. */
export type ModelObservationSubject = Readonly<{
  /** The model as Tau asked for it, before any provider-side substitution. */
  model: Model<Api>;
  /** Scalar requested reasoning level, when the catalog froze one. */
  reasoning?: string | undefined;
}>;

/** An observer for one request, with the span's own settlement held rather than floated. */
export type ModelRequestObservation = LazyStreamObserver & {
  /** Resolves once the span has ended. Never rejects, and never awaited on the model path. */
  readonly spanEnded: Promise<void>;
};

/** The two low-cardinality labels every pi.ai instrument carries. */
type ModelLabels = { provider: string; model: string };

const spanAttributesOf = (subject: ModelObservationSubject): ModelLabels => ({
  provider: subject.model.provider,
  model: subject.model.id,
});

/*
 * Instruments are per-adapter, not per-request: a counter recreated for every
 * model call would be a new instrument on every turn. Weak, so an adapter that
 * is stopped and dropped takes its instruments with it.
 */
const instrumentCache = new WeakMap<TelemetryMetrics, ReturnType<typeof createInstruments>>();

const createInstruments = (metrics: TelemetryMetrics) => {
  const typed = createTypedMetrics(metrics, [AI_TELEMETRY_SCHEMA]);
  return {
    requestDuration: typed.histogram('pi.ai.request.duration'),
    firstChunkDuration: typed.histogram('pi.ai.first_chunk.duration'),
    tokens: typed.counter('pi.ai.tokens'),
    cost: typed.counter('pi.ai.cost'),
  };
};

const instrumentsFor = (metrics: TelemetryMetrics): ReturnType<typeof createInstruments> => {
  const cached = instrumentCache.get(metrics);
  if (cached) {
    return cached;
  }
  const created = createInstruments(metrics);
  instrumentCache.set(metrics, created);
  return created;
};

/**
 * Observe one model request, writing pi's native `pi.ai.request` span.
 *
 * The returned observer only reads the stream Tau already forwards; it never
 * holds, delays or alters an event, and the span is ended from `onResult`
 * rather than awaited anywhere on the model path. With no parent span the
 * whole thing degrades to pi's no-op context and records nothing.
 *
 * @param parent - The composition's parent span, absent when telemetry is off.
 * @param subject - The request being observed.
 * @returns The observer `observeModelStream` reads the stream through, holding the span's settlement.
 */
export const observeModelRequest = (
  parent: ModelTelemetryParent | undefined,
  subject: ModelObservationSubject,
): ModelRequestObservation => {
  const started = performance.now();
  const attributes = spanAttributesOf(subject);
  const { requestDuration, firstChunkDuration, tokens, cost } = instrumentsFor(
    parent?.metrics ?? NOOP_TELEMETRY_METRICS,
  );

  let span: TelemetrySpan | undefined;
  let finish: () => void = () => undefined;
  let first = true;
  const toolChars = new Map<number, number>();
  /* The span stays open until the result arrives: `startSpan` ends it when the
   * callback settles, and this promise is what the callback waits on. */
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });

  const start = createTypedSpanStarter(parent ?? NOOP_TELEMETRY_CONTEXT, [AI_TELEMETRY_SCHEMA]);
  const open = async (active: TelemetrySpan): Promise<void> => {
    span = active;
    await finished;
  };
  /* Two calls rather than a conditional spread: the typed starter checks the
   * attribute set exactly, and a spread of an optional widens it away. */
  /* Never awaited, and a span that rejects is the composition's to observe:
   * an unhandled rejection here would be telemetry failing the process. */
  const { reasoning } = subject;
  const run = async (): Promise<void> => {
    try {
      await (reasoning === undefined
        ? start('pi.ai.request', { ...attributes, api: subject.model.api }, open)
        : start('pi.ai.request', { ...attributes, api: subject.model.api, reasoning }, open));
    } catch {
      /* The span is lost; the request is not. */
    }
  };
  /* Held, never awaited on the model path: it resolves once the span has ended. */
  const spanEnded = run();

  /* Counts, timings and identifiers only. A provider's error text can quote
   * the request, so it is not carried; the stop reason says what happened. */
  const record = (message: AssistantMessage | undefined): void => {
    if (message && span !== undefined) {
      span.setAttributes({
        stop: message.stopReason,
        'usage.input': message.usage.input,
        'usage.output': message.usage.output,
        'usage.cache_read': message.usage.cacheRead,
        'usage.cache_write': message.usage.cacheWrite,
        'cost.total': message.usage.cost.total,
        'response.id': message.responseId,
      });
      if (message.stopReason === 'error') {
        span.setStatus({
          status: 'error',
          error: { name: 'provider_error', message: 'provider_error' },
        });
      }
      requestDuration.record(performance.now() - started, { ...attributes, stop: message.stopReason }, span);
      tokens.add(message.usage.input, { ...attributes, kind: 'input' });
      tokens.add(message.usage.output, { ...attributes, kind: 'output' });
      tokens.add(message.usage.cacheRead, { ...attributes, kind: 'cache_read' });
      tokens.add(message.usage.cacheWrite, { ...attributes, kind: 'cache_write' });
      cost.add(message.usage.cost.total, attributes);
    }
  };

  return {
    onEvent(event: AssistantMessageEvent) {
      if (span === undefined) {
        return;
      }
      if (first) {
        first = false;
        span.addEvent('pi.ai.first_chunk');
        firstChunkDuration.record(performance.now() - started, attributes, span);
      }
      switch (event.type) {
        case 'toolcall_delta': {
          toolChars.set(event.contentIndex, (toolChars.get(event.contentIndex) ?? 0) + event.delta.length);
          break;
        }
        case 'text_end':
        case 'thinking_end': {
          /* Lengths, never content. */
          span.addEvent('pi.ai.block', {
            type: event.type === 'text_end' ? 'text' : 'thinking',
            index: event.contentIndex,
            chars: event.content.length,
          });
          break;
        }
        case 'toolcall_end': {
          const chars = toolChars.get(event.contentIndex) ?? 0;
          toolChars.delete(event.contentIndex);
          span.addEvent('pi.ai.block', {
            type: 'tool_call',
            index: event.contentIndex,
            chars,
            tool: event.toolCall.name,
          });
          break;
        }
        default: {
          break;
        }
      }
    },
    onResult(message: AssistantMessage | undefined) {
      try {
        record(message);
      } finally {
        finish();
      }
    },
    spanEnded,
  };
};

/**
 * Forward a provider stream unchanged while an observer reads it.
 *
 * This is the whole of the observation's reach into the model path. Each event
 * is yielded before the observer sees it, so the observer cannot hold, reorder
 * or rewrite anything a caller receives. An observer that throws is dropped
 * for the rest of the stream and the stream continues exactly as it would
 * have with none (I1); pi's own `lazyStream` would instead turn that throw
 * into a terminal error event, which is why it is not used here. A consumer
 * that stops early, or a stream that throws, still settles the observation
 * once with no result, so no span is left open.
 *
 * @param events - The codec stream Tau already consumes.
 * @param observer - The observation, absent when telemetry is off.
 * @returns The same events, in the same order.
 */
export const observeModelStream = async function* (
  events: AsyncIterable<AssistantMessageEvent>,
  observer: LazyStreamObserver | undefined,
): AsyncGenerator<AssistantMessageEvent> {
  let active = observer;
  let result: AssistantMessage | undefined;
  let settled = false;
  /* True the first time only: the observation is settled exactly once. */
  const settleOnce = (): boolean => {
    if (settled) {
      return false;
    }
    settled = true;
    return true;
  };
  const guard = (call: (target: LazyStreamObserver) => void): void => {
    if (active === undefined) {
      return;
    }
    try {
      call(active);
    } catch {
      /* Drop the observer, but still let it close its span: `onResult` with
       * no message only settles, and a second fault there is swallowed too. */
      const dropped = active;
      active = undefined;
      if (settleOnce()) {
        try {
          dropped.onResult?.(undefined);
        } catch {
          /* Nothing further to settle. */
        }
      }
    }
  };
  try {
    for await (const event of events) {
      /* Taken before the yield: Tau's consumer throws its coded gateway error
       * at a terminal `error` event, so control never comes back here and the
       * result is only seen again in `finally`. A plain assignment, not
       * observer code, so it cannot affect the event. */
      if (event.type === 'done') {
        result = event.message;
      } else if (event.type === 'error') {
        result = event.error;
      }
      yield event;
      guard((target) => target.onEvent?.(event));
    }
  } finally {
    if (settleOnce()) {
      guard((target) => target.onResult?.(result));
    }
  }
};

/**
 * Build the observation for one request, or none.
 *
 * Construction touches the composition's span; a span that fails there costs
 * this request its telemetry and nothing else.
 *
 * @param parent - The composition's parent span, absent when telemetry is off.
 * @param subject - The request being observed.
 * @returns The observer, or `undefined` when there is nothing to observe with.
 */
export const modelRequestObserver = (
  parent: ModelTelemetryParent | undefined,
  subject: ModelObservationSubject,
): LazyStreamObserver | undefined => {
  if (parent === undefined) {
    return undefined;
  }
  try {
    return observeModelRequest(parent, subject);
  } catch {
    return undefined;
  }
};
