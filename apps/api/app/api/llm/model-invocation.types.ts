import type { ModelMessage } from 'ai';
import type { FinancialActivityKind } from '@taucad/billing';

export const modelInvocationServiceKey = Symbol('modelInvocationService');

export type ModelInvocationSurface = 'gateway' | 'project_name' | 'commit_name' | 'code_completion';
export type ModelProviderWire = 'anthropic' | 'openai-completions' | 'openai-responses';

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
