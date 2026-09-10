import { BillingAccountClosureService } from '#api/billing/billing-account-closure.service.js';
import { BillingPaymentsService } from '#api/billing/billing-payments.service.js';
import { ConflictException, ForbiddenException, VersioningType } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { Auth } from 'better-auth';
import { describe, expect, it } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import { wireUsageSnapshotSchema } from '@taucad/billing';
import { BillingController } from '#api/billing/billing.controller.js';
import { BillingService } from '#api/billing/billing.service.js';
import { BillingUsageService } from '#api/billing/billing-usage.service.js';
import { AuthGuard } from '#auth/auth.guard.js';
import { HttpExceptionFilter } from '#filters/http-exception.filter.js';
import { authInstanceKey } from '#constants/auth.constant.js';

const instant = new Date('2026-09-05T12:00:00.000Z');
const owner = {
  id: 'owner-a',
  name: 'Owner',
  email: 'owner@test.invalid',
  emailVerified: true,
  createdAt: instant,
  updatedAt: instant,
  image: null,
};
const session = {
  id: 'session',
  userId: owner.id,
  token: 'test-session',
  expiresAt: new Date('2027-01-01T00:00:00.000Z'),
  createdAt: instant,
  updatedAt: instant,
  ipAddress: null,
  userAgent: null,
};

const emptyUsage = wireUsageSnapshotSchema.parse({
  schemaVersion: 1,
  environment: 'development',
  ownerId: owner.id,
  subjectId: 'unfunded:opaque',
  snapshotRevision: '0',
  asOf: instant.toISOString(),
  query: {
    preset: 'all_time',
    fromDate: null,
    toDate: null,
    timeZone: 'UTC',
    models: [],
    activities: [],
    projects: [],
  },
  coverage: {
    historyStart: null,
    legacyBefore: null,
    complete: true,
    detailComplete: true,
    excludedUnknownTimeCount: '0',
  },
  availability: { state: 'available', reason: null },
  totals: {
    accountDeltaCreditAtoms: '0',
    netUsedCreditAtoms: '0',
    eventCount: '0',
  },
  rows: { items: [], nextCursor: null, complete: true },
});

describe('billing authenticated reporting endpoints', () => {
  it('should authenticate before reporting, bind the session owner and keep collection closed', async () => {
    const billing = mock<BillingService>();
    const payments = mock<BillingPaymentsService>();
    const usage = mock<BillingUsageService>();
    const auth = mockDeep<Auth>();
    auth.api.getSession.mockResolvedValue(null);
    usage.getUsage.mockResolvedValue(emptyUsage);
    usage.getAttemptReceipt.mockResolvedValue({ state: 'not_found' });
    const module = await Test.createTestingModule({
      controllers: [BillingController],
      providers: [
        Reflector,
        AuthGuard,
        { provide: authInstanceKey, useValue: auth },
        { provide: BillingService, useValue: billing },
        { provide: BillingUsageService, useValue: usage },
        { provide: BillingPaymentsService, useValue: payments },
        { provide: BillingAccountClosureService, useValue: mock<BillingAccountClosureService>() },
      ],
    }).compile();
    const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalFilters(new HttpExceptionFilter());
    app.enableVersioning({ type: VersioningType.URI });
    try {
      await app.init();
      const unauthorized = await app.inject({
        method: 'GET',
        url: '/v1/billing/usage?range=all_time',
      });
      expect(unauthorized.statusCode).toBe(401);
      expect(usage.getUsage).not.toHaveBeenCalled();
      const unauthorizedAttempt = await app.inject({
        method: 'GET',
        url: '/v1/billing/attempts/gateway/attempt-a',
      });
      expect(unauthorizedAttempt.statusCode).toBe(401);
      expect(usage.getAttemptReceipt).not.toHaveBeenCalled();
      const topup = {
        requestId: 'request-a',
        returnPath: '/',
        amountMinor: '500',
        method: 'checkout',
      };
      const signedOutPurchase = await app.inject({
        method: 'POST',
        url: '/v1/billing/payment-actions/topup',
        payload: topup,
      });
      expect(signedOutPurchase.statusCode).toBe(401);
      auth.api.getSession.mockResolvedValue({
        user: { ...owner, emailVerified: false },
        session,
      });
      const unverifiedPurchase = await app.inject({
        method: 'POST',
        url: '/v1/billing/payment-actions/topup',
        payload: topup,
      });
      expect(unverifiedPurchase.statusCode).toBe(403);
      expect(payments.prepareTopup).not.toHaveBeenCalled();
      auth.api.getSession.mockResolvedValue({ user: owner, session });
      const injectedOwner = await app.inject({
        method: 'POST',
        url: '/v1/billing/payment-actions/topup',
        payload: { ...topup, ownerId: 'other' },
      });
      expect(injectedOwner.statusCode).toBe(400);
      const validPurchase = await app.inject({
        method: 'POST',
        url: '/v1/billing/payment-actions/topup',
        headers: { origin: 'https://tau.test' },
        payload: topup,
      });
      expect(validPurchase.statusCode).toBe(200);
      expect(payments.assertMutationOrigin).toHaveBeenCalledWith('https://tau.test');
      expect(payments.prepareTopup).toHaveBeenCalledWith(owner.id, topup);

      const invoiceRequest = { invoiceId: 'in_owned', requestId: 'invoice-request-a' };
      const injectedInvoice = await app.inject({
        method: 'POST',
        url: '/v1/billing/enterprise-invoice',
        payload: { ...invoiceRequest, accountId: 'other' },
      });
      expect(injectedInvoice.statusCode).toBe(400);
      expect(payments.requestEnterpriseVatInvoice).not.toHaveBeenCalled();
      const requestedInvoice = await app.inject({
        method: 'POST',
        url: '/v1/billing/enterprise-invoice',
        headers: { origin: 'https://tau.test' },
        payload: invoiceRequest,
      });
      expect(requestedInvoice.statusCode).toBe(200);
      expect(requestedInvoice.headers['cache-control']).toBe('private, no-store');
      expect(payments.requestEnterpriseVatInvoice).toHaveBeenCalledWith(owner.id, invoiceRequest);

      const pendingAction = {
        version: 'payment-action-v1',
        actionId: 'action-a',
        environment: 'development',
        ownerId: owner.id,
        subjectId: 'account-a',
        purpose: 'manual_topup',
        state: 'redirect_required',
        frozen: {
          offerId: 'offer-a',
          currency: 'usd',
          principalMinor: '500',
          taxMinor: '0',
          grossMinor: '500',
          maximumGrossMinor: '500',
          creditAtoms: '5000000',
          paymentMethod: null,
        },
        redirectUrl: 'https://checkout.stripe.com/owned',
        attention: null,
        receipt: null,
        updatedAt: instant.toISOString(),
      };
      payments.prepareTopup.mockRejectedValueOnce(
        new ConflictException({
          code: 'action_already_pending',
          action: pendingAction,
        }),
      );
      const conflict = await app.inject({
        method: 'POST',
        url: '/v1/billing/payment-actions/topup',
        payload: topup,
      });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toMatchObject({
        code: 'action_already_pending',
        action: pendingAction,
      });
      payments.prepareTopup.mockRejectedValueOnce(new ConflictException({ code: 'request_payload_conflict' }));
      const changed = await app.inject({
        method: 'POST',
        url: '/v1/billing/payment-actions/topup',
        payload: topup,
      });
      expect(changed.statusCode).toBe(409);
      expect(changed.json()).toMatchObject({
        code: 'request_payload_conflict',
      });

      const pendingSubscription = { ...pendingAction, actionId: 'subscription-a', purpose: 'subscription_checkout' };
      payments.prepareSubscription.mockRejectedValueOnce(
        new ConflictException({ code: 'action_already_pending', action: pendingSubscription }),
      );
      const subscriptionConflict = await app.inject({
        method: 'POST',
        url: '/v1/billing/payment-actions/subscription',
        payload: { requestId: 'subscription-request', returnPath: '/' },
      });
      expect(subscriptionConflict.statusCode).toBe(409);
      expect(subscriptionConflict.json()).toMatchObject({
        code: 'action_already_pending',
        action: pendingSubscription,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/billing/usage?range=all_time',
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(emptyUsage);
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(usage.getUsage).toHaveBeenCalledWith({
        authUserId: owner.id,
        rawQuery: { range: 'all_time' },
      });
      await app.inject({
        method: 'GET',
        url: '/v1/billing/credits?minRevision=7',
      });
      expect(usage.getBalance).toHaveBeenCalledWith({
        authUserId: owner.id,
        rawQuery: { minRevision: '7' },
      });
      await app.inject({
        method: 'GET',
        url: '/v1/billing/operations/operation-b?snapshotRevision=5',
      });
      expect(usage.getOperationReceipt).toHaveBeenCalledWith({
        authUserId: owner.id,
        operationId: 'operation-b',
        rawQuery: { snapshotRevision: '5' },
      });
      const attempt = await app.inject({
        method: 'GET',
        url: '/v1/billing/attempts/gateway/attempt-a',
      });
      expect(attempt.statusCode).toBe(200);
      expect(attempt.json()).toEqual({ state: 'not_found' });
      expect(attempt.headers['cache-control']).toBe('private, no-store');
      expect(usage.getAttemptReceipt).toHaveBeenCalledWith({
        authUserId: owner.id,
        surface: 'gateway',
        attemptKey: 'attempt-a',
        rawQuery: {},
      });
      const gated = await app.inject({
        method: 'POST',
        url: '/v1/billing/topup-session',
      });
      expect(gated.statusCode).toBe(404);
      expect(billing.getEntitlements).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('checks mutation origin before dispatching a payment action', async () => {
    const payments = mock<BillingPaymentsService>();
    payments.assertMutationOrigin.mockImplementation(() => {
      throw new ForbiddenException('payment_origin_rejected');
    });
    const controller = new BillingController(
      mock<BillingService>(),
      mock<BillingUsageService>(),
      payments,
      mock<BillingAccountClosureService>(),
    );
    await expect(
      controller.prepareTopup(
        owner,
        {
          requestId: 'request-a',
          returnPath: '/',
          amountMinor: '500',
          method: 'checkout',
        },
        undefined,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(payments.prepareTopup).not.toHaveBeenCalled();
  });
});
