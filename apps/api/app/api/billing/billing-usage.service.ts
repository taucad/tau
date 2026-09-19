/* oxlint-disable typescript/no-restricted-types -- PostgreSQL and JSON wire rows use explicit nulls */
/* oxlint-disable eslint/no-await-in-loop -- collection reads share one read-only snapshot */

/* eslint-disable max-params-no-constructor/max-params-no-constructor -- bounded SQL helper arguments */
/* eslint-disable @typescript-eslint/naming-convention -- raw PostgreSQL aliases use snake case */
import { BadRequestException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import {
  financialActivityKindSchema,
  financialEnvironmentSchema,
  financialIdentitySchema,
  maximumOpenHolds,
  unsignedIntegerStringSchema,
  wireBalanceExplanationSchema,
  wireOpenHoldsSchema,
  wireOperationReceiptSchema,
  wireUsageSnapshotSchema,
} from '@taucad/billing';
import type { WireBalanceExplanation, WireOpenHolds, WireOperationReceipt, WireUsageSnapshot } from '@taucad/billing';
import { recoveryGraceMinutes } from '#api/billing/credit-ledger.service.js';
import { DatabaseService } from '#database/database.service.js';
import type { DatabaseType } from '#database/database.service.js';

type Tx = Parameters<Parameters<DatabaseType['transaction']>[0]>[0];
type QueryDatabase = Pick<DatabaseType, 'transaction'>;
type QueryConfig = { get(key: string, options: { infer: true }): unknown };
type Collection = 'rows' | 'days' | 'models' | 'activities';

export type RawUsageQuery = {
  range?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  timezone?: unknown;
  models?: unknown;
  activities?: unknown;
  projects?: unknown;
  pageSize?: unknown;
  collection?: unknown;
  cursor?: unknown;
  minRevision?: unknown;
  historyCursor?: unknown;
  correctionCursor?: unknown;
  snapshotRevision?: unknown;
};

type CanonicalQuery = {
  preset: 'last_30_days' | 'custom' | 'all_time';
  fromDate: string | null;
  toDate: string | null;
  timeZone: string;
  models: string[];
  activities: Array<'agent' | 'compaction' | 'summary' | 'title' | 'commit' | 'completion' | 'other'>;
  projects: string[];
};

type CursorPayload = {
  version: 1;
  collection: Collection | 'corrections' | 'balance_history';
  environment: string;
  ownerId: string;
  subjectId: string;
  bindingId: string;
  snapshotRevision: string;
  asOf: string;
  filterHash: string;
  position: string[];
  balance?: Record<string, string>;
};

type AuthorityRow = {
  binding_id: string;
  account_id: string;
  status: string;
  revision: string;
  promo_atoms: string;
  plan_atoms: string;
  purchased_atoms: string;
  debt_atoms: string;
  promo_held_atoms: string;
  plan_held_atoms: string;
  purchased_held_atoms: string;
  pending_issuance_atoms: string;
  revoked_at: string | null;
  as_of: string;
};

type OpenHoldRow = {
  operation_id: string;
  model_id: string;
  model_display_name: string | null;
  provider_id: string | null;
  held_atoms: string;
  admitted_at: string | null;
  due_at: string;
  release_after: string;
  dispatch_state: string;
};

type TotalRow = {
  account_delta: string;
  event_count: string;
  excluded_unknown: string;
  history_start: string | null;
  legacy_before: string | null;
  incomplete_detail: string;
  legacy_incomplete: string;
  source_incomplete: string;
};
type GroupRow = {
  group_key: string;
  model_display_name?: string | null;
  account_delta: string;
  event_count: string;
};
type EventRow = {
  event_kind: 'base' | 'correction';
  event_id: string;
  event_revision: string;
  account_delta: string;
  corrected_at: string | null;
  operation_id: string;
  base_transaction_id: string;
  terminal_revision: string;
  policy_version: string;
  activation_id: string;
  meter_contract_id: string;
  model_id: string;
  model_display_name: string | null;
  provider_id: string | null;
  activity: string;
  project_hint: string | null;
  chat_hint: string | null;
  admitted_at: string | null;
  dispatch_intent_at: string | null;
  evidence_occurred_at: string | null;
  usage_occurred_at: string | null;
  history_version: number | null;
  resolved_at: string;
  execution_status: string | null;
  customer_state: 'settled' | 'released' | 'absorbed';
  authorized_atoms: string;
  charged_atoms: string;
  metering_status: string | null;
  pinned_tariff: Array<{
    rateId: string;
    dimension: string;
    tier: string | null;
    unit: string;
    numeratorCreditAtoms: string;
    denominatorUnits: string;
  }>;
  meter_items: Array<{
    dimension: string;
    tier: string | null;
    quantity: string;
    numeratorCreditAtoms: string;
    denominatorUnits: string;
  }> | null;
  input_tokens: string | null;
  output_tokens: string | null;
  reasoning_tokens: string | null;
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/u;
const cursorPattern = /^v1_[A-Za-z0-9_-]{39,2045}$/u;
const cursorSalt = 'tau-billing-usage-cursor';
/** Milliseconds. */
const statementTimeout = 5000;
const defaultPageSize = 50;
const maximumPageSize = 100;
const maximumFilterItems = 32;
const normalizedActivitySql = sql`case when o.activity in
  ('agent','compaction','summary','title','commit','completion','other') then o.activity else 'other' end`;

const rows = async <T extends Record<string, unknown>>(database: Pick<Tx, 'execute'>, query: SQL): Promise<T[]> => {
  const result = await database.execute<T>(query);
  return [...result] as T[];
};

const parseScalar = (value: unknown, name: string, maximumLength = 256): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumLength) {
    throw new BadRequestException(`Invalid ${name}`);
  }
  return value;
};

const parseList = (value: unknown, name: string): string[] => {
  if (value === undefined) {
    return [];
  }
  const candidate = Array.isArray(value) ? value : [value];
  if (candidate.length > maximumFilterItems || candidate.some((item) => typeof item !== 'string')) {
    throw new BadRequestException(`Invalid ${name}`);
  }
  try {
    return [...new Set(candidate.map((item) => financialIdentitySchema.parse(item)))].sort();
  } catch {
    throw new BadRequestException(`Invalid ${name}`);
  }
};

const parsePageSize = (value: unknown): number => {
  if (value === undefined) {
    return defaultPageSize;
  }
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,2}$/u.test(value)) {
    throw new BadRequestException('Invalid pageSize');
  }
  const parsed = Number(value);
  if (parsed > maximumPageSize) {
    throw new BadRequestException('Invalid pageSize');
  }
  return parsed;
};
const parseUnsignedInput = (value: unknown, name: string): string => {
  const parsed = unsignedIntegerStringSchema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException(`Invalid ${name}`);
  }
  return parsed.data;
};
const parseIdentityInput = (value: unknown, name: string): string => {
  const parsed = financialIdentitySchema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException(`Invalid ${name}`);
  }
  return parsed.data;
};

const parseCalendarDate = (value: string | undefined, name: string): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!datePattern.test(value)) {
    throw new BadRequestException(`Invalid ${name}`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException(`Invalid ${name}`);
  }
  return value;
};

const parseTimeZone = (value: string): string => {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    throw new BadRequestException('Invalid timezone');
  }
};

const netUsed = (accountDelta: string): string => (-BigInt(accountDelta)).toString();
const iso = (value: Date | string): string => (value instanceof Date ? value.toISOString() : value);

const timingStatus = (row: EventRow): 'dispatch_intent' | 'admitted_release' | 'legacy' | 'unavailable' => {
  if (row.dispatch_intent_at) {
    return 'dispatch_intent';
  }
  if (row.history_version === 1 && row.customer_state === 'released' && row.admitted_at) {
    return 'admitted_release';
  }
  if (row.usage_occurred_at && row.history_version === null) {
    return 'legacy';
  }
  return 'unavailable';
};

const canonicalActivity = (value: string): CanonicalQuery['activities'][number] => {
  const parsed = financialActivityKindSchema.safeParse(value);
  return parsed.success ? parsed.data : 'other';
};

const meterItems = (row: EventRow): unknown[] => {
  if (!row.meter_items) {
    return [];
  }
  return row.meter_items.map((item) => {
    const rate = row.pinned_tariff.find(
      (candidate) => candidate.dimension === item.dimension && candidate.tier === item.tier,
    );
    if (!rate) {
      throw new Error('Immutable meter item has no pinned public rate');
    }
    // The item carries the rate it was actually charged at, which is the pin unless the observed
    // input settled the operation back at its base tier; the pin only supplies the rate identity.
    const charged = { numeratorCreditAtoms: item.numeratorCreditAtoms, denominatorUnits: item.denominatorUnits };
    return {
      dimension: item.dimension,
      kind: item.dimension,
      ...(item.tier === null ? {} : { tier: item.tier }),
      quantity: item.quantity,
      unit: 'token',
      rate: { rateId: rate.rateId, ...charged },
      exactContribution: {
        numeratorCreditAtoms: (BigInt(item.quantity) * BigInt(charged.numeratorCreditAtoms)).toString(),
        denominator: charged.denominatorUnits,
      },
    };
  });
};

const tokenSummary = (row: EventRow): Record<string, unknown> => {
  const status = row.metering_status ?? 'unavailable';
  if (status === 'unavailable') {
    return { status, uncachedInput: null, cacheRead: null, cacheWrite: null, inputTotal: null, output: null };
  }
  const quantities = new Map<string, bigint>();
  for (const item of row.meter_items ?? []) {
    quantities.set(item.dimension, (quantities.get(item.dimension) ?? 0n) + BigInt(item.quantity));
  }
  const missing = status === 'complete' ? '0' : null;
  const uncachedInput = quantities.get('uncached_input')?.toString() ?? missing;
  const cacheRead = quantities.get('cache_read')?.toString() ?? missing;
  const cacheWrite = quantities.get('cache_write')?.toString() ?? missing;
  const output = quantities.get('output')?.toString() ?? row.output_tokens ?? missing;
  const inputTotal = [uncachedInput, cacheRead, cacheWrite].every((value) => value !== null)
    ? (BigInt(uncachedInput!) + BigInt(cacheRead!) + BigInt(cacheWrite!)).toString()
    : row.input_tokens;
  return {
    status,
    uncachedInput,
    cacheRead,
    cacheWrite,
    inputTotal,
    output,
    ...(row.reasoning_tokens === null ? {} : { reasoning: row.reasoning_tokens }),
  };
};

const eventWire = (row: EventRow, identity: { environment: string; ownerId: string; subjectId: string }): unknown => {
  const common = {
    schemaVersion: 1,
    ...identity,
    operationId: row.operation_id,
    baseTransactionId: row.base_transaction_id,
    model: { id: row.model_id, displayName: row.model_display_name, providerId: row.provider_id },
    activity: {
      kind: canonicalActivity(row.activity),
      projectHint: row.project_hint,
      chatHint: row.chat_hint,
      parentAttemptKey: null,
    },
    usageOccurredAt: row.usage_occurred_at ? iso(row.usage_occurred_at) : null,
    timingStatus: timingStatus(row),
    accountDeltaCreditAtoms: row.account_delta,
  };
  if (row.event_kind === 'correction') {
    return {
      ...common,
      kind: 'correction',
      transactionId: row.event_id,
      revision: row.event_revision,
      correctedAt: iso(row.corrected_at!),
      reason: 'compensation',
    };
  }
  return {
    ...common,
    kind: 'base',
    category: 'llm',
    terminalRevision: row.terminal_revision,
    policyVersion: row.policy_version,
    activationId: row.activation_id,
    meterContractId: row.meter_contract_id,
    historyVersion: row.history_version === 1 ? 1 : null,
    dispatchIntentAt: row.dispatch_intent_at,
    evidenceOccurredAt: row.evidence_occurred_at,
    admittedAt: row.admitted_at ? iso(row.admitted_at) : null,
    resolvedAt: iso(row.resolved_at),
    executionStatus: row.execution_status ?? 'unknown',
    customerState: row.customer_state,
    authorizedMaxCreditAtoms: row.authorized_atoms,
    chargedCreditAtoms: row.charged_atoms,
    meteringStatus: row.metering_status ?? 'unavailable',
    meterItems: meterItems(row),
    tokens: tokenSummary(row),
  };
};

@Injectable()
export class BillingUsageService {
  public constructor(
    @Inject(DatabaseService) private readonly databaseService: { database: QueryDatabase },
    @Inject(ConfigService) private readonly configService: QueryConfig,
  ) {}

  /** Reads an immutable, account-revision-scoped usage snapshot. */
  public async getUsage(input: { authUserId: string; rawQuery: unknown }): Promise<WireUsageSnapshot> {
    const environment = this.configuredEnvironment();
    const request = this.parseUsageQuery(
      this.parseRawObject(input.rawQuery, [
        'range',
        'startDate',
        'endDate',
        'timezone',
        'models',
        'activities',
        'projects',
        'pageSize',
        'collection',
        'cursor',
        'minRevision',
      ]),
    );
    return this.databaseService.database.transaction(
      async (transaction) => {
        await transaction.execute(sql`select set_config('statement_timeout', ${statementTimeout.toString()}, true)`);
        const authority = await this.resolveAuthority(transaction, environment, input.authUserId);
        if (!authority) {
          const [clock] = await rows<{ as_of: string }>(
            transaction,
            sql`select to_char(transaction_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as_of`,
          );
          const asOf = clock!.as_of;
          const bounds = await this.rangeBounds(transaction, request.query, asOf);
          request.query = { ...request.query, fromDate: bounds.fromDate, toDate: bounds.toDate };
          if (request.cursor) {
            throw new BadRequestException('Incompatible billing cursor');
          }
          if (request.minRevision !== undefined && request.minRevision !== '0') {
            return this.unavailableSnapshot(
              environment,
              input.authUserId,
              request.query,
              'revision_unavailable',
              undefined,
              asOf,
            );
          }
          return this.unfundedSnapshot(environment, input.authUserId, request, asOf);
        }
        if (authority.revoked_at !== null || authority.status === 'closing' || authority.status === 'closed') {
          const unavailableBounds = await this.rangeBounds(transaction, request.query, authority.as_of);
          request.query = { ...request.query, fromDate: unavailableBounds.fromDate, toDate: unavailableBounds.toDate };
          return this.unavailableSnapshot(
            environment,
            input.authUserId,
            request.query,
            'authority_unavailable',
            undefined,
            authority.as_of,
          );
        }
        const secret = this.cursorSecret();
        const cursor = request.cursor
          ? this.openCursor(request.cursor, secret, request.collection ?? 'rows')
          : undefined;
        const snapshotRevision = cursor?.snapshotRevision ?? authority.revision;
        const asOf = cursor?.asOf ?? authority.as_of;
        const bounds = await this.rangeBounds(transaction, request.query, asOf);
        request.query = { ...request.query, fromDate: bounds.fromDate, toDate: bounds.toDate };
        request.filterHash = this.filterHash(request.query, request.pageSize);
        if (
          BigInt(snapshotRevision) > BigInt(authority.revision) ||
          (request.minRevision !== undefined && BigInt(request.minRevision) > BigInt(authority.revision))
        ) {
          return this.unavailableSnapshot(
            environment,
            input.authUserId,
            request.query,
            'revision_unavailable',
            authority,
          );
        }
        if (request.minRevision !== undefined && BigInt(request.minRevision) > BigInt(snapshotRevision)) {
          return this.unavailableSnapshot(
            environment,
            input.authUserId,
            request.query,
            'revision_unavailable',
            authority,
          );
        }
        if (cursor) {
          this.verifyCursor(cursor, authority, input.authUserId, environment, request);
        }
        const identity = { environment, ownerId: input.authUserId, subjectId: authority.account_id };
        const totals = await this.readTotals(
          transaction,
          authority.account_id,
          snapshotRevision,
          request.query,
          bounds,
        );
        const { collection } = request;
        const response: Record<string, unknown> = {
          schemaVersion: 1,
          ...identity,
          snapshotRevision,
          asOf,
          query: request.query,
          coverage: {
            historyStart: totals.history_start,
            legacyBefore: totals.legacy_before,
            complete: totals.excluded_unknown === '0',
            detailComplete: totals.incomplete_detail === '0',
            excludedUnknownTimeCount: totals.excluded_unknown,
          },
          availability:
            totals.excluded_unknown === '0' && totals.incomplete_detail === '0'
              ? { state: 'available', reason: null }
              : {
                  state: 'partial',
                  reason: totals.source_incomplete === '0' ? 'legacy_coverage' : 'source_incomplete',
                },
          totals: {
            accountDeltaCreditAtoms: totals.account_delta,
            netUsedCreditAtoms: netUsed(totals.account_delta),
            eventCount: totals.event_count,
          },
        };
        const collections: Collection[] = collection ? [collection] : ['rows', 'days', 'models', 'activities'];
        for (const name of collections) {
          response[name] = await this.readCollection(transaction, {
            name,
            accountId: authority.account_id,
            snapshotRevision,
            query: request.query,
            bounds,
            pageSize: request.pageSize,
            position: cursor?.position,
            cursorContext: {
              environment,
              ownerId: input.authUserId,
              subjectId: authority.account_id,
              bindingId: authority.binding_id,
              snapshotRevision,
              asOf,
              filterHash: request.filterHash,
            },
            secret,
            identity,
          });
        }
        return wireUsageSnapshotSchema.parse(response);
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  /** Returns PostgreSQL's plan for the production terminal-operation keyset scan to the isolated foundation test. */
  public async explainUsageRowsForTest(input: { authUserId: string; rawQuery: unknown }): Promise<string[]> {
    const environment = this.configuredEnvironment();
    const request = this.parseUsageQuery(
      this.parseRawObject(input.rawQuery, [
        'range',
        'startDate',
        'endDate',
        'timezone',
        'models',
        'activities',
        'projects',
        'pageSize',
        'minRevision',
        'collection',
        'cursor',
      ]),
    );
    return this.databaseService.database.transaction(
      async (transaction) => {
        await transaction.execute(sql`select set_config('statement_timeout', ${statementTimeout.toString()}, true)`);
        const authority = await this.resolveAuthority(transaction, environment, input.authUserId);
        if (!authority) {
          throw new BadRequestException('Billing authority is unavailable');
        }
        if (authority.revoked_at !== null) {
          throw new BadRequestException('Billing authority is unavailable');
        }
        if (request.collection !== undefined && request.collection !== 'rows') {
          throw new BadRequestException('EXPLAIN supports rows only');
        }
        const secret = this.cursorSecret();
        const cursor = request.cursor ? this.openCursor(request.cursor, secret, 'rows') : undefined;
        const snapshotRevision = cursor?.snapshotRevision ?? authority.revision;
        if (BigInt(snapshotRevision) > BigInt(authority.revision)) {
          throw new BadRequestException('Billing revision is unavailable');
        }
        const bounds = await this.rangeBounds(transaction, request.query, cursor?.asOf ?? authority.as_of);
        request.query = { ...request.query, fromDate: bounds.fromDate, toDate: bounds.toDate };
        request.filterHash = this.filterHash(request.query, request.pageSize);
        if (cursor) {
          this.verifyCursor(cursor, authority, input.authUserId, environment, request);
        }
        const plan = await rows<{ 'QUERY PLAN': string }>(
          transaction,
          sql`explain (analyze, buffers, format text) ${this.eventRowsQuery(
            authority.account_id,
            snapshotRevision,
            request.query,
            bounds,
            this.rowPositionSql(cursor?.position),
            request.pageSize + 1,
          )}`,
        );
        return plan.map((line) => line['QUERY PLAN']);
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  /** Reads the all-category balance and bounded journal explanation. */
  public async getBalance(input: { authUserId: string; rawQuery: unknown }): Promise<WireBalanceExplanation> {
    const environment = this.configuredEnvironment();
    const raw = this.parseRawObject(input.rawQuery, ['minRevision', 'historyCursor', 'pageSize']);
    const minRevision = raw.minRevision === undefined ? undefined : parseUnsignedInput(raw.minRevision, 'minRevision');
    const pageSize = parsePageSize(raw.pageSize);
    return this.databaseService.database.transaction(
      async (transaction) => {
        await transaction.execute(sql`select set_config('statement_timeout', ${statementTimeout.toString()}, true)`);
        const authority = await this.resolveAuthority(transaction, environment, input.authUserId);
        if (!authority) {
          const [clock] = await rows<{ as_of: string }>(
            transaction,
            sql`select to_char(transaction_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as_of`,
          );
          if (minRevision !== undefined && minRevision !== '0') {
            return this.unavailableBalance(environment, input.authUserId, clock!.as_of, 'revision_unavailable');
          }
          if (raw.historyCursor !== undefined) {
            throw new BadRequestException('Incompatible balance cursor');
          }
          return wireBalanceExplanationSchema.parse(this.unfundedBalance(environment, input.authUserId, clock!.as_of));
        }
        const secret = this.cursorSecret();
        if ((authority.revoked_at ?? authority.status === 'closing') || authority.status === 'closed') {
          return this.unavailableBalance(environment, input.authUserId, authority.as_of, 'authority_unavailable');
        }
        if (minRevision !== undefined && BigInt(minRevision) > BigInt(authority.revision)) {
          return this.unavailableBalance(
            environment,
            input.authUserId,
            authority.as_of,
            'revision_unavailable',
            authority,
          );
        }
        const balanceHash = createHash('sha256')
          .update(JSON.stringify({ kind: 'balance_history', pageSize }))
          .digest('base64url');
        const historyCursor =
          raw.historyCursor === undefined
            ? undefined
            : this.openCursor(parseScalar(raw.historyCursor, 'historyCursor', 2048)!, secret, 'balance_history');
        if (historyCursor && BigInt(historyCursor.snapshotRevision) > BigInt(authority.revision)) {
          return this.unavailableBalance(
            environment,
            input.authUserId,
            authority.as_of,
            'revision_unavailable',
            authority,
          );
        }
        if (
          historyCursor &&
          minRevision !== undefined &&
          BigInt(minRevision) > BigInt(historyCursor.snapshotRevision)
        ) {
          return this.unavailableBalance(
            environment,
            input.authUserId,
            authority.as_of,
            'revision_unavailable',
            authority,
          );
        }
        if (historyCursor) {
          this.verifyCursor(historyCursor, authority, input.authUserId, environment, { filterHash: balanceHash });
        }
        const snapshotRevision = historyCursor?.snapshotRevision ?? authority.revision;
        const asOf = historyCursor?.asOf ?? authority.as_of;
        const balanceAuthority = this.balanceAuthority(authority, historyCursor, snapshotRevision, asOf);
        const historyPosition = historyCursor?.position;
        if (historyPosition && historyPosition.length !== 2) {
          throw new BadRequestException('Invalid balance cursor position');
        }
        const [total] = await rows<{ account_delta: string }>(
          transaction,
          sql`
        select coalesce(sum(account_delta_atoms), 0)::text as account_delta
        from billing.credit_transaction where account_id = ${authority.account_id} and revision <= ${snapshotRevision}::bigint`,
        );
        const byKind = await rows<{ kind: string; account_delta: string; event_count: string }>(
          transaction,
          sql`
        select kind, sum(account_delta_atoms)::text account_delta, count(*)::text event_count
        from billing.credit_transaction where account_id = ${authority.account_id} and revision <= ${snapshotRevision}::bigint
        group by kind order by kind limit 100`,
        );
        const history = await rows<{
          id: string;
          revision: string;
          kind: string;
          account_delta: string;
          occurred_at: string;
        }>(
          transaction,
          sql`
        select id, revision::text, kind, account_delta_atoms::text account_delta,
          to_char(occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') occurred_at
        from billing.credit_transaction where account_id = ${authority.account_id} and revision <= ${snapshotRevision}::bigint
          ${historyPosition ? sql`and (revision<${historyPosition[0]}::bigint or (revision=${historyPosition[0]}::bigint and id<${historyPosition[1]}))` : sql``}
        order by revision desc, id desc limit ${pageSize + 1}`,
        );
        const historyPage = history.slice(0, pageSize);
        const historyTail = historyPage.at(-1);
        const nextHistoryCursor =
          history.length > pageSize && historyTail
            ? this.sealCursor(
                {
                  version: 1,
                  collection: 'balance_history',
                  environment,
                  ownerId: input.authUserId,
                  subjectId: authority.account_id,
                  bindingId: authority.binding_id,
                  snapshotRevision,
                  asOf,
                  filterHash: balanceHash,
                  position: [historyTail.revision, historyTail.id],
                  balance: this.balanceCursorSnapshot(balanceAuthority),
                },
                secret,
              )
            : null;
        const subject = authority.account_id;
        return wireBalanceExplanationSchema.parse({
          schemaVersion: 1,
          environment,
          ownerId: input.authUserId,
          subjectId: subject,
          snapshotRevision,
          asOf,
          availability: { state: 'available', reason: null },
          balance: this.balanceWire(balanceAuthority, environment),
          journalTotals: {
            accountDeltaCreditAtoms: total?.account_delta ?? '0',
            byKind: byKind.map((item) => ({
              kind: item.kind,
              accountDeltaCreditAtoms: item.account_delta,
              netUsedCreditAtoms: netUsed(item.account_delta),
              eventCount: item.event_count,
            })),
          },
          history: {
            items: historyPage.map((item) => ({
              transactionId: item.id,
              revision: item.revision,
              kind: item.kind,
              accountDeltaCreditAtoms: item.account_delta,
              occurredAt: item.occurred_at,
            })),
            nextCursor: nextHistoryCursor,
            complete: nextHistoryCursor === null,
          },
        });
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  /** Recovers the ordinary receipt identity when a caller lost the admission header. */
  /**
   * Lists the customer holds still open on the caller's account, newest first.
   *
   * A hold is an authorized reserve, never a charge: `heldCreditAtoms` is the
   * operation's `authorized_atoms`, which the ledger's own `credit_operation_amounts`
   * constraint proves equals the promo, plan and purchased amounts it took out of the
   * balance. `releaseAfter` is `due_at` plus the recovery grace — the instant recovery
   * may resolve the hold without further supplier evidence — and is computed by the
   * database so the clock is the server's, not the reader's.
   */
  public async getOpenHolds(input: { authUserId: string }): Promise<WireOpenHolds> {
    const environment = this.configuredEnvironment();
    const holds = await this.databaseService.database.transaction(
      async (transaction) => {
        await transaction.execute(sql`select set_config('statement_timeout', ${statementTimeout.toString()}, true)`);
        return rows<OpenHoldRow>(
          transaction,
          sql`
        select o.id operation_id, o.model_id, o.model_display_name, o.provider_id, o.dispatch_state,
          o.authorized_atoms::text held_atoms,
          to_char(o.admitted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') admitted_at,
          to_char(o.due_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') due_at,
          to_char((o.due_at + make_interval(mins => ${recoveryGraceMinutes})) at time zone 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') release_after
        from billing.credit_operation o
        join billing.billing_owner_binding b on b.account_id = o.account_id and b.environment = o.environment
        where b.environment = ${environment} and b.auth_user_id = ${input.authUserId} and b.revoked_at is null
          and o.customer_state = 'pending'
        order by o.admitted_at desc nulls last, o.id desc limit ${maximumOpenHolds}`,
        );
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
    return wireOpenHoldsSchema.parse({
      environment,
      ownerId: input.authUserId,
      holds: holds.map((row) => ({
        operationId: row.operation_id,
        model: { id: row.model_id, displayName: row.model_display_name, providerId: row.provider_id },
        heldCreditAtoms: row.held_atoms,
        admittedAt: row.admitted_at,
        dueAt: row.due_at,
        releaseAfter: row.release_after,
        dispatchState: row.dispatch_state,
        customerState: 'pending',
      })),
    });
  }

  public async getAttemptReceipt(input: {
    authUserId: string;
    surface: string;
    attemptKey: string;
    rawQuery: unknown;
  }): Promise<WireOperationReceipt | { state: 'not_found' }> {
    this.parseRawObject(input.rawQuery, []);
    if (
      !['gateway', 'project_name', 'commit_name', 'code_completion'].includes(input.surface) ||
      !/^[\u0021-\u007E]{1,128}$/u.test(input.attemptKey)
    ) {
      throw new BadRequestException('Invalid invocation attempt identity');
    }
    const environment = this.configuredEnvironment();
    const operationId = await this.databaseService.database.transaction(
      async (transaction) => {
        await transaction.execute(sql`select set_config('statement_timeout', ${statementTimeout.toString()}, true)`);
        const [operation] = await rows<{ id: string }>(
          transaction,
          sql`
        select o.id from billing.credit_operation o
        join billing.billing_owner_binding b on b.account_id = o.account_id and b.environment = o.environment
        where b.environment = ${environment} and b.auth_user_id = ${input.authUserId} and b.revoked_at is null
          and o.surface = ${input.surface} and o.attempt_key = ${input.attemptKey}
      `,
        );
        return operation?.id;
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
    return operationId === undefined
      ? { state: 'not_found' }
      : this.getOperationReceipt({
          authUserId: input.authUserId,
          operationId,
          rawQuery: {},
        });
  }

  /** Reads one owner-scoped operation and a bounded correction page. */
  public async getOperationReceipt(input: {
    authUserId: string;
    operationId: string;
    rawQuery: unknown;
  }): Promise<WireOperationReceipt> {
    const environment = this.configuredEnvironment();
    parseIdentityInput(input.operationId, 'operationId');
    const raw = this.parseRawObject(input.rawQuery, ['snapshotRevision', 'correctionCursor', 'pageSize']);
    const pageSize = parsePageSize(raw.pageSize);
    return this.databaseService.database.transaction(
      async (transaction) => {
        await transaction.execute(sql`select set_config('statement_timeout', ${statementTimeout.toString()}, true)`);
        const authority = await this.resolveAuthority(transaction, environment, input.authUserId);
        if (!authority) {
          const [clock] = await rows<{ as_of: string }>(
            transaction,
            sql`select to_char(transaction_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as_of`,
          );
          return this.unavailableReceipt(
            environment,
            input.authUserId,
            input.operationId,
            clock!.as_of,
            'authority_unavailable',
          );
        }
        if (authority.revoked_at !== null || authority.status === 'closing' || authority.status === 'closed') {
          return this.unavailableReceipt(
            environment,
            input.authUserId,
            input.operationId,
            authority.as_of,
            'authority_unavailable',
          );
        }
        const secret = this.cursorSecret();
        const correctionHash = this.filterHash(
          {
            preset: 'all_time',
            fromDate: null,
            toDate: null,
            timeZone: 'UTC',
            models: [input.operationId],
            activities: [],
            projects: [],
          },
          pageSize,
        );
        const correctionCursor =
          raw.correctionCursor === undefined
            ? undefined
            : this.openCursor(parseScalar(raw.correctionCursor, 'correctionCursor', 2048)!, secret, 'corrections');
        if (correctionCursor) {
          this.verifyCursor(correctionCursor, authority, input.authUserId, environment, { filterHash: correctionHash });
        }
        const requestedRevision =
          raw.snapshotRevision === undefined ? undefined : parseUnsignedInput(raw.snapshotRevision, 'snapshotRevision');
        if (
          correctionCursor &&
          requestedRevision !== undefined &&
          requestedRevision !== correctionCursor.snapshotRevision
        ) {
          throw new BadRequestException('Incompatible correction snapshot revision');
        }
        const revision = correctionCursor?.snapshotRevision ?? requestedRevision ?? authority.revision;
        if (BigInt(revision) > BigInt(authority.revision)) {
          return this.unavailableReceipt(
            environment,
            input.authUserId,
            input.operationId,
            authority.as_of,
            'revision_unavailable',
            authority,
          );
        }
        const [operation] = await rows<{
          customer_state: string;
          admitted_at: string | null;
          dispatch_state: string;
          authorized_atoms: string;
        }>(
          transaction,
          sql`select customer_state,
          to_char(admitted_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') admitted_at,
          dispatch_state,authorized_atoms::text from billing.credit_operation
          where account_id=${authority.account_id} and environment=${environment} and id=${input.operationId}`,
        );
        const identity = { environment, ownerId: input.authUserId, subjectId: authority.account_id };
        if (operation?.customer_state === 'pending' && operation.admitted_at) {
          if (revision !== authority.revision) {
            return this.unavailableReceipt(
              environment,
              input.authUserId,
              input.operationId,
              correctionCursor?.asOf ?? authority.as_of,
              'revision_unavailable',
              authority,
            );
          }
          return wireOperationReceiptSchema.parse({
            state: 'pending',
            schemaVersion: 1,
            ...identity,
            snapshotRevision: revision,
            asOf: authority.as_of,
            operationId: input.operationId,
            admittedAt: operation.admitted_at,
            dispatchState: operation.dispatch_state,
            authorizedMaxCreditAtoms: operation.authorized_atoms,
          });
        }
        const [base] = await this.eventRows(
          transaction,
          authority.account_id,
          revision,
          undefined,
          undefined,
          sql`and operation_id = ${input.operationId} and event_kind='base'`,
          1,
        );
        if (!base) {
          return this.unavailableReceipt(
            environment,
            input.authUserId,
            input.operationId,
            authority.as_of,
            'not_found',
            authority,
          );
        }
        const correctionPosition = correctionCursor?.position;
        if (correctionPosition && correctionPosition.length !== 2) {
          throw new BadRequestException('Invalid correction cursor position');
        }
        const correctionPredicate = correctionPosition
          ? sql`and (event_revision::bigint<${correctionPosition[0]}::bigint or
            (event_revision::bigint=${correctionPosition[0]}::bigint and event_id<${correctionPosition[1]}))`
          : sql``;
        const corrections = await this.eventRows(
          transaction,
          authority.account_id,
          revision,
          undefined,
          undefined,
          sql`and operation_id=${input.operationId} and event_kind='correction' ${correctionPredicate}`,
          pageSize + 1,
        );
        const [correctionTotal] = await rows<{ total: string }>(
          transaction,
          sql`
        select coalesce(sum(c.account_delta_atoms),0)::text total
        from billing.credit_transaction original
        join billing.credit_transaction c on c.account_id=original.account_id and c.correction_of=original.id
        where original.account_id=${authority.account_id} and original.id=${base.base_transaction_id}
          and c.kind='compensation' and c.revision<=${revision}::bigint`,
        );
        const correctionPage = corrections.slice(0, pageSize);
        const correctionTail = correctionPage.at(-1);
        const nextCursor =
          corrections.length > pageSize && correctionTail
            ? this.sealCursor(
                {
                  version: 1,
                  collection: 'corrections',
                  environment,
                  ownerId: input.authUserId,
                  subjectId: authority.account_id,
                  bindingId: authority.binding_id,
                  snapshotRevision: revision,
                  asOf: correctionCursor?.asOf ?? authority.as_of,
                  filterHash: correctionHash,
                  position: [correctionTail.event_revision, correctionTail.event_id],
                },
                secret,
              )
            : null;
        return wireOperationReceiptSchema.parse({
          state: 'terminal',
          schemaVersion: 1,
          ...identity,
          snapshotRevision: revision,
          asOf: correctionCursor?.asOf ?? authority.as_of,
          operationId: input.operationId,
          receipt: eventWire(base, identity),
          correctionTotalCreditAtoms: correctionTotal?.total ?? '0',
          corrections: {
            items: correctionPage.map((event) => eventWire(event, identity)),
            nextCursor,
            complete: nextCursor === null,
          },
        });
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  private configuredEnvironment(): string {
    const environment = this.configService.get('BILLING_ENVIRONMENT', { infer: true });
    const parsed = financialEnvironmentSchema.safeParse(environment);
    if (!parsed.success) {
      throw new ServiceUnavailableException('Billing reporting is unavailable');
    }
    return parsed.data;
  }

  private cursorSecret(): string {
    const secret = this.configService.get('BILLING_USAGE_CURSOR_SECRET', { infer: true });
    if (typeof secret !== 'string' || secret.length < 32) {
      throw new ServiceUnavailableException('Billing reporting is unavailable');
    }
    return secret;
  }

  private parseUsageQuery(raw: RawUsageQuery): {
    query: CanonicalQuery;
    pageSize: number;
    collection?: Collection;
    cursor?: string;
    minRevision?: string;
    filterHash: string;
  } {
    const range = parseScalar(raw.range, 'range') ?? 'last_30_days';
    if (!['last_30_days', 'custom', 'all_time'].includes(range)) {
      throw new BadRequestException('Invalid range');
    }
    const timeZone = parseTimeZone(parseScalar(raw.timezone, 'timezone') ?? 'UTC');
    const startDate = parseCalendarDate(parseScalar(raw.startDate, 'startDate'), 'startDate');
    const endDate = parseCalendarDate(parseScalar(raw.endDate, 'endDate'), 'endDate');
    if (
      range === 'custom' &&
      (!startDate || !endDate || !datePattern.test(startDate) || !datePattern.test(endDate) || startDate >= endDate)
    ) {
      throw new BadRequestException('Invalid custom date range');
    }
    if (range !== 'custom' && (startDate ?? endDate)) {
      throw new BadRequestException('Dates require custom range');
    }
    const models = parseList(raw.models, 'models');
    const projects = parseList(raw.projects, 'projects');
    const activities = parseList(raw.activities, 'activities').map((item) => {
      const parsed = financialActivityKindSchema.safeParse(item);
      if (!parsed.success) {
        throw new BadRequestException('Invalid activities');
      }
      return parsed.data;
    });
    const query: CanonicalQuery = {
      preset: range as CanonicalQuery['preset'],
      fromDate: startDate ?? null,
      toDate: endDate ?? null,
      timeZone,
      models,
      activities,
      projects,
    };
    const collection =
      raw.collection === undefined ? undefined : (parseScalar(raw.collection, 'collection') as Collection);
    if (collection && !['rows', 'days', 'models', 'activities'].includes(collection)) {
      throw new BadRequestException('Invalid collection');
    }
    const cursor = parseScalar(raw.cursor, 'cursor', 8500);
    if (cursor && !collection) {
      throw new BadRequestException('Cursor requires collection');
    }
    const minRevision = raw.minRevision === undefined ? undefined : parseUnsignedInput(raw.minRevision, 'minRevision');
    const pageSize = parsePageSize(raw.pageSize);
    const filterHash = this.filterHash(query, pageSize);
    return {
      query,
      pageSize,
      ...(collection ? { collection } : {}),
      ...(cursor ? { cursor } : {}),
      ...(minRevision ? { minRevision } : {}),
      filterHash,
    };
  }

  private parseRawObject(value: unknown, allowed: readonly string[]): RawUsageQuery {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new BadRequestException('Invalid billing query');
    }
    const raw = value as Record<string, unknown>;
    if (Object.keys(raw).some((key) => !allowed.includes(key))) {
      throw new BadRequestException('Unknown billing query field');
    }
    return raw;
  }

  private async resolveAuthority(
    transaction: Tx,
    environment: string,
    authUserId: string,
  ): Promise<AuthorityRow | undefined> {
    const [authority] = await rows<AuthorityRow>(
      transaction,
      sql`
      select b.id binding_id, a.id account_id, a.status, a.revision::text,
        a.promo_atoms::text, a.plan_atoms::text, a.purchased_atoms::text, a.debt_atoms::text,
        a.promo_held_atoms::text, a.plan_held_atoms::text, a.purchased_held_atoms::text,
        a.pending_issuance_atoms::text,b.revoked_at::text,
        to_char(transaction_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as as_of
      from billing.billing_owner_binding b join billing.credit_account a
        on a.environment=b.environment and a.id=b.account_id
      where b.environment=${environment} and b.auth_user_id=${authUserId}
      order by (b.revoked_at is null) desc limit 1`,
    );
    return authority;
  }

  private async rangeBounds(
    transaction: Tx,
    query: CanonicalQuery,
    asOf: string,
  ): Promise<{
    from: string | null;
    to: string | null;
    fromDate: string | null;
    toDate: string | null;
  }> {
    const result = await rows<{
      valid: boolean;
      from_utc: string | null;
      to_utc: string | null;
      from_date: string | null;
      to_date: string | null;
    }>(
      transaction,
      sql`
      select exists(select 1 from pg_timezone_names where name=${query.timeZone}) valid,
        case when ${query.preset}='all_time' then null
             when ${query.preset}='custom' then to_char((${query.fromDate}::date::timestamp at time zone ${query.timeZone}) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
             else to_char(((${asOf}::timestamptz at time zone ${query.timeZone})::date - 29)::timestamp at time zone ${query.timeZone} at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end from_utc,
        case when ${query.preset}='all_time' then null
             when ${query.preset}='custom' then to_char((${query.toDate}::date::timestamp at time zone ${query.timeZone}) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
             else to_char(((((${asOf}::timestamptz at time zone ${query.timeZone})::date + 1)::timestamp) at time zone ${query.timeZone}) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end to_utc,
        case when ${query.preset}='all_time' then null when ${query.preset}='custom' then ${query.fromDate}
             else to_char(((${asOf}::timestamptz at time zone ${query.timeZone})::date - 29),'YYYY-MM-DD') end from_date,
        case when ${query.preset}='all_time' then null when ${query.preset}='custom' then ${query.toDate}
             else to_char(((${asOf}::timestamptz at time zone ${query.timeZone})::date + 1),'YYYY-MM-DD') end to_date`,
    );
    if (!result[0]?.valid) {
      throw new BadRequestException('Invalid timezone');
    }
    return { from: result[0].from_utc, to: result[0].to_utc, fromDate: result[0].from_date, toDate: result[0].to_date };
  }

  private filterHash(query: CanonicalQuery, pageSize: number): string {
    return createHash('sha256').update(JSON.stringify({ query, pageSize })).digest('base64url');
  }

  private filterSql(
    accountId: string,
    revision: string,
    query: CanonicalQuery,
    bounds: { from: string | null; to: string | null },
    includeRange = true,
  ): SQL {
    const clauses: SQL[] = [
      sql`o.account_id=${accountId}`,
      sql`o.category='llm'`,
      sql`o.terminal_revision<=${revision}::bigint`,
    ];
    if (includeRange && bounds.from) {
      clauses.push(sql`o.usage_occurred_at>=${bounds.from}::timestamptz`);
    }
    if (includeRange && bounds.to) {
      clauses.push(sql`o.usage_occurred_at<${bounds.to}::timestamptz`);
    }
    if (query.models.length > 0) {
      clauses.push(
        sql`o.model_id in (${sql.join(
          query.models.map((value) => sql`${value}`),
          sql`,`,
        )})`,
      );
    }
    if (query.activities.length > 0) {
      clauses.push(
        sql`${normalizedActivitySql} in (${sql.join(
          query.activities.map((value) => sql`${value}`),
          sql`,`,
        )})`,
      );
    }
    if (query.projects.length > 0) {
      clauses.push(
        sql`o.project_hint in (${sql.join(
          query.projects.map((value) => sql`${value}`),
          sql`,`,
        )})`,
      );
    }
    return sql.join(clauses, sql` and `);
  }

  private effectsSql(
    accountId: string,
    revision: string,
    query: CanonicalQuery,
    bounds: { from: string | null; to: string | null },
  ): SQL {
    const filter = this.filterSql(accountId, revision, query, bounds);
    return sql`with filtered as (select o.* from billing.credit_operation o where ${filter}), effects as (
      select o.id operation_id,o.usage_occurred_at,o.model_id,o.model_display_name,${normalizedActivitySql} activity,o.project_hint,
        t.id event_id,t.revision,t.account_delta_atoms
      from filtered o join billing.credit_transaction t on t.account_id=o.account_id and t.id=o.base_transaction_id
      union all
      select o.id,o.usage_occurred_at,o.model_id,o.model_display_name,${normalizedActivitySql},o.project_hint,
        c.id,c.revision,c.account_delta_atoms
      from filtered o join billing.credit_transaction original on original.account_id=o.account_id and original.id=o.base_transaction_id
      join billing.credit_transaction c on c.account_id=original.account_id and c.correction_of=original.id
      where c.kind='compensation' and c.revision<=${revision}::bigint)`;
  }

  private async readTotals(
    transaction: Tx,
    accountId: string,
    revision: string,
    query: CanonicalQuery,
    bounds: { from: string | null; to: string | null },
  ): Promise<TotalRow> {
    const [total] = await rows<TotalRow>(
      transaction,
      sql`${this.effectsSql(accountId, revision, query, bounds)}
      select coalesce(sum(account_delta_atoms),0)::text account_delta,count(*)::text event_count,
        (select count(*)::text from billing.credit_operation o where ${this.filterSql(accountId, revision, query, bounds, false)}
          and o.usage_occurred_at is null and ${bounds.from === null ? sql`false` : sql`true`}) excluded_unknown,
        to_char(min(usage_occurred_at) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') history_start,
        (select to_char(max(o.usage_occurred_at) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
          from billing.credit_operation o where ${this.filterSql(accountId, revision, query, bounds)} and o.history_version is null) legacy_before,
        ((select count(*) from billing.credit_operation o where ${this.filterSql(accountId, revision, query, bounds)}
          and (o.history_version is null or o.model_display_name is null or o.execution_status is null
            or o.metering_status is null or o.metering_status<>'complete' or o.usage_occurred_at is null))
          + (select count(*) from billing.credit_operation o where ${this.filterSql(accountId, revision, query, bounds, false)}
            and o.usage_occurred_at is null and ${bounds.from === null ? sql`false` : sql`true`}))::text incomplete_detail,
        ((select count(*) from billing.credit_operation o where ${this.filterSql(accountId, revision, query, bounds)}
          and o.history_version is null)
          + (select count(*) from billing.credit_operation o where ${this.filterSql(accountId, revision, query, bounds, false)}
            and o.usage_occurred_at is null and ${bounds.from === null ? sql`false` : sql`true`}
            and o.history_version is null))::text legacy_incomplete,
        ((select count(*) from billing.credit_operation o where ${this.filterSql(accountId, revision, query, bounds)}
          and o.history_version is not null and (o.model_display_name is null or o.execution_status is null
            or o.metering_status is null or o.metering_status<>'complete' or o.usage_occurred_at is null))
          + (select count(*) from billing.credit_operation o where ${this.filterSql(accountId, revision, query, bounds, false)}
            and o.usage_occurred_at is null and ${bounds.from === null ? sql`false` : sql`true`}
            and o.history_version is not null))::text source_incomplete from effects`,
    );
    return (
      total ?? {
        account_delta: '0',
        event_count: '0',
        excluded_unknown: '0',
        history_start: null,
        legacy_before: null,
        incomplete_detail: '0',
        legacy_incomplete: '0',
        source_incomplete: '0',
      }
    );
  }

  private async readCollection(
    transaction: Tx,
    args: {
      name: Collection;
      accountId: string;
      snapshotRevision: string;
      query: CanonicalQuery;
      bounds: { from: string | null; to: string | null };
      pageSize: number;
      position?: string[];
      cursorContext: Omit<CursorPayload, 'version' | 'collection' | 'position'>;
      secret: string;
      identity: { environment: string; ownerId: string; subjectId: string };
    },
  ): Promise<unknown> {
    if (args.name === 'rows') {
      const result = await this.eventRows(
        transaction,
        args.accountId,
        args.snapshotRevision,
        args.query,
        args.bounds,
        this.rowPositionSql(args.position),
        args.pageSize + 1,
      );
      const page = result.slice(0, args.pageSize);
      const tail = page.at(-1);
      return {
        items: page.map((item) => eventWire(item, args.identity)),
        complete: result.length <= args.pageSize,
        nextCursor:
          result.length > args.pageSize && tail
            ? this.sealCursor(
                {
                  version: 1,
                  collection: 'rows',
                  ...args.cursorContext,
                  position: [tail.usage_occurred_at ?? '', tail.event_revision, tail.event_id],
                },
                args.secret,
              )
            : null,
      };
    }
    const grouped = await this.groupRows(
      transaction,
      args.name,
      args.accountId,
      args.snapshotRevision,
      args.query,
      args.bounds,
      args.position?.[0],
      args.pageSize + 1,
    );
    const page = grouped.slice(0, args.pageSize);
    const tail = page.at(-1);
    return {
      items: page.map((item) => ({
        ...(args.name === 'days'
          ? { day: item.group_key }
          : args.name === 'models'
            ? { modelId: item.group_key, modelDisplayName: item.model_display_name ?? null }
            : { activity: canonicalActivity(item.group_key) }),
        accountDeltaCreditAtoms: item.account_delta,
        netUsedCreditAtoms: netUsed(item.account_delta),
        eventCount: item.event_count,
      })),
      complete: grouped.length <= args.pageSize,
      nextCursor:
        grouped.length > args.pageSize && tail
          ? this.sealCursor(
              { version: 1, collection: args.name, ...args.cursorContext, position: [tail.group_key] },
              args.secret,
            )
          : null,
    };
  }

  private async eventRows(
    transaction: Tx,
    accountId: string,
    revision: string,
    query?: CanonicalQuery,
    bounds?: { from: string | null; to: string | null },
    extra: SQL = sql``,
    limit = 101,
  ): Promise<EventRow[]> {
    return rows<EventRow>(transaction, this.eventRowsQuery(accountId, revision, query, bounds, extra, limit));
  }

  private eventRowsQuery(
    accountId: string,
    revision: string,
    query?: CanonicalQuery,
    bounds?: { from: string | null; to: string | null },
    extra: SQL = sql``,
    limit = 101,
  ): SQL {
    const filter =
      query && bounds
        ? this.filterSql(accountId, revision, query, bounds)
        : sql`o.account_id=${accountId} and o.category='llm' and o.terminal_revision<=${revision}::bigint`;
    return sql`with event_keys as (
      select 'base'::text event_kind,t.id event_id,t.revision event_revision,t.account_delta_atoms account_delta,
        null::timestamptz corrected_at,o.id operation_id,o.usage_occurred_at
      from billing.credit_operation o join billing.credit_transaction t
        on t.account_id=o.account_id and t.id=o.base_transaction_id where ${filter}
      union all
      select 'correction',c.id,c.revision,c.account_delta_atoms,c.occurred_at,o.id,o.usage_occurred_at
      from billing.credit_operation o join billing.credit_transaction original
        on original.account_id=o.account_id and original.id=o.base_transaction_id
      join billing.credit_transaction c on c.account_id=original.account_id and c.correction_of=original.id
      where ${filter} and c.kind='compensation' and c.revision<=${revision}::bigint
    ), selected as (
      select * from event_keys where true ${extra}
      order by usage_occurred_at desc nulls last,event_revision desc,event_id desc limit ${limit}
    )
    select k.event_kind,k.event_id,k.event_revision::text,k.account_delta::text,
      to_char(k.corrected_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') corrected_at,
      o.id operation_id,o.base_transaction_id,o.terminal_revision::text,o.activation_id,o.meter_contract_id,
      o.model_id,o.model_display_name,o.provider_id,o.activity,o.project_hint,o.chat_hint,o.history_version,
      o.customer_state,o.authorized_atoms::text,o.charged_atoms::text,o.execution_status,o.metering_status,
      o.pinned_tariff,o.meter_items,o.input_tokens::text,o.output_tokens::text,o.reasoning_tokens::text,
      to_char(o.admitted_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') admitted_at,
      to_char(o.dispatch_intent_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') dispatch_intent_at,
      to_char(o.evidence_occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') evidence_occurred_at,
      to_char(o.usage_occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') usage_occurred_at,
      to_char(o.resolved_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') resolved_at,p.policy_version
    from selected k join billing.credit_operation o on o.account_id=${accountId} and o.id=k.operation_id
    join billing.billing_policy p on p.id=o.policy_id
    order by k.usage_occurred_at desc nulls last,k.event_revision desc,k.event_id desc`;
  }

  private rowPositionSql(position?: string[]): SQL {
    if (!position) {
      return sql``;
    }
    if (position.length !== 3) {
      throw new BadRequestException('Invalid cursor position');
    }
    const [time, revision, id] = position;
    parseUnsignedInput(revision, 'cursor revision');
    parseIdentityInput(id, 'cursor event');
    return time === ''
      ? sql`and usage_occurred_at is null and (event_revision::bigint<${revision}::bigint or (event_revision::bigint=${revision}::bigint and event_id<${id}))`
      : sql`and (usage_occurred_at<${time}::timestamptz or (usage_occurred_at=${time}::timestamptz and (event_revision::bigint<${revision}::bigint or (event_revision::bigint=${revision}::bigint and event_id<${id}))) or usage_occurred_at is null)`;
  }

  private async groupRows(
    transaction: Tx,
    collection: Exclude<Collection, 'rows'>,
    accountId: string,
    revision: string,
    query: CanonicalQuery,
    bounds: { from: string | null; to: string | null },
    after: string | undefined,
    limit: number,
  ): Promise<GroupRow[]> {
    const key =
      collection === 'days'
        ? sql`coalesce(to_char(usage_occurred_at at time zone ${query.timeZone},'YYYY-MM-DD'),'unknown')`
        : collection === 'models'
          ? sql`model_id`
          : sql`activity`;
    return rows<GroupRow>(
      transaction,
      sql`${this.effectsSql(accountId, revision, query, bounds)}, grouped as (
      select ${key} group_key, ${
        collection === 'models'
          ? sql`case when count(distinct model_display_name)=1 then min(model_display_name) else null end`
          : sql`null::text`
      } model_display_name,
        sum(account_delta_atoms)::text account_delta,count(*)::text event_count from effects group by 1)
      select * from grouped where ${after === undefined ? sql`true` : sql`group_key>${after}`}
      order by group_key limit ${limit}`,
    );
  }

  private sealCursor(payload: CursorPayload, secret: string): string {
    const nonce = randomBytes(12);
    const key = Buffer.from(hkdfSync('sha256', secret, cursorSalt, 'cursor-encryption-v1', 32));
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
    return `v1_${Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString('base64url')}`;
  }

  private openCursor(
    value: string,
    secret: string,
    collection: Collection | 'corrections' | 'balance_history',
  ): CursorPayload {
    if (!cursorPattern.test(value)) {
      throw new BadRequestException('Invalid billing cursor');
    }
    try {
      const envelope = Buffer.from(value.slice(3), 'base64url');
      if (envelope.length < 29) {
        throw new Error('shape');
      }
      const nonce = envelope.subarray(0, 12);
      const tag = envelope.subarray(12, 28);
      const ciphertext = envelope.subarray(28);
      const key = Buffer.from(hkdfSync('sha256', secret, cursorSalt, 'cursor-encryption-v1', 32));
      const decipher = createDecipheriv('aes-256-gcm', key, nonce);
      decipher.setAuthTag(tag);
      const payload = JSON.parse(
        Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8'),
      ) as Partial<CursorPayload>;
      if (
        payload.version !== 1 ||
        payload.collection !== collection ||
        !Array.isArray(payload.position) ||
        payload.position.length > 3
      ) {
        throw new Error('shape');
      }
      financialEnvironmentSchema.parse(payload.environment);
      financialIdentitySchema.parse(payload.ownerId);
      financialIdentitySchema.parse(payload.subjectId);
      financialIdentitySchema.parse(payload.bindingId);
      unsignedIntegerStringSchema.parse(payload.snapshotRevision);
      if (
        typeof payload.asOf !== 'string' ||
        !Number.isFinite(Date.parse(payload.asOf)) ||
        typeof payload.filterHash !== 'string' ||
        !/^[A-Za-z0-9_-]{43}$/u.test(payload.filterHash) ||
        payload.position.some((part) => typeof part !== 'string' || part.length > 128)
      ) {
        throw new Error('shape');
      }
      if (payload.balance) {
        const expected = [
          'debt_atoms',
          'pending_issuance_atoms',
          'plan_atoms',
          'plan_held_atoms',
          'promo_atoms',
          'promo_held_atoms',
          'purchased_atoms',
          'purchased_held_atoms',
        ];
        if (Object.keys(payload.balance).sort().join(',') !== expected.join(',')) {
          throw new Error('shape');
        }
        for (const value of Object.values(payload.balance)) {
          unsignedIntegerStringSchema.parse(value);
        }
      }
      return payload as CursorPayload;
    } catch {
      throw new BadRequestException('Invalid billing cursor');
    }
  }

  private verifyCursor(
    cursor: CursorPayload,
    authority: AuthorityRow,
    ownerId: string,
    environment: string,
    request: { filterHash: string; minRevision?: string },
  ): void {
    if (
      cursor.environment !== environment ||
      cursor.ownerId !== ownerId ||
      cursor.subjectId !== authority.account_id ||
      cursor.bindingId !== authority.binding_id ||
      cursor.filterHash !== request.filterHash ||
      (request.minRevision !== undefined && BigInt(request.minRevision) > BigInt(cursor.snapshotRevision))
    ) {
      throw new BadRequestException('Incompatible billing cursor');
    }
  }

  private unfundedSubject(environment: string, ownerId: string): string {
    return `unfunded:${createHash('sha256').update(`tau-billing-unfunded-v1\0${environment}\0${ownerId}`).digest('hex')}`;
  }

  private unfundedSnapshot(
    environment: string,
    ownerId: string,
    request: ReturnType<BillingUsageService['parseUsageQuery']>,
    asOf: string,
  ): WireUsageSnapshot {
    const empty = { items: [], nextCursor: null, complete: true };
    return wireUsageSnapshotSchema.parse({
      schemaVersion: 1,
      environment,
      ownerId,
      subjectId: this.unfundedSubject(environment, ownerId),
      snapshotRevision: '0',
      asOf,
      query: request.query,
      coverage: {
        historyStart: null,
        legacyBefore: null,
        complete: true,
        detailComplete: true,
        excludedUnknownTimeCount: '0',
      },
      availability: { state: 'available', reason: null },
      totals: { accountDeltaCreditAtoms: '0', netUsedCreditAtoms: '0', eventCount: '0' },
      rows: empty,
      days: empty,
      models: empty,
      activities: empty,
    });
  }

  private unavailableSnapshot(
    environment: string,
    ownerId: string,
    query: CanonicalQuery,
    reason: 'authority_unavailable' | 'revision_unavailable',
    authority?: AuthorityRow,
    asOf?: string,
  ): WireUsageSnapshot {
    return wireUsageSnapshotSchema.parse({
      schemaVersion: 1,
      environment,
      ownerId,
      subjectId: authority?.account_id ?? this.unfundedSubject(environment, ownerId),
      snapshotRevision: authority?.revision ?? '0',
      asOf: authority?.as_of ?? asOf ?? new Date().toISOString(),
      query,
      coverage: {
        historyStart: null,
        legacyBefore: null,
        complete: false,
        detailComplete: false,
        excludedUnknownTimeCount: '0',
      },
      availability: { state: 'unavailable', reason },
      totals: null,
    });
  }

  private balanceWire(authority: AuthorityRow, environment: string): Record<string, unknown> {
    const assets = BigInt(authority.promo_atoms) + BigInt(authority.plan_atoms) + BigInt(authority.purchased_atoms);
    const held =
      BigInt(authority.promo_held_atoms) + BigInt(authority.plan_held_atoms) + BigInt(authority.purchased_held_atoms);
    return {
      schemaVersion: 1,
      environment,
      subjectId: authority.account_id,
      revision: authority.revision,
      asOf: authority.as_of,
      promoGrantCreditAtoms: authority.promo_atoms,
      planGrantCreditAtoms: authority.plan_atoms,
      purchasedCreditAtoms: authority.purchased_atoms,
      debtCreditAtoms: authority.debt_atoms,
      promoHeldCreditAtoms: authority.promo_held_atoms,
      planHeldCreditAtoms: authority.plan_held_atoms,
      purchasedHeldCreditAtoms: authority.purchased_held_atoms,
      pendingIssuanceCreditAtoms: authority.pending_issuance_atoms,
      eligibleAvailableCreditAtoms: (BigInt(authority.debt_atoms) > 0n ? 0n : assets - held).toString(),
      netBalanceCreditAtoms: (assets - BigInt(authority.debt_atoms)).toString(),
    };
  }

  private balanceCursorSnapshot(authority: AuthorityRow): Record<string, string> {
    return {
      promo_atoms: authority.promo_atoms,
      plan_atoms: authority.plan_atoms,
      purchased_atoms: authority.purchased_atoms,
      debt_atoms: authority.debt_atoms,
      promo_held_atoms: authority.promo_held_atoms,
      plan_held_atoms: authority.plan_held_atoms,
      purchased_held_atoms: authority.purchased_held_atoms,
      pending_issuance_atoms: authority.pending_issuance_atoms,
    };
  }

  private balanceAuthority(
    authority: AuthorityRow,
    cursor: CursorPayload | undefined,
    revision: string,
    asOf: string,
  ): AuthorityRow {
    const balance = cursor?.balance;
    if (!balance) {
      return authority;
    }
    return {
      ...authority,
      revision,
      as_of: asOf,
      promo_atoms: balance['promo_atoms']!,
      plan_atoms: balance['plan_atoms']!,
      purchased_atoms: balance['purchased_atoms']!,
      debt_atoms: balance['debt_atoms']!,
      promo_held_atoms: balance['promo_held_atoms']!,
      plan_held_atoms: balance['plan_held_atoms']!,
      purchased_held_atoms: balance['purchased_held_atoms']!,
      pending_issuance_atoms: balance['pending_issuance_atoms']!,
    };
  }

  private unfundedBalance(environment: string, ownerId: string, asOf: string): Record<string, unknown> {
    const authority: AuthorityRow = {
      binding_id: '',
      account_id: this.unfundedSubject(environment, ownerId),
      status: 'open',
      revision: '0',
      promo_atoms: '0',
      plan_atoms: '0',
      purchased_atoms: '0',
      debt_atoms: '0',
      promo_held_atoms: '0',
      plan_held_atoms: '0',
      purchased_held_atoms: '0',
      pending_issuance_atoms: '0',
      revoked_at: null,
      as_of: asOf,
    };
    return {
      schemaVersion: 1,
      environment,
      ownerId,
      subjectId: authority.account_id,
      snapshotRevision: '0',
      asOf: authority.as_of,
      availability: { state: 'available', reason: null },
      balance: this.balanceWire(authority, environment),
      journalTotals: { accountDeltaCreditAtoms: '0', byKind: [] },
      history: { items: [], nextCursor: null, complete: true },
    };
  }

  private unavailableBalance(
    environment: string,
    ownerId: string,
    asOf: string,
    reason: 'authority_unavailable' | 'revision_unavailable',
    authority?: AuthorityRow,
  ): WireBalanceExplanation {
    return wireBalanceExplanationSchema.parse({
      schemaVersion: 1,
      environment,
      ownerId,
      subjectId: authority?.account_id ?? this.unfundedSubject(environment, ownerId),
      snapshotRevision: authority?.revision ?? '0',
      asOf,
      availability: { state: 'unavailable', reason },
      balance: null,
      journalTotals: null,
      history: null,
    });
  }

  private unavailableReceipt(
    environment: string,
    ownerId: string,
    operationId: string,
    asOf: string,
    reason: 'authority_unavailable' | 'revision_unavailable' | 'not_found',
    authority?: AuthorityRow,
  ): WireOperationReceipt {
    return wireOperationReceiptSchema.parse({
      state: 'unavailable',
      schemaVersion: 1,
      environment,
      ownerId,
      subjectId: authority?.account_id ?? this.unfundedSubject(environment, ownerId),
      snapshotRevision: authority?.revision ?? '0',
      asOf,
      operationId,
      reason,
    });
  }
}
