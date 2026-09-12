import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { financialEnvironmentSchema, wireModelEstimatesSchema } from '@taucad/billing';
import type { WireModelEstimates } from '@taucad/billing';
import { maximumMeterCharge } from '#api/billing/billable-model-bound.js';
import { billableModelQualificationResolverKey } from '#api/billing/billable-model-invocation.types.js';
import type {
  BillableModelQualificationResolver,
  BillableProviderWire,
  QualifiedBillableInvocation,
} from '#api/billing/billable-model-invocation.types.js';
import { billableModelRouteIds } from '#api/billing/billable-model-qualification.js';
import { resolvePolicyRoute } from '#api/billing/billing-policy.js';
import type { CommercialPolicy } from '#api/billing/billing-policy.js';
import { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import type { BillingEnvironment, JointInputMaximum, MeterQuantity } from '#api/billing/credit-ledger.types.js';
import type { Environment } from '#config/environment.config.js';

/* Contract C2 publishes two holds per route, both at the 16,384 requested output
 * tokens every Tau turn asks for.
 *
 * The *representative* turn is a ~120 KB text body: the reserve the ledger would
 * authorize for one CAD turn with a loaded workspace in context, which is what a
 * client needs in order to say "this turn will cost about that much".
 *
 * The *minimal* turn is the smallest turn-bearing body its wire admits — an empty
 * string where the wire takes one, a single empty message where it takes a
 * conversation. Every request that actually carries a turn serializes to more bytes
 * and bounds more input tokens, so this hold is the floor admission goes below on no
 * real turn: the only figure a client may *refuse* against without refusing turns
 * the server would have funded. The output term dominates both. */
const representativeText = 'x'.repeat(120_000);
const representativeOutputTokens = 16_384;
const longContextSuffix = ':long-context';

/* The route table's wire and output parameter are not exported, so the funded request
 * shapes are probed instead of duplicated: `resolve` refuses every shape but the
 * route's own, and the winning shape is memoised for the life of the process. */
const representativeTurns = (
  routeId: string,
): ReadonlyArray<{
  providerWire: BillableProviderWire;
  typical: Record<string, unknown>;
  minimum: Record<string, unknown>;
}> => {
  const messages = [{ role: 'user', content: representativeText }];
  const emptyMessages = [{ role: 'user', content: '' }];
  /* eslint-disable @typescript-eslint/naming-convention -- provider wire keys are native snake_case. */
  return [
    {
      providerWire: 'openai-responses',
      typical: { model: routeId, input: messages, max_output_tokens: representativeOutputTokens, stream: true },
      minimum: { model: routeId, input: '', max_output_tokens: representativeOutputTokens, stream: true },
    },
    {
      providerWire: 'anthropic',
      typical: { model: routeId, messages, max_tokens: representativeOutputTokens, stream: true },
      minimum: { model: routeId, messages: emptyMessages, max_tokens: representativeOutputTokens, stream: true },
    },
    {
      providerWire: 'openai-completions',
      typical: { model: routeId, messages, max_completion_tokens: representativeOutputTokens, stream: true },
      minimum: {
        model: routeId,
        messages: emptyMessages,
        max_completion_tokens: representativeOutputTokens,
        stream: true,
      },
    },
    {
      providerWire: 'openai-completions',
      typical: { model: routeId, messages, max_tokens: representativeOutputTokens, stream: true },
      minimum: { model: routeId, messages: emptyMessages, max_tokens: representativeOutputTokens, stream: true },
    },
  ];
  /* eslint-enable @typescript-eslint/naming-convention -- end of the native provider wire keys. */
};

/** One qualified turn's priceable shape: the tariff it pins and the maxima it reserves. */
type QualifiedTurn = {
  sku: string;
  quantities: readonly MeterQuantity[];
  jointInputMaximum: JointInputMaximum | undefined;
};

type RepresentativeQualification = {
  routeId: string;
  modelId: string;
  replica: QualifiedBillableInvocation['replica'];
  typical: QualifiedTurn;
  minimum: QualifiedTurn;
};

const qualifiedTurn = (qualification: QualifiedBillableInvocation): QualifiedTurn => ({
  sku: qualification.sku,
  quantities: qualification.maximumQuantities,
  jointInputMaximum: qualification.invocation.jointInputMaximum,
});

/**
 * Prices one qualified turn exactly as `CreditLedgerService.admit` prices its hold.
 *
 * @param policy - The effective commercial policy.
 * @param turn - The qualified turn's pinned sku and meter maxima.
 * @returns The retail hold in credit atoms, or `undefined` when the published tariff
 *   does not cover the qualified meter partition — admission rejects that outright
 *   (`Maximum meter quantities do not match the qualified contract`), and publishing
 *   a partial tariff would understate the hold.
 */
const priceQualifiedTurn = (policy: CommercialPolicy, turn: QualifiedTurn): bigint | undefined => {
  const resolved = resolvePolicyRoute(policy, turn.sku);
  if (resolved === undefined) {
    return undefined;
  }
  const quantities = new Map(turn.quantities.map((item) => [`${item.dimension}:${item.tier ?? ''}`, item.quantity]));
  const meters = resolved.rates.flatMap((rate) => {
    const quantity = quantities.get(`${rate.dimension}:${rate.tier ?? ''}`);
    return quantity === undefined
      ? []
      : [
          {
            dimension: rate.dimension,
            quantity,
            numerator: BigInt(rate.numeratorCreditAtoms),
            denominator: BigInt(rate.publicDenominatorUnits),
          },
        ];
  });
  if (meters.length !== resolved.rates.length || meters.length !== quantities.size) {
    return undefined;
  }
  return maximumMeterCharge(meters, turn.jointInputMaximum);
};

/**
 * Publishes the retail holds admission would authorize per funded route.
 *
 * Both numbers are produced by the admission path itself — the qualification resolver
 * pins the tier and the meter quantities, and the effective policy route prices them
 * exactly as `CreditLedgerService.admit` does — so a client comparing its balance
 * against these estimates is comparing against reserves it will actually meet: the
 * representative turn for "about this much per turn", the minimal turn for the floor
 * below which no turn on the route can be admitted.
 */
@Injectable()
export class BillingEstimatesService {
  private representative?: readonly RepresentativeQualification[];

  public constructor(
    @Inject(billableModelQualificationResolverKey)
    private readonly resolver: BillableModelQualificationResolver,
    private readonly policyService: BillingPolicyService,
    private readonly configService: ConfigService<Environment, true>,
  ) {}

  public async getModelEstimates(input: { authUserId: string }): Promise<WireModelEstimates> {
    const environment = this.configuredEnvironment();
    const qualified = this.qualifyRepresentativeTurns(environment);
    const replica = qualified[0]?.replica;
    /* No estimable route means no policy read is addressable; an empty list keeps the
     * client falling open to the server's own admission rather than blocking a turn. */
    const effective =
      replica === undefined ? undefined : await this.policyService.selectEffectivePolicy({ environment, replica });
    const routes =
      effective === undefined
        ? []
        : qualified.flatMap((entry) => {
            const typical = priceQualifiedTurn(effective.policy, entry.typical);
            const minimum = priceQualifiedTurn(effective.policy, entry.minimum);
            if (typical === undefined || minimum === undefined) {
              return [];
            }
            return [
              {
                routeId: entry.routeId,
                modelId: entry.modelId,
                typicalHoldAtoms: typical.toString(),
                minimumHoldAtoms: minimum.toString(),
                tier: entry.typical.sku.endsWith(longContextSuffix) ? 'long_context' : 'base',
              },
            ];
          });
    return wireModelEstimatesSchema.parse({ environment, ownerId: input.authUserId, routes });
  }

  private qualifyRepresentativeTurns(environment: BillingEnvironment): readonly RepresentativeQualification[] {
    /* Pure in the route table, so it is resolved once rather than re-parsing 120 KB
     * of representative body on every read. */
    this.representative ??= billableModelRouteIds.flatMap((routeId) => {
      for (const turn of representativeTurns(routeId)) {
        try {
          const typical = this.resolve(environment, turn.providerWire, turn.typical);
          const minimum = this.resolve(environment, turn.providerWire, turn.minimum);
          return [
            {
              routeId: typical.routeId,
              modelId: typical.modelId,
              replica: typical.replica,
              typical: qualifiedTurn(typical),
              minimum: qualifiedTurn(minimum),
            },
          ];
        } catch {
          /* Wrong wire, or a provider with no configured credential: not estimable here. */
        }
      }
      return [];
    });
    return this.representative;
  }

  private resolve(
    environment: BillingEnvironment,
    providerWire: BillableProviderWire,
    body: Record<string, unknown>,
  ): QualifiedBillableInvocation {
    return this.resolver.resolve({
      environment,
      surface: 'gateway',
      attempt: { version: 1, key: 'billing-model-estimate' },
      providerWire,
      body,
      priceHeaders: {},
      activity: 'agent',
    });
  }

  private configuredEnvironment(): BillingEnvironment {
    const parsed = financialEnvironmentSchema.safeParse(this.configService.get('BILLING_ENVIRONMENT', { infer: true }));
    if (!parsed.success) {
      throw new ServiceUnavailableException('Billing reporting is unavailable');
    }
    return parsed.data;
  }
}
