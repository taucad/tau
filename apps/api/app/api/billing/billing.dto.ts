import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  financialIdentitySchema,
  reloadConsentRequestSchema,
  accountClosureRequestSchema,
  enterpriseInvoiceRequestSchema,
  paymentActionRequestSchema,
  topupActionRequestSchema,
  paymentActionListQuerySchema,
} from '@taucad/billing';

export class TopupRequestDto extends createZodDto(topupActionRequestSchema) {}
export class PaymentActionRequestDto extends createZodDto(paymentActionRequestSchema) {}
export class PaymentActionListQueryDto extends createZodDto(paymentActionListQuerySchema) {}
export class PaymentActionIdDto extends createZodDto(z.object({ actionId: financialIdentitySchema }).strict()) {}

export class ReloadConsentRequestDto extends createZodDto(reloadConsentRequestSchema) {}
export class ReloadConsentIdDto extends createZodDto(z.object({ consentId: financialIdentitySchema }).strict()) {}
export class AccountClosureRequestDto extends createZodDto(accountClosureRequestSchema) {}
export class AccountClosureIdDto extends createZodDto(z.object({ closureId: financialIdentitySchema }).strict()) {}
export class EnterpriseInvoiceRequestDto extends createZodDto(enterpriseInvoiceRequestSchema) {}
