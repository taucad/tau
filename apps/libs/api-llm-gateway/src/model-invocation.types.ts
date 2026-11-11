import type { ModelMessage } from 'ai';
import type { FinancialActivityKind } from '@taucad/billing';
import type { agentPlacements, kernelIds, turnGaps, turnSteps } from '@taucad/telemetry';

export const modelInvocationServiceKey = Symbol('modelInvocationService');

export type ModelInvocationSurface = 'gateway' | 'project_name' | 'commit_name';
export type ModelProviderWire = 'anthropic' | 'openai-completions' | 'openai-responses';

/**
 * What the agent host asserted about a gateway step's place in its chat: telemetry labels only,
 * never read by admission, pricing or the request digest.
 */
export type TurnTelemetry = {
  readonly step: (typeof turnSteps)[number];
  readonly gap: (typeof turnGaps)[number];
};

/**
 * What the agent host asserted about the host that made a gateway step (LW17): observability labels only, carried into
 * the API's provider fact and never read by admission, pricing, routing or the request digest. Each label is present
 * only when its header was sent, and is `unknown` when the value was outside its vocabulary.
 */
export type HostLabels = {
  readonly host?: (typeof agentPlacements)[number] | 'unknown';
  /** The host build's release label: a 7 to 40 hex commit or a semver. */
  readonly build?: string;
  readonly kernel?: (typeof kernelIds)[number] | 'unknown';
  /** A model route id of this API's catalog. */
  readonly model?: string;
};

export type ModelInvocationIntent = {
  readonly authUserId: string;
  readonly surface: ModelInvocationSurface;
  readonly attempt: { readonly version: 1; readonly key: string };
  readonly providerWire: ModelProviderWire;
  readonly body: unknown;
  readonly priceHeaders: Readonly<Record<string, string>>;
  readonly activity: FinancialActivityKind;
  readonly projectHint?: string | undefined;
  readonly chatHint?: string | undefined;
  /** Turn-step telemetry labels, present only when the caller asserted at least one. */
  readonly turn?: TurnTelemetry | undefined;
  /** Host labels, present only when the caller sent at least one. */
  readonly hostLabels?: HostLabels | undefined;
  readonly signal: AbortSignal;
  /** Server-owned prompt used by direct self-host execution for API helper surfaces. */
  readonly directPrompt?: {
    readonly system: string;
    readonly messages: ModelMessage[];
    readonly maximumOutputTokens: number;
  };
  /** Cloud mode binds a durable funded operation; self-host mode leaves it unused. */
  readonly onAdmitted?: ((operationId: string) => void) | undefined;
};

export type ModelInvocationResult =
  | {
      readonly state: 'streaming';
      readonly operationId?: string;
      readonly response: Response;
      readonly completion: Promise<void>;
    }
  | { readonly state: 'pending' | 'terminal'; readonly operationId: string };

export type ModelInvocationService = {
  invoke(intent: ModelInvocationIntent): Promise<ModelInvocationResult>;
};
