import type { AnthropicOptions } from '@earendil-works/pi-ai';
import type { ModelStreamRequest } from '#waist/ports.js';

/**
 * The parent span one model invocation's native Pi spans hang from.
 *
 * Derived from the options pi-ai already accepts rather than imported from
 * `@earendil-works/pi-telemetry`, so the host gains no dependency and the seam
 * cannot drift from what the provider APIs will take. Every provider family
 * shares this field through `ProviderRequestOptions`.
 *
 * @public
 */
export type ModelTelemetryParent = NonNullable<AnthropicOptions['telemetry']>;

/**
 * What a composition is told about an invocation when it is asked for a parent
 * span. The request's own identity only: no messages, no system prompt, no
 * documents and no tools, so a seam cannot read request content it was not
 * given and a future field cannot leak into one by default.
 *
 * @public
 */
export type ModelTelemetrySubject = Readonly<{
  /** Durable caller identity for this one gateway invocation. */
  attemptId: string;
  /** The chat this invocation belongs to, when the caller has one to give. */
  chatId?: string | undefined;
  /** Why this distinct provider invocation exists. */
  invocationPurpose: ModelStreamRequest['invocationPurpose'];
  /** Gateway or local-provider model identity. */
  modelId: string;
  /** Catalog-resolved provider identity, absent when the caller named none. */
  providerKind?: ModelStreamRequest['providerKind'];
}>;

/**
 * Host composition's seam for native model telemetry.
 *
 * The host does not create spans, choose a destination or know a vendor. A
 * composition that has an enabled, permitted adapter answers with the span the
 * invocation belongs under; every other composition answers `undefined` and no
 * telemetry is produced. Absent entirely is the default in every build.
 *
 * @public
 */
export type ModelTelemetrySeam = Readonly<{
  /**
   * The parent span for this invocation, or `undefined` for no telemetry.
   *
   * Called once per invocation, before the provider request is built. It must
   * not block: it is on the path of a model call, and the host neither awaits
   * it nor retries it.
   */
  parentFor(subject: ModelTelemetrySubject): ModelTelemetryParent | undefined;
}>;

/**
 * Ask a composition for an invocation's parent span, and treat any failure as
 * no telemetry.
 *
 * Telemetry cannot change execution (I1). A seam that throws, or that answers
 * something other than a span, loses its telemetry for this invocation and the
 * model call proceeds exactly as it would with no seam configured. Nothing is
 * logged here: a seam fault is the composition's to observe, and a per-request
 * log on the model path would be its own hot-path cost.
 *
 * @param seam - The composition's seam, absent in a build with no telemetry.
 * @param subject - The invocation's identity.
 * @returns The parent span, or `undefined` when there is none to use.
 */
export const modelTelemetryParent = (
  seam: ModelTelemetrySeam | undefined,
  subject: ModelTelemetrySubject,
): ModelTelemetryParent | undefined => {
  if (seam === undefined) {
    return undefined;
  }
  try {
    /* A seam is ordinary composition code, not necessarily typed code: an
     * answer that is not a span would reach pi as a parent it cannot use, so
     * it is refused here rather than becoming a provider-side failure. */
    const parent: unknown = seam.parentFor(subject);
    return typeof parent === 'object' && parent !== null ? (parent as ModelTelemetryParent) : undefined;
  } catch {
    return undefined;
  }
};

/**
 * The subject for one model stream request: its identity, and nothing else it
 * carries.
 *
 * @param request - The invocation being prepared.
 * @returns The identity a seam is asked about.
 */
export const modelTelemetrySubject = (request: ModelStreamRequest): ModelTelemetrySubject => ({
  attemptId: request.attemptId,
  ...(request.chatId === undefined ? {} : { chatId: request.chatId }),
  invocationPurpose: request.invocationPurpose,
  modelId: request.modelId,
  ...(request.providerKind === undefined ? {} : { providerKind: request.providerKind }),
});
