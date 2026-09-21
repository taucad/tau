import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { financialEnvironmentSchema } from '@taucad/billing';
import { registerBillableModelMeterContracts } from '#api/billing/billable-model-qualification.js';
import { qualifiedMeterContracts } from '#api/billing/billing-policy.js';
import type { FinancialEnvironment } from '#api/billing/billing-policy.js';
import { parseCommercialOverlay, syncPolicy } from '#api/billing/billing-policy.sync.js';
import type { PolicySyncResult } from '#api/billing/billing-policy.sync.js';
import type { BillingPolicyService, PolicyPublicationResult } from '#api/billing/billing-policy.service.js';
import type { DatabaseType } from '#database/database.service.js';

const commandInstantSchema = z.iso.datetime({ offset: true });

const loadPolicyFile = async (path: string): Promise<string> => readFile(path, 'utf8');

const requiredValue = (value: string | undefined, name: string): string => {
  if (value === undefined || value === '') {
    throw new Error(`missing --${name}`);
  }
  return value;
};

const parseRevision = (value: string | undefined): bigint => {
  const revision = requiredValue(value, 'expected-head-revision');
  if (!/^(0|[1-9][0-9]*)$/u.test(revision)) {
    throw new Error('expected head revision must be an unsigned integer');
  }
  return BigInt(revision);
};

export const runBillingPolicyCommand = async (
  service: BillingPolicyService,
  argv: readonly string[],
  loadFile: (path: string) => Promise<string> = loadPolicyFile,
): Promise<PolicyPublicationResult> => {
  const { positionals, values } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: {
      file: { type: 'string' },
      environment: { type: 'string' },
      'activation-id': { type: 'string' },
      'job-key': { type: 'string' },
      'expected-head-revision': { type: 'string' },
      'expected-predecessor-activation-id': { type: 'string' },
      'announced-at': { type: 'string' },
      'effective-at': { type: 'string' },
      'cancelled-at': { type: 'string' },
    },
  });
  const action = positionals[0];
  const environment: FinancialEnvironment = financialEnvironmentSchema.parse(
    requiredValue(values.environment, 'environment'),
  );
  const activationId = requiredValue(values['activation-id'], 'activation-id');
  const jobKey = requiredValue(values['job-key'], 'job-key');
  const expectedHeadRevision = parseRevision(values['expected-head-revision']);

  if (action === 'cancel') {
    if (requiredValue(values['cancelled-at'], 'cancelled-at') !== 'now') {
      throw new Error('--cancelled-at must be now; cancellation authority is the database clock');
    }
    return service.cancelPendingActivation({ environment, activationId, jobKey, expectedHeadRevision });
  }
  if (action !== 'publish') {
    throw new Error('expected billing policy command publish or cancel');
  }

  if (requiredValue(values['announced-at'], 'announced-at') !== 'now') {
    throw new Error('--announced-at must be now; publication authority is the database clock');
  }
  const effectiveInput = requiredValue(values['effective-at'], 'effective-at');
  const effectiveAt = effectiveInput === 'now' ? undefined : new Date(commandInstantSchema.parse(effectiveInput));
  const predecessor = requiredValue(values['expected-predecessor-activation-id'], 'expected-predecessor-activation-id');
  return service.publishPolicy({
    policyJson: await loadFile(requiredValue(values.file, 'file')),
    environment,
    activationId,
    jobKey,
    expectedHeadRevision,
    expectedPredecessorActivationId: predecessor === 'none' ? undefined : predecessor,
    effectiveAt,
    replica: { schemaVersion: 1, meterContractIds: [...qualifiedMeterContracts.keys()] },
  });
};

/**
 * `sync --environment ENVIRONMENT [--commercial-file PATH]`: derives the tariff from the code route
 * table over the commercial overlay and publishes it only when the content changed. The overlay comes
 * from the file or, absent one, the `BILLING_COMMERCIAL_POLICY` secret; `migrate` runs the same routine.
 */
export const runBillingPolicySyncCommand = async (
  service: BillingPolicyService,
  database: Pick<DatabaseType, 'execute' | 'insert'>,
  argv: readonly string[],
): Promise<PolicySyncResult> => {
  const { values } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: { environment: { type: 'string' }, 'commercial-file': { type: 'string' } },
  });
  const environment: FinancialEnvironment = financialEnvironmentSchema.parse(
    requiredValue(values.environment, 'environment'),
  );
  const path = values['commercial-file'];
  const document =
    path === undefined || path === '' ? process.env['BILLING_COMMERCIAL_POLICY'] : await loadPolicyFile(path);
  if (document === undefined || document === '') {
    throw new Error('sync needs --commercial-file or the BILLING_COMMERCIAL_POLICY secret');
  }
  registerBillableModelMeterContracts();
  return syncPolicy(service, database, {
    environment,
    overlay: parseCommercialOverlay(document, environment),
    replica: { schemaVersion: 1, meterContractIds: [...qualifiedMeterContracts.keys()] },
  });
};
