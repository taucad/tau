import type { ModelMessage } from 'ai';
import type { FinancialActivityKind } from '@taucad/billing';
import type { turnGaps, turnSteps } from '@taucad/telemetry';

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
