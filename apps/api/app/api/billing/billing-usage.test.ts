/* eslint-disable @typescript-eslint/naming-convention -- PostgreSQL result aliases are intentionally snake case */
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { PgDialect } from 'drizzle-orm/pg-core';
import type postgres from 'postgres';
import { mock, mockDeep } from 'vitest-mock-extended';
import { describe, expect, it } from 'vitest';
import { BillingUsageService } from '#api/billing/billing-usage.service.js';
import type { Environment } from '#config/environment.config.js';
import type { DatabaseService, DatabaseType } from '#database/database.service.js';

type Tx = Parameters<Parameters<DatabaseType['transaction']>[0]>[0];

const queryRows = <T extends ReadonlyArray<Record<string, unknown>>>(items: T): postgres.RowList<T> =>
  Object.assign(items, {
    count: items.length as T['length'],
    command: 'SELECT',
    columns: [],
    statement: { name: '', string: '', types: [], columns: [] },
    state: { status: '', pid: 0, secret: 0 },
  });

const createService = (environment = 'staging', secret = 'billing-usage-test-secret-with-32-chars') => {
  const databaseService = mockDeep<DatabaseService>();
  const configService = mock<ConfigService<Environment, true>>();
  configService.get.mockImplementation((key: string) => (key === 'BILLING_ENVIRONMENT' ? environment : secret));
  return { databaseService, service: new BillingUsageService(databaseService, configService) };
};

describe('BillingUsageService query admission', () => {
  it('rejects caller-provided ownership selectors before touching PostgreSQL', async () => {
    const { databaseService, service } = createService();
    await expect(
      service.getUsage({ authUserId: 'user_1', rawQuery: { accountId: 'someone_else' } }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(databaseService.database.transaction).not.toHaveBeenCalled();
  });

  it('rejects invalid calendar dates and timezones before touching PostgreSQL', async () => {
    const { databaseService, service } = createService();
    await expect(
      service.getUsage({
        authUserId: 'user_1',
        rawQuery: {
          range: 'custom',
          startDate: '2026-02-30',
          endDate: '2026-03-02',
          timezone: 'UTC',
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getUsage({ authUserId: 'user_1', rawQuery: { timezone: 'Mars/Olympus_Mons' } }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(databaseService.database.transaction).not.toHaveBeenCalled();
  });

  it('fails closed at request time when the server billing environment is invalid', async () => {
    const { databaseService, service } = createService('invalid');
    await expect(service.getUsage({ authUserId: 'user_1', rawQuery: {} })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(databaseService.database.transaction).not.toHaveBeenCalled();
  });

  it('does not restore an authentic balance cursor above the current authority head', async () => {
    const { databaseService, service } = createService();
    const transaction = mockDeep<Tx>();
    databaseService.database.transaction.mockImplementation(async (callback) => callback(transaction));
    const authority = {
      binding_id: 'binding_1',
      account_id: 'account_1',
      status: 'open',
      revision: '5',
      promo_atoms: '100',
      plan_atoms: '200',
      purchased_atoms: '300',
      debt_atoms: '0',
      promo_held_atoms: '10',
      plan_held_atoms: '20',
      purchased_held_atoms: '30',
      pending_issuance_atoms: '40',
      revoked_at: null,
      as_of: '2026-09-05T08:00:00.000000Z',
    };
    transaction.execute
      .mockResolvedValueOnce(queryRows([]))
      .mockResolvedValueOnce(queryRows([authority]))
      .mockResolvedValueOnce(queryRows([{ account_delta: '600' }]))
      .mockResolvedValueOnce(queryRows([{ kind: 'purchase_grant', account_delta: '600', event_count: '2' }]))
      .mockResolvedValueOnce(
        queryRows([
          {
            id: 'transaction_2',
            revision: '5',
            kind: 'purchase_grant',
            account_delta: '300',
            occurred_at: '2026-09-05T07:59:00.000000Z',
          },
          {
            id: 'transaction_1',
            revision: '4',
            kind: 'purchase_grant',
            account_delta: '300',
            occurred_at: '2026-09-05T07:58:00.000000Z',
          },
        ]),
      );

    const first = await service.getBalance({ authUserId: 'user_1', rawQuery: { pageSize: '1' } });
    const cursor = first.history?.nextCursor;
    if (first.availability.state !== 'available' || !cursor) {
      throw new Error('Expected a funded balance continuation cursor');
    }

    transaction.execute.mockReset();
    transaction.execute
      .mockResolvedValueOnce(queryRows([]))
      .mockResolvedValueOnce(queryRows([{ ...authority, revision: '4', promo_atoms: '1' }]));
    const continued = await service.getBalance({
      authUserId: 'user_1',
      rawQuery: { pageSize: '1', historyCursor: cursor },
    });

    expect(continued.availability).toEqual({ state: 'unavailable', reason: 'revision_unavailable' });
    expect(continued.snapshotRevision).toBe('4');
    expect(transaction.execute).toHaveBeenCalledTimes(2);
  });

  it('classifies immutable modern partial metering as source incomplete', async () => {
    const { databaseService, service } = createService();
    const transaction = mockDeep<Tx>();
    databaseService.database.transaction.mockImplementation(async (callback) => callback(transaction));
    transaction.execute
      .mockResolvedValueOnce(queryRows([]))
      .mockResolvedValueOnce(
        queryRows([
          {
            binding_id: 'binding_1',
            account_id: 'account_1',
            status: 'open',
            revision: '1',
            promo_atoms: '0',
            plan_atoms: '0',
            purchased_atoms: '0',
            debt_atoms: '0',
            promo_held_atoms: '0',
            plan_held_atoms: '0',
            purchased_held_atoms: '0',
            pending_issuance_atoms: '0',
            revoked_at: null,
            as_of: '2026-09-05T08:00:00.000000Z',
          },
        ]),
      )
      .mockResolvedValueOnce(queryRows([{ valid: true, from_utc: null, to_utc: null, from_date: null, to_date: null }]))
      .mockResolvedValueOnce(
        queryRows([
          {
            account_delta: '-10',
            event_count: '1',
            excluded_unknown: '0',
            history_start: '2026-09-05T07:00:00.000000Z',
            legacy_before: null,
            incomplete_detail: '1',
            legacy_incomplete: '0',
            source_incomplete: '1',
          },
        ]),
      )
      .mockResolvedValueOnce(queryRows([]));

    const result = await service.getUsage({
      authUserId: 'user_1',
      rawQuery: { range: 'all_time', collection: 'rows' },
    });

    expect(result.availability).toEqual({ state: 'partial', reason: 'source_incomplete' });
    expect(result.coverage).toMatchObject({ complete: true, detailComplete: false });
  });
});

describe('BillingUsageService open holds', () => {
  const holdRow = {
    operation_id: 'operation_2',
    model_id: 'gpt-6-astra',
    model_display_name: 'Astra',
    provider_id: 'openai',
    dispatch_state: 'accepted',
    held_atoms: '3084332',
    admitted_at: '2026-09-12T08:00:00.000000Z',
    due_at: '2026-09-12T08:10:00.000000Z',
    release_after: '2026-09-12T08:15:00.000000Z',
  };

  it('publishes the caller-owned pending holds with the grace their release waits for', async () => {
    const { databaseService, service } = createService();
    const transaction = mockDeep<Tx>();
    databaseService.database.transaction.mockImplementation(async (callback) => callback(transaction));
    transaction.execute.mockResolvedValueOnce(queryRows([])).mockResolvedValueOnce(
      queryRows([
        holdRow,
        {
          ...holdRow,
          operation_id: 'operation_1',
          model_id: 'gpt-5.6-luna',
          model_display_name: null,
          provider_id: null,
          dispatch_state: 'admitted',
          held_atoms: '65947',
          admitted_at: null,
        },
      ]),
    );

    const result = await service.getOpenHolds({ authUserId: 'user_1' });

    expect(result).toEqual({
      environment: 'staging',
      ownerId: 'user_1',
      holds: [
        {
          operationId: 'operation_2',
          model: { id: 'gpt-6-astra', displayName: 'Astra', providerId: 'openai' },
          heldCreditAtoms: '3084332',
          admittedAt: '2026-09-12T08:00:00.000000Z',
          dueAt: '2026-09-12T08:10:00.000000Z',
          releaseAfter: '2026-09-12T08:15:00.000000Z',
          dispatchState: 'accepted',
          customerState: 'pending',
        },
        {
          operationId: 'operation_1',
          model: { id: 'gpt-5.6-luna', displayName: null, providerId: null },
          heldCreditAtoms: '65947',
          admittedAt: null,
          dueAt: '2026-09-12T08:10:00.000000Z',
          releaseAfter: '2026-09-12T08:15:00.000000Z',
          dispatchState: 'admitted',
          customerState: 'pending',
        },
      ],
    });

    const [query] = transaction.execute.mock.calls[1]!;
    if (typeof query === 'string') {
      throw new TypeError('Expected a parameterized open-holds query');
    }
    const compiled = new PgDialect().sqlToQuery(query.getSQL());
    /* Ownership is the session's binding, never a caller-supplied account; only
     * open holds are listed, and the page is bounded. */
    expect(compiled.sql).toContain('b.auth_user_id = $3');
    expect(compiled.sql).toContain("o.customer_state = 'pending'");
    expect(compiled.sql).toContain('order by o.admitted_at desc nulls last, o.id desc limit $4');
    expect(compiled.params).toEqual([5, 'staging', 'user_1', 200]);
  });

  it('refuses to publish a hold whose amount is not a canonical unsigned atom string', async () => {
    const { databaseService, service } = createService();
    const transaction = mockDeep<Tx>();
    databaseService.database.transaction.mockImplementation(async (callback) => callback(transaction));
    transaction.execute
      .mockResolvedValueOnce(queryRows([]))
      .mockResolvedValueOnce(queryRows([{ ...holdRow, held_atoms: '-1' }]));

    await expect(service.getOpenHolds({ authUserId: 'user_1' })).rejects.toThrow();
  });

  it('fails closed when the server billing environment is invalid', async () => {
    const { databaseService, service } = createService('invalid');
    await expect(service.getOpenHolds({ authUserId: 'user_1' })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(databaseService.database.transaction).not.toHaveBeenCalled();
  });
});
