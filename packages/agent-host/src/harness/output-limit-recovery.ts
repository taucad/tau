import type { UserProviderMessage } from '#log/event-types.js';

/**
 * The same continuation instruction for automatic recovery and a person's Resume.
 *
 * @param input - Durable identity and the current no-progress count.
 * @returns An internal user message, hidden from the conversation UI.
 */
export const createOutputLimitRecoveryMessage = (input: {
  readonly id: string;
  readonly noProgress: number;
}): UserProviderMessage => ({
  id: input.id,
  role: 'user',
  content:
    'Your last response reached its output limit before completion. Continue the unfinished task from the saved state. Review the recorded tool results; do not repeat successful calls. Verify uncertain side effects before retrying. Use smaller steps and concise responses.',
  metadata: {
    tauInternal: {
      kind: 'output-limit-recovery',
      noProgress: input.noProgress,
      pruning: 'preserve-until-compaction',
    },
  },
});
