import { CreateElicitationRequest } from '@agentclientprotocol/sdk';
import { z } from 'zod';

const shared = {
  mode: z.string(),
  message: z.string(),
  _meta: z.record(z.string(), z.unknown()).nullish(),
};
const elicitationEnvelopeSchema = z.union([
  z.looseObject({ ...shared, sessionId: z.string(), toolCallId: z.string().nullish() }),
  z.looseObject({ ...shared, requestId: z.union([z.string(), z.number(), z.null()]) }),
]);

/**
 * Validate the ACP envelope without SDK normalization discarding schema constraints.
 * The form adapter must see unsupported and secret fields before deciding whether
 * it can safely present and record the request.
 * @internal
 */
export const elicitationRequestSchema = elicitationEnvelopeSchema.refine(
  (value) =>
    CreateElicitationRequest.isForm(value) ||
    CreateElicitationRequest.isUrl(value) ||
    CreateElicitationRequest.isCustom(value),
);
