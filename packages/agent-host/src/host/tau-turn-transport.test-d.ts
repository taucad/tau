import { describe, expectTypeOf, it } from 'vitest';
import type {
  AgentRunOutcome,
  CreateTauAgentHostOptions,
  TauTurnTransport,
  TauTurnTransportInput,
} from '@taucad/agent-host';
import type { AgentLauncherOptions } from '@taucad/agent-host/launcher';

describe('published Tau execution transport surface', () => {
  it('keeps protocol transport optional on both portable composition owners', () => {
    expectTypeOf<CreateTauAgentHostOptions['tauTurnTransport']>().toEqualTypeOf<TauTurnTransport | undefined>();
    expectTypeOf<AgentLauncherOptions['tauTurnTransport']>().toEqualTypeOf<TauTurnTransport | undefined>();
    expectTypeOf<TauTurnTransport['run']>().toEqualTypeOf<(input: TauTurnTransportInput) => Promise<AgentRunOutcome>>();
  });
});
