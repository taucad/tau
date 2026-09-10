import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '#database/schema.js';
import { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import { BillableModelInvocationService } from '#api/billing/billable-model-invocation.service.js';
import {
  CodeOwnedBillableModelQualificationResolver,
  registerBillableModelMeterContracts,
} from '#api/billing/billable-model-qualification.js';
import { createBillableModelProviderAdapters } from '#api/billing/billable-model-provider.js';
import type { TerminalEvidence } from '#api/billing/credit-ledger.types.js';

type Command = {
  providerUrl: string;
  authUserId: string;
  attemptKey: string;
  digestSecret: string;
  exactCount?: boolean;
};
const send = (state: string, detail?: unknown): void => {
  process.send?.({ state, detail });
};
const continueAfter = async (state: string): Promise<void> => {
  send(state);
  await new Promise<void>((resolve) => {
    process.once('message', (value) => {
      if (value !== 'continue') {
        throw new Error(`Invalid continuation for ${state}`);
      }
      resolve();
    });
  });
};
const command = await new Promise<Command>((resolve) => {
  process.once('message', (value: unknown) => {
    if (
      value === null ||
      typeof value !== 'object' ||
      !('providerUrl' in value) ||
      typeof value.providerUrl !== 'string' ||
      !value.providerUrl.startsWith('http://127.0.0.1:') ||
      !('authUserId' in value) ||
      typeof value.authUserId !== 'string' ||
      !('attemptKey' in value) ||
      typeof value.attemptKey !== 'string' ||
      !('digestSecret' in value) ||
      typeof value.digestSecret !== 'string'
    ) {
      throw new Error('Invalid billable invocation child command');
    }
    resolve({
      providerUrl: value.providerUrl,
      authUserId: value.authUserId,
      attemptKey: value.attemptKey,
      digestSecret: value.digestSecret,
      exactCount: 'exactCount' in value && value.exactCount === true,
    });
  });
});
const databaseUrl = process.env['BILLING_TEST_DATABASE_URL'];
if (!databaseUrl) {
  throw new Error('BILLING_TEST_DATABASE_URL is required');
}
const client = postgres(databaseUrl, { max: 1 });
const database = drizzle(client, { schema });
class CheckpointLedger extends CreditLedgerService {
  public override async markDispatchIntent(operationId: string, generation: bigint): Promise<boolean> {
    const marked = await super.markDispatchIntent(operationId, generation);
    if (marked) {
      await continueAfter('intent_recorded');
    }
    return marked;
  }
  public override async recordInvocationEvidence(input: {
    operationId: string;
    accountId: string;
    requestDigest: string;
    evidence: TerminalEvidence;
  }): Promise<void> {
    await super.recordInvocationEvidence(input);
    await continueAfter('evidence_recorded');
  }
}
registerBillableModelMeterContracts();
const policy = new BillingPolicyService({ database });
const ledger = new CheckpointLedger({ database }, policy);
const transportConfig = { get: (key: string): unknown => (key === 'OPENAI_API_KEY' ? 'fixture-key' : undefined) };
const adapters = createBillableModelProviderAdapters(transportConfig, async (_url, init) =>
  fetch(command.providerUrl, init),
);
const resolver = new CodeOwnedBillableModelQualificationResolver({
  adapters,
  credentialAccounts: new Map([['openai', 'fixture-openai-account']]),
  executionTimeout: 60_000,
  ...(command.exactCount
    ? {
        inputCounters: new Map([
          [
            'openai-gpt-5.6-luna',
            {
              qualification: 'controlled-local-zero',
              environment: 'development',
              credentialAccount: 'fixture-openai-account',
              sourceRevision: 'c05-controlled-child',
              url: `${command.providerUrl}/v1/responses/input_tokens`,
            },
          ],
        ]),
      }
    : {}),
});
const owner = new BillableModelInvocationService(
  ledger,
  resolver,
  new ConfigService(Object.fromEntries([['BILLING_REQUEST_DIGEST_SECRET', command.digestSecret]])),
);
send('ready');
try {
  const result = await owner.invoke({
    environment: 'development',
    authUserId: command.authUserId,
    surface: 'gateway',
    attempt: { version: 1, key: command.attemptKey },
    providerWire: 'openai-responses',
    body: {
      model: 'openai-gpt-5.6-luna',
      stream: true,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- OpenAI Responses wire field
      max_output_tokens: 1,
      input: 'fixture',
    },
    priceHeaders: {},
    activity: 'agent',
    signal: new AbortController().signal,
  });
  if (result.state === 'streaming') {
    await result.response.arrayBuffer();
    await result.completion;
  }
  send('complete', result);
} finally {
  await client.end();
}
