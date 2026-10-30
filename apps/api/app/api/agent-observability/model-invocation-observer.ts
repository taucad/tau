import { LlmGatewayError } from '#api/llm/llm-gateway.error.js';
import type {
  ModelInvocationIntent,
  ModelInvocationResult,
  ModelInvocationService,
} from '#api/llm/model-invocation.types.js';
import { resolveGatewayModelRoute } from '#api/providers/provider-gateway.js';
import type { ObservedAttempt } from '#api/agent-observability/model-invocation-evidence.js';
import type { ModelInvocationEvidenceRecorder } from '#api/agent-observability/model-invocation-recorder.service.js';
import { ProviderStreamFacts } from '#api/agent-observability/provider-stream-facts.js';

/** Refusals that come from a supplier the attempt reached, as opposed to Tau's own admission. */
const supplierRefusals = new Set([
  'RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_ACCOUNT_EXHAUSTED',
  'UPSTREAM_REJECTED',
]);

/** The stable code of a gateway refusal, as its envelope carries it. */
const gatewayErrorType = (error: unknown): string | undefined => {
  if (!(error instanceof LlmGatewayError)) {
    return undefined;
  }
  const body: unknown = error.getResponse();
  const inner: unknown = typeof body === 'object' && body !== null ? Reflect.get(body, 'error') : undefined;
  const type: unknown = typeof inner === 'object' && inner !== null ? Reflect.get(inner, 'type') : undefined;
  return typeof type === 'string' ? type : undefined;
};

const requestedModel = (body: unknown): string | undefined => {
  const model: unknown = typeof body === 'object' && body !== null ? Reflect.get(body, 'model') : undefined;
  return typeof model === 'string' ? model : undefined;
};

const supplierOf = (intent: ModelInvocationIntent, model: string | undefined): string | undefined => {
  if (intent.surface !== 'gateway' || model === undefined) {
    return undefined;
  }
  try {
    return resolveGatewayModelRoute(model, intent.providerWire).providerId;
  } catch {
    return undefined;
  }
};

/**
 * Wraps the selected funded or direct invocation owner and observes each
 * attempt it relays. The response's bytes, status, headers, cancellation and
 * completion are the inner owner's: bytes are forwarded before they are
 * read, nothing is teed or buffered, and the observer never awaits anything
 * the request path waits on. Replays of a held operation (`pending`,
 * `terminal`) are not new supplier attempts and are not recorded.
 */
export class ObservedModelInvocationService implements ModelInvocationService {
  private readonly admits: boolean;
  private readonly clock: () => number;

  public constructor(
    private readonly inner: ModelInvocationService,
    private readonly recorder: ModelInvocationEvidenceRecorder,
    options: Readonly<{
      /**
       * Whether the inner owner admits a funded operation before it calls a
       * supplier. When it does, a refusal before admission is Tau's own and
       * is not a supplier attempt.
       */
      admits?: boolean;
      clock?: () => number;
    }> = {},
  ) {
    this.admits = options.admits ?? false;
    this.clock = options.clock ?? performance.now.bind(performance);
  }

  public async invoke(intent: ModelInvocationIntent): Promise<ModelInvocationResult> {
    const project = intent.projectHint;
    if (!this.recorder.capable || project === undefined) {
      return this.inner.invoke(intent);
    }
    const startedAt = Date.now();
    const started = this.clock();
    const model = requestedModel(intent.body);
    let operation: string | undefined;
    const { onAdmitted } = intent;
    const attempt = (ended: ObservedAttempt['ended'], stream: ObservedAttempt['stream']): ObservedAttempt => ({
      principal: intent.authUserId,
      project,
      attemptKey: intent.attempt.key,
      chat: intent.chatHint,
      surface: intent.surface,
      wire: intent.providerWire,
      requestedModel: model,
      provider: supplierOf(intent, model),
      operation,
      startedAt,
      duration: this.clock() - started,
      stream,
      ended,
    });

    let result: ModelInvocationResult;
    try {
      result = await this.inner.invoke({
        ...intent,
        onAdmitted: (operationId) => {
          operation = operationId;
          onAdmitted?.(operationId);
        },
      });
    } catch (error) {
      if (intent.signal.aborted) {
        this.recorder.record(attempt('aborted', undefined));
      } else if ((!this.admits || operation !== undefined) && supplierRefusals.has(gatewayErrorType(error) ?? '')) {
        this.recorder.record(attempt('failed', undefined));
      }
      throw error;
    }
    if (result.state !== 'streaming' || result.response.body === null) {
      return result;
    }
    operation ??= result.operationId;

    const facts = new ProviderStreamFacts(intent.providerWire, started, this.clock);
    let settled = false;
    const settle = (ended: ObservedAttempt['ended']): void => {
      if (!settled) {
        settled = true;
        this.recorder.record(attempt(ended, facts.summary()));
      }
    };
    /* `cancel` is in the Streams standard and Node, not yet in TypeScript's lib. */
    const transformer: Transformer<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>> & { cancel: () => void } = {
      transform(chunk, controller) {
        controller.enqueue(chunk);
        facts.accept(chunk);
      },
      flush() {
        settle('completed');
      },
      cancel() {
        settle('aborted');
      },
    };
    const observed = result.response.body.pipeThrough(new TransformStream(transformer));
    this.recorder.track(this.failureOf(result.completion, intent.signal, settle));
    return {
      ...result,
      response: new Response(observed, {
        status: result.response.status,
        statusText: result.response.statusText,
        headers: result.response.headers,
      }),
    };
  }

  /** Settle the attempt if the owner's completion rejects; a resolved completion leaves it to the stream. */
  private async failureOf(
    completion: Promise<void>,
    signal: AbortSignal,
    settle: (ended: ObservedAttempt['ended']) => void,
  ): Promise<void> {
    try {
      await completion;
    } catch {
      settle(signal.aborted ? 'aborted' : 'failed');
    }
  }
}
