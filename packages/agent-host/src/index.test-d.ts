/* CL-A26 (RV8-F2): the package-root ledger exports, as the approved chat-log guide names them. */
import { describe, expectTypeOf, it } from 'vitest';
import { emptyChatLedger, foldChatLedger, foldReadAnswer, mergeLogSegments } from '#index.js';
import type * as AgentHost from '#index.js';
import type { ChatLedger, MergeLogSegmentsOptions, ReadFold, RowKey } from '#index.js';
import type { CommandAnswer, HostCommand } from '#wire/commands.schema.js';

describe('the chat-ledger exports', () => {
  it('should fold rows as read, from a frozen empty value', () => {
    expectTypeOf(emptyChatLedger).toEqualTypeOf<ChatLedger>();
    expectTypeOf(foldChatLedger).toEqualTypeOf<(ledger: ChatLedger, rows: readonly unknown[]) => ChatLedger>();
  });

  it('should check a read answer against the position before folding it', () => {
    expectTypeOf(foldReadAnswer).parameter(0).toEqualTypeOf<ChatLedger>();
    expectTypeOf(foldReadAnswer).returns.toEqualTypeOf<ReadFold>();
    expectTypeOf<ReadFold['kind']>().toEqualTypeOf<'folded' | 'stale' | 'reset' | 'refused'>();
    expectTypeOf<Extract<ReadFold, { kind: 'folded' }>['semanticRowIndices']>().toEqualTypeOf<readonly number[]>();
  });

  it('should take merge options with a conflict report', () => {
    expectTypeOf(mergeLogSegments).parameter(1).toEqualTypeOf<MergeLogSegmentsOptions | undefined>();
  });

  it('should name one row key, the one merge conflicts report', () => {
    expectTypeOf<Parameters<NonNullable<MergeLogSegmentsOptions['onConflict']>>[0]['key']>().toEqualTypeOf<RowKey>();
  });

  // CL-S0: the guide's removals stay removed.
  it('should not export the retired ledger names', () => {
    expectTypeOf<'chatLedgerOf' extends keyof typeof AgentHost ? true : false>().toEqualTypeOf<false>();
    expectTypeOf<'alignLogBatch' extends keyof typeof AgentHost ? true : false>().toEqualTypeOf<false>();
  });
});

/* RA-S3 (RV8-F2): the run actor's surface, as the approved run-actor guide names it (option single-input). */
describe('the run actor exports', () => {
  it('should decide one keyed command through command(input), answered and never thrown', () => {
    expectTypeOf<AgentHost.TauAgentHost['command']>().toEqualTypeOf<(input: HostCommand) => Promise<CommandAnswer>>();
  });

  // Leak guard: only the registry creates run actors (RA-R16).
  it('should not export the run actor or its machine', () => {
    expectTypeOf<'createChatRunActor' extends keyof typeof AgentHost ? true : false>().toEqualTypeOf<false>();
    expectTypeOf<'chatRunMachine' extends keyof typeof AgentHost ? true : false>().toEqualTypeOf<false>();
    expectTypeOf<'createChatRunRegistry' extends keyof typeof AgentHost ? true : false>().toEqualTypeOf<false>();
  });

  it('should require a funding facet on every model transport', () => {
    expectTypeOf<AgentHost.ModelTransport['funding']>().toEqualTypeOf<AgentHost.InvocationFunding>();
    // @ts-expect-error the gateway's operation protocol is internal: the funding facet replaced it (guide: trim).
    expectTypeOf<AgentHost.GatewayFundedOperationProtocol>().not.toBeNever();
  });
});
