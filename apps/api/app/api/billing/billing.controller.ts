/* oxlint-disable new-cap -- NestJS Header is a decorator factory */
import { BillingAccountClosureService } from '#api/billing/billing-account-closure.service.js';
import { ZodValidationPipe } from 'nestjs-zod';
import { BillingPaymentsService } from '#api/billing/billing-payments.service.js';
import {
  ReloadConsentRequestDto,
  ReloadConsentIdDto,
  AccountClosureRequestDto,
  AccountClosureIdDto,
  EnterpriseInvoiceRequestDto,
  TopupRequestDto,
  PaymentActionRequestDto,
  PaymentActionListQueryDto,
  PaymentActionIdDto,
} from '#api/billing/billing.dto.js';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  UsePipes,
} from '@nestjs/common';
import type {
  WireEntitlements,
  WireAutoReloadConsent,
  WireAccountClosure,
  WireFinancialCase,
  WirePaymentAction,
  WireUsageSnapshot,
  WireBalanceExplanation,
  WireModelEstimates,
  WireOpenHolds,
  WireOperationReceipt,
} from '@taucad/billing';
import { serializeEntitlements } from '@taucad/billing';
import type { AuthUser } from '#auth/auth.type.js';
import { UseAuth, User } from '#auth/decorators/auth.decorator.js';
import { BillingService } from '#api/billing/billing.service.js';
import { BillingEstimatesService } from '#api/billing/billing-estimates.service.js';
import { BillingUsageService } from '#api/billing/billing-usage.service.js';

@UseAuth()
@Controller({ path: 'billing', version: '1' })
@UsePipes(ZodValidationPipe)
export class BillingController {
  public constructor(
    private readonly billingService: BillingService,
    private readonly usageService: BillingUsageService,
    private readonly paymentsService: BillingPaymentsService,
    private readonly closureService: BillingAccountClosureService,
    private readonly estimatesService: BillingEstimatesService,
  ) {}

  @Get('entitlements')
  @Header('Cache-Control', 'private, no-store')
  public async getEntitlements(@User() user: AuthUser): Promise<WireEntitlements> {
    return serializeEntitlements(await this.billingService.getEntitlements(user.id));
  }

  @Get('credits')
  @Header('Cache-Control', 'private, no-store')
  public async getCredits(@User() user: AuthUser, @Query() rawQuery: unknown): Promise<WireBalanceExplanation> {
    return this.usageService.getBalance({ authUserId: user.id, rawQuery });
  }

  @Get('model-estimates')
  @Header('Cache-Control', 'private, no-store')
  public async getModelEstimates(@User() user: AuthUser): Promise<WireModelEstimates> {
    return this.estimatesService.getModelEstimates({ authUserId: user.id });
  }

  @Get('holds')
  @Header('Cache-Control', 'private, no-store')
  public async getOpenHolds(@User() user: AuthUser): Promise<WireOpenHolds> {
    return this.usageService.getOpenHolds({ authUserId: user.id });
  }

  @Get('usage')
  @Header('Cache-Control', 'private, no-store')
  public async getUsage(@User() user: AuthUser, @Query() rawQuery: unknown): Promise<WireUsageSnapshot> {
    return this.usageService.getUsage({ authUserId: user.id, rawQuery });
  }

  @Get('operations/:operationId')
  @Header('Cache-Control', 'private, no-store')
  public async getOperationReceipt(
    @User() user: AuthUser,
    @Param('operationId') operationId: string,
    @Query() rawQuery: unknown,
  ): Promise<WireOperationReceipt> {
    return this.usageService.getOperationReceipt({ authUserId: user.id, operationId, rawQuery });
  }

  @Get('attempts/:surface/:attemptKey')
  @Header('Cache-Control', 'private, no-store')
  public async getAttemptReceipt(
    @User() user: AuthUser,
    @Param() params: { surface: string; attemptKey: string },
    @Query() rawQuery: unknown,
  ): Promise<WireOperationReceipt | { state: 'not_found' }> {
    return this.usageService.getAttemptReceipt({
      authUserId: user.id,
      surface: params.surface,
      attemptKey: params.attemptKey,
      rawQuery,
    });
  }

  @Get('reload-consent')
  @Header('Cache-Control', 'private, no-store')
  // oxlint-disable-next-line typescript/no-restricted-types -- JSON absence is explicitly null in the shared wire contract.
  public async getReloadConsent(@User() user: AuthUser): Promise<WireAutoReloadConsent | null> {
    return (await this.paymentsService.getReloadConsent(user.id)) ?? null;
  }

  @Post('enterprise-invoice')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  public async requestEnterpriseInvoice(
    @User() user: AuthUser,
    @Body() body: EnterpriseInvoiceRequestDto,
    @Headers('origin') origin: string | undefined,
  ): Promise<WireFinancialCase> {
    this.assertPaymentMutation(user, origin);
    return this.paymentsService.requestEnterpriseVatInvoice(user.id, body);
  }

  @Post('reload-consent')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  public async prepareReloadConsent(
    @User() user: AuthUser,
    @Body() body: ReloadConsentRequestDto,
    @Headers('origin') origin: string | undefined,
  ): Promise<WirePaymentAction> {
    this.assertPaymentMutation(user, origin);
    return this.paymentsService.prepareReloadConsent(user.id, body);
  }

  @Post('reload-consent/:consentId/revoke')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  public async revokeReloadConsent(
    @User() user: AuthUser,
    @Param() params: ReloadConsentIdDto,
    @Headers('origin') origin: string | undefined,
  ): Promise<WireAutoReloadConsent> {
    this.assertPaymentMutation(user, origin);
    return this.paymentsService.revokeReloadConsent(user.id, params.consentId);
  }

  @Get('account-closure')
  @Header('Cache-Control', 'private, no-store')
  // oxlint-disable-next-line typescript/no-restricted-types -- JSON absence is explicitly null in the shared wire contract.
  public async getCurrentClosure(@User() user: AuthUser): Promise<WireAccountClosure | null> {
    return (await this.closureService.current({ authUserId: user.id })) ?? null;
  }

  @Get('account-closure/:closureId')
  @Header('Cache-Control', 'private, no-store')
  public async getClosure(@User() user: AuthUser, @Param() params: AccountClosureIdDto): Promise<WireAccountClosure> {
    return this.closureService.status({ authUserId: user.id, closureId: params.closureId });
  }

  @Post('account-closure')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  public async prepareClosure(
    @User() user: AuthUser,
    @Body() body: AccountClosureRequestDto,
    @Headers('origin') origin: string | undefined,
  ): Promise<WireAccountClosure> {
    this.assertPaymentMutation(user, origin);
    return this.closureService.prepare({ authUserId: user.id, requestId: body.requestId });
  }

  @Get('payment-actions')
  @Header('Cache-Control', 'private, no-store')
  public async listPaymentActions(
    @User() user: AuthUser,
    @Query() query: PaymentActionListQueryDto,
  ): Promise<WirePaymentAction[]> {
    return this.paymentsService.listActions(user.id, query.purpose);
  }

  @Get('payment-actions/:actionId')
  @Header('Cache-Control', 'private, no-store')
  public async getPaymentAction(
    @User() user: AuthUser,
    @Param() params: PaymentActionIdDto,
  ): Promise<WirePaymentAction> {
    return this.paymentsService.getAction(user.id, params.actionId);
  }

  @Post('payment-actions/topup')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  public async prepareTopup(
    @User() user: AuthUser,
    @Body() body: TopupRequestDto,
    @Headers('origin') origin: string | undefined,
  ): Promise<WirePaymentAction> {
    this.assertPaymentMutation(user, origin);
    return this.paymentsService.prepareTopup(user.id, body);
  }

  @Post('payment-actions/subscription')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  public async createSubscription(
    @User() user: AuthUser,
    @Body() body: PaymentActionRequestDto,
    @Headers('origin') origin: string | undefined,
  ): Promise<WirePaymentAction> {
    this.assertPaymentMutation(user, origin);
    return this.paymentsService.prepareSubscription(user.id, body);
  }

  @Post('payment-actions/portal')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  public async createPortal(
    @User() user: AuthUser,
    @Body() body: PaymentActionRequestDto,
    @Headers('origin') origin: string | undefined,
  ): Promise<WirePaymentAction> {
    this.assertPaymentMutation(user, origin);
    return this.paymentsService.createPortal(user.id, body);
  }

  @Post('payment-actions/:actionId/confirm')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  public async confirmPayment(
    @User() user: AuthUser,
    @Param() params: PaymentActionIdDto,
    @Headers('origin') origin: string | undefined,
  ): Promise<WirePaymentAction> {
    this.assertPaymentMutation(user, origin);
    return this.paymentsService.confirmAction(user.id, params.actionId);
  }

  @Post('payment-actions/:actionId/cancel')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  public async cancelPayment(
    @User() user: AuthUser,
    @Param() params: PaymentActionIdDto,
    @Headers('origin') origin: string | undefined,
  ): Promise<WirePaymentAction> {
    this.assertPaymentMutation(user, origin);
    return this.paymentsService.cancelAction(user.id, params.actionId);
  }

  @Post('payment-actions/:actionId/recover')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  public async recoverPayment(
    @User() user: AuthUser,
    @Param() params: PaymentActionIdDto,
    @Headers('origin') origin: string | undefined,
  ): Promise<WirePaymentAction> {
    this.assertPaymentMutation(user, origin);
    return this.paymentsService.recoverAction(user.id, params.actionId);
  }

  private assertPaymentMutation(user: AuthUser, origin: string | undefined): void {
    if (!user.emailVerified) {
      throw new ForbiddenException('verified_email_required');
    }
    this.paymentsService.assertMutationOrigin(origin);
  }
}
