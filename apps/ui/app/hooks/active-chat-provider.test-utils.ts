/**
 * Test-only mock builder for {@link ChatComposerContextValue}. Centralises
 * the post-tightening invariant that `kernel.kernel` is a real
 * {@link KernelEntry} resolved via {@link resolveKernel} — no test should
 * ever pass `kernel: undefined`. Every chat-adjacent test that mocks
 * `useChatComposer` MUST use this helper so a future kernel-id rename
 * or `ChatComposerContextValue` change surfaces in one place.
 *
 * Usage:
 *
 *   vi.mock('#hooks/active-chat-provider.js', () => ({
 *     useChatComposer: () => buildComposerMock({ kernelId: 'replicad' }),
 *   }));
 */
import { vi } from 'vitest';
import type { KernelId } from '@taucad/types/constants';
import { resolveKernel } from '@taucad/types/constants';
import type { ChatComposerContextValue } from '#hooks/active-chat-provider.js';

export type ComposerMockOverrides = {
  readonly modelId?: string;
  readonly model?: ChatComposerContextValue['model']['model'];
  readonly setActiveModel?: (modelId: string) => void;
  readonly kernelId?: KernelId;
  readonly setActiveKernel?: (kernelId: KernelId) => void;
  readonly status?: ChatComposerContextValue['status'];
  readonly stop?: () => void;
  readonly contextUsage?: ChatComposerContextValue['contextUsage'];
  readonly session?: ChatComposerContextValue['session'];
  readonly draftActorRef?: ChatComposerContextValue['draftActorRef'];
};

/**
 * Build a {@link ChatComposerContextValue} suitable for `useChatComposer`
 * mocks. Defaults populate every required field with a working shape; the
 * `kernel` field always carries a real `KernelEntry` resolved from
 * `kernelId` (defaulting to `'openscad'`) so consumers can read
 * `kernel.name` / `kernel.id` without an optional-chain.
 *
 * The return value is `unknown`-cast to `ChatComposerContextValue` because
 * `draftActorRef` and `model.model` are XState actor / resolved-model
 * shapes that are intentionally opaque to most test surfaces. Tests that
 * need the real shape should override via `draftActorRef` / `model` props.
 */
export function buildComposerMock(overrides: ComposerMockOverrides = {}): ChatComposerContextValue {
  const kernelId: KernelId = overrides.kernelId ?? 'openscad';
  const modelId = overrides.modelId ?? 'openai-gpt-5.5';
  // The real `ResolvedModel` carries `family` + `provider` shape literals
  // that test mocks don't need; the `unknown` hop satisfies
  // `consistent-type-assertions` (rule disallows direct
  // object-literal-to-T casts) while keeping the helper terse.
  const defaultModel = {
    id: modelId,
    name: modelId,
    isResolved: true,
  } as unknown as ChatComposerContextValue['model']['model'];

  return {
    draftActorRef: overrides.draftActorRef ?? { send: vi.fn() },
    model: {
      modelId,
      model: overrides.model ?? defaultModel,
      setActiveModel: overrides.setActiveModel ?? vi.fn(),
    },
    kernel: {
      kernelId,
      kernel: resolveKernel(kernelId),
      setActiveKernel: overrides.setActiveKernel ?? vi.fn(),
    },
    status: overrides.status ?? 'ready',
    stop: overrides.stop ?? ((): void => undefined),
    contextUsage: overrides.contextUsage,
    session: overrides.session,
  } as unknown as ChatComposerContextValue;
}
