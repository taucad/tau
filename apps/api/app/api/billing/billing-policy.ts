import { createHash } from 'node:crypto';
import { z } from 'zod';
import { financialEnvironmentSchema, financialIdentitySchema } from '@taucad/billing';

const unsignedIntegerSchema = z.string().regex(/^(0|[1-9][0-9]{0,77})$/u);
const positiveIntegerSchema = z.string().regex(/^[1-9][0-9]{0,77}$/u);
const signed64Maximum = 9_223_372_036_854_775_807n;
const unsignedSigned64Schema = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,18})$/u)
  .pipe(z.string().refine((value) => BigInt(value) <= signed64Maximum, 'value exceeds signed 64-bit storage'));
const positiveSigned64Schema = z
  .string()
  .regex(/^[1-9][0-9]{0,18}$/u)
  .pipe(z.string().refine((value) => BigInt(value) <= signed64Maximum, 'value exceeds signed 64-bit storage'));
const meterDimensionSchema = z.enum(['uncached_input', 'cache_read', 'cache_write', 'output']);
export const qualifiedMeterContracts = new Map<string, ReadonlySet<string>>();

const rateSchema = z
  .object({
    rateId: financialIdentitySchema,
    meterContractId: financialIdentitySchema,
    dimension: meterDimensionSchema,
    tier: financialIdentitySchema.nullable(),
    unit: z.literal('token'),
    referenceNumeratorPicoUsd: unsignedIntegerSchema,
    denominatorUnits: positiveIntegerSchema,
    retailOverride: z
      .object({ numeratorCreditAtoms: unsignedIntegerSchema, denominatorUnits: positiveIntegerSchema })
      .strict()
      .nullable(),
  })
  .strict();

const routeSchema = z
  .object({
    routeId: financialIdentitySchema,
    sku: financialIdentitySchema,
    meterContractId: financialIdentitySchema,
    rateIds: z.array(financialIdentitySchema).min(1),
    enabled: z.boolean(),
    spendBudgetId: financialIdentitySchema.nullable(),
    riskBudgetId: financialIdentitySchema.nullable(),
    markupBps: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();

const paidOfferSchema = z.discriminatedUnion('kind', [
  z
    .object({
      offerId: financialIdentitySchema,
      kind: z.literal('pro_monthly'),
      currency: z.literal('usd'),
      principalMinor: positiveSigned64Schema,
      grantCreditAtoms: positiveSigned64Schema,
      ceilingCreditAtoms: positiveSigned64Schema,
    })
    .strict(),
  z
    .object({
      offerId: financialIdentitySchema,
      kind: z.literal('top_up'),
      currency: z.literal('usd'),
      minimumPrincipalMinor: positiveSigned64Schema,
      maximumPrincipalMinor: positiveSigned64Schema,
      creditAtomsPerPrincipalMinor: positiveSigned64Schema,
    })
    .strict(),
]);

const promotionOfferSchema = z
  .object({
    promotionProgramId: financialIdentitySchema,
    eligibility: z.literal('verified_account'),
    period: z.literal('month'),
    grantCreditAtoms: positiveSigned64Schema,
    accountCeilingCreditAtoms: unsignedSigned64Schema,
    budgetId: financialIdentitySchema,
  })
  .strict();

export const commercialPolicySchema = z
  .object({
    schemaVersion: z.literal(1),
    environment: financialEnvironmentSchema,
    policyVersion: financialIdentitySchema,
    markupBps: z.number().int().min(0).max(10_000),
    fleet: z
      .object({
        minimumSchemaVersion: z.literal(1),
        meterContractIds: z.array(financialIdentitySchema),
      })
      .strict(),
    rates: z.array(rateSchema),
    routes: z.array(routeSchema),
    offers: z.array(paidOfferSchema).length(2),
    // Historical immutable policies without this capability cannot authorize automatic collection.
    autoReload: z
      .object({
        enabled: z.boolean(),
        thresholdAtoms: positiveSigned64Schema,
        principalMinor: positiveSigned64Schema,
        monthlyGrossCapMinor: positiveSigned64Schema,
        minimumCadenceSeconds: z.number().int().min(3600).max(86_400),
        terminalFailureLimit: z.number().int().min(1).max(2),
      })
      .strict()
      .optional(),
    promotionalIssuance: z
      .object({
        enabled: z.boolean(),
        budgetCreditAtoms: unsignedSigned64Schema,
        offer: promotionOfferSchema.nullable(),
      })
      .strict(),
  })
  .strict()
  .superRefine((policy, context) => {
    requireUnique(
      policy.rates.map(({ rateId }) => rateId),
      'duplicate rateId',
      context,
    );
    requireUnique(
      policy.routes.map(({ routeId }) => routeId),
      'duplicate routeId',
      context,
    );
    requireUnique(
      policy.routes.map(({ sku }) => sku),
      'duplicate sku',
      context,
    );
    requireUnique(
      policy.offers.map(({ offerId }) => offerId),
      'duplicate offerId',
      context,
    );
    requireUnique(
      policy.offers.map(({ kind }) => kind),
      'missing or duplicate paid offer kind',
      context,
    );
    requireUnique(policy.fleet.meterContractIds, 'duplicate fleet meter contract', context);
    for (const offer of policy.offers) {
      if (
        offer.kind === 'pro_monthly' &&
        positiveSigned64Schema.safeParse(offer.ceilingCreditAtoms).success &&
        positiveSigned64Schema.safeParse(offer.grantCreditAtoms).success &&
        BigInt(offer.ceilingCreditAtoms) < BigInt(offer.grantCreditAtoms)
      ) {
        context.addIssue({ code: 'custom', message: 'plan ceiling must cover its grant' });
      }
      if (
        offer.kind === 'top_up' &&
        positiveSigned64Schema.safeParse(offer.maximumPrincipalMinor).success &&
        positiveSigned64Schema.safeParse(offer.minimumPrincipalMinor).success &&
        BigInt(offer.maximumPrincipalMinor) < BigInt(offer.minimumPrincipalMinor)
      ) {
        context.addIssue({ code: 'custom', message: 'top-up maximum must cover its minimum' });
      }
      if (
        offer.kind === 'top_up' &&
        positiveSigned64Schema.safeParse(offer.maximumPrincipalMinor).success &&
        positiveSigned64Schema.safeParse(offer.creditAtomsPerPrincipalMinor).success &&
        BigInt(offer.maximumPrincipalMinor) * BigInt(offer.creditAtomsPerPrincipalMinor) > signed64Maximum
      ) {
        context.addIssue({ code: 'custom', message: 'top-up maximum credit grant exceeds signed 64-bit storage' });
      }
    }

    const reload = policy.autoReload;
    const topup = policy.offers.find((offer) => offer.kind === 'top_up');
    if (
      reload !== undefined &&
      topup?.kind === 'top_up' &&
      [
        reload.principalMinor,
        reload.monthlyGrossCapMinor,
        topup.minimumPrincipalMinor,
        topup.maximumPrincipalMinor,
      ].every((value) => positiveSigned64Schema.safeParse(value).success) &&
      (BigInt(reload.principalMinor) < BigInt(topup.minimumPrincipalMinor) ||
        BigInt(reload.principalMinor) > BigInt(topup.maximumPrincipalMinor) ||
        BigInt(reload.principalMinor) > BigInt(reload.monthlyGrossCapMinor))
    ) {
      context.addIssue({ code: 'custom', message: 'Automatic reload must fit the top-up offer and monthly gross cap' });
    }

    const rates = new Map(policy.rates.map((rate) => [rate.rateId, rate]));
    const compatibleContracts = new Set(policy.fleet.meterContractIds);
    for (const route of policy.routes) {
      requireUnique(route.rateIds, `duplicate rate on route ${route.routeId}`, context);
      const routeRates = route.rateIds.map((rateId) => rates.get(rateId));
      const coveredDimensions = routeRates
        .map((rate) => (rate === undefined ? undefined : `${rate.dimension}:${rate.tier ?? ''}`))
        .filter((value) => value !== undefined);
      const requiredDimensions = qualifiedMeterContracts.get(route.meterContractId);
      const isQualified =
        route.enabled &&
        route.spendBudgetId !== null &&
        route.riskBudgetId !== null &&
        route.spendBudgetId !== route.riskBudgetId &&
        requiredDimensions !== undefined &&
        compatibleContracts.has(route.meterContractId) &&
        routeRates.every((rate) => rate?.meterContractId === route.meterContractId) &&
        new Set(coveredDimensions).size === coveredDimensions.length &&
        requiredDimensions.size === coveredDimensions.length &&
        coveredDimensions.every((dimension) => requiredDimensions.has(dimension));
      if (route.enabled && !isQualified) {
        context.addIssue({ code: 'custom', message: `enabled route ${route.routeId} is not qualified` });
      }
      if (
        routeRates.some((rate) => {
          if (rate === undefined) {
            return false;
          }
          if (!canDeriveRetailRate(policy, route, rate)) {
            return false;
          }
          const retail = deriveRetailRate(policy, route, rate);
          return retail.numeratorCreditAtoms.length > 78 || retail.publicDenominatorUnits.length > 78;
        })
      ) {
        context.addIssue({ code: 'custom', message: `route ${route.routeId} retail rational exceeds 78 digits` });
      }
    }

    const promotion = policy.promotionalIssuance;
    if (
      (promotion.enabled && (promotion.offer === null || promotion.budgetCreditAtoms === '0')) ||
      (!promotion.enabled && (promotion.offer !== null || promotion.budgetCreditAtoms !== '0'))
    ) {
      context.addIssue({
        code: 'custom',
        message: 'promotion requires an enabled, funded offer or must be off/zero/null',
      });
    }
  });

export type CommercialPolicy = z.infer<typeof commercialPolicySchema>;
export type FinancialEnvironment = z.infer<typeof financialEnvironmentSchema>;

export type ValidatedCommercialPolicy = {
  policy: CommercialPolicy;
  canonicalContent: string;
  contentHash: string;
};

const requireUnique = (values: readonly string[], message: string, context: z.RefinementCtx): void => {
  if (new Set(values).size !== values.length) {
    context.addIssue({ code: 'custom', message });
  }
};

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((child) => canonicalize(child));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
};

export const validateCommercialPolicy = (input: unknown): ValidatedCommercialPolicy => {
  const parsedInput: unknown = typeof input === 'string' ? (JSON.parse(input) as unknown) : input;
  const policy = commercialPolicySchema.parse(parsedInput);
  const canonicalContent = JSON.stringify(canonicalize(policy));
  const contentHash = createHash('sha256').update(canonicalContent).digest('hex');
  return { policy, canonicalContent, contentHash };
};

const noticeDuration = 30 * 24 * 60 * 60 * 1000;
const picoUsdPerUsd = 1_000_000_000_000n;
const creditAtomsPerUsd = 1_000_000n;
const basisPoints = 10_000n;

type PolicyRate = CommercialPolicy['rates'][number];
export type EffectivePolicyRate = PolicyRate & { numeratorCreditAtoms: string; publicDenominatorUnits: string };

const canDeriveRetailRate = (
  policy: CommercialPolicy,
  route: CommercialPolicy['routes'][number],
  rate: PolicyRate,
): boolean => {
  const markup = route.markupBps ?? policy.markupBps;
  return (
    Number.isSafeInteger(markup) &&
    markup >= 0 &&
    markup <= 10_000 &&
    unsignedIntegerSchema.safeParse(rate.referenceNumeratorPicoUsd).success &&
    positiveIntegerSchema.safeParse(rate.denominatorUnits).success &&
    (rate.retailOverride === null ||
      (unsignedIntegerSchema.safeParse(rate.retailOverride.numeratorCreditAtoms).success &&
        positiveIntegerSchema.safeParse(rate.retailOverride.denominatorUnits).success))
  );
};

const deriveRetailRate = (
  policy: CommercialPolicy,
  route: CommercialPolicy['routes'][number],
  rate: PolicyRate,
): EffectivePolicyRate => {
  if (rate.retailOverride !== null) {
    return {
      ...rate,
      numeratorCreditAtoms: rate.retailOverride.numeratorCreditAtoms,
      publicDenominatorUnits: rate.retailOverride.denominatorUnits,
    };
  }
  const markupBps = BigInt(route.markupBps ?? policy.markupBps);
  return {
    ...rate,
    numeratorCreditAtoms: (
      BigInt(rate.referenceNumeratorPicoUsd) *
      creditAtomsPerUsd *
      (basisPoints + markupBps)
    ).toString(),
    publicDenominatorUnits: (BigInt(rate.denominatorUnits) * picoUsdPerUsd * basisPoints).toString(),
  };
};

export const resolvePolicyRoute = (
  policy: CommercialPolicy,
  sku: string,
): { route: CommercialPolicy['routes'][number]; rates: EffectivePolicyRate[] } | undefined => {
  const route = policy.routes.find((candidate) => candidate.enabled && candidate.sku === sku);
  if (route === undefined) {
    return undefined;
  }
  const rates = new Map(policy.rates.map((rate) => [rate.rateId, rate]));
  return {
    route,
    rates: route.rateIds.map((rateId) => {
      const rate = rates.get(rateId);
      if (rate === undefined) {
        throw new Error(`policy route references missing rate ${rateId}`);
      }
      return deriveRetailRate(policy, route, rate);
    }),
  };
};

export const validatePolicyActivationNotice = (input: {
  previous?: CommercialPolicy;
  next: CommercialPolicy;
  announcedAt: Date;
  effectiveAt: Date;
}): void => {
  if (input.effectiveAt < input.announcedAt) {
    throw new Error('policy effective time precedes announcement');
  }
  if (input.previous === undefined) {
    return;
  }

  const activeTerms = (policy: CommercialPolicy) =>
    policy.routes.flatMap((route) => {
      const resolved = resolvePolicyRoute(policy, route.sku);
      return resolved === undefined
        ? []
        : resolved.rates.map((rate) => ({
            key: `${route.sku}:${route.meterContractId}:${rate.dimension}:${rate.tier ?? ''}:${rate.unit}`,
            rate,
          }));
    });
  const previousRates = new Map(activeTerms(input.previous).map(({ key, rate }) => [key, rate]));
  const hasIncrease = activeTerms(input.next).some(({ key, rate }) => {
    const prior = previousRates.get(key);
    return (
      prior === undefined ||
      BigInt(rate.numeratorCreditAtoms) * BigInt(prior.publicDenominatorUnits) >
        BigInt(prior.numeratorCreditAtoms) * BigInt(rate.publicDenominatorUnits)
    );
  });
  if (hasIncrease && input.effectiveAt.getTime() - input.announcedAt.getTime() < noticeDuration) {
    throw new Error('retail rate increase requires 30 days notice');
  }
};

export const assertPolicyFleetCompatibility = (
  policy: CommercialPolicy,
  schemaVersion: number,
  meterContractIds: readonly string[],
): void => {
  if (schemaVersion < policy.fleet.minimumSchemaVersion) {
    throw new Error('policy schema is incompatible with this replica');
  }
  const supported = new Set(meterContractIds);
  if (policy.routes.some((route) => route.enabled && !supported.has(route.meterContractId))) {
    throw new Error('policy meter contract is incompatible with this replica');
  }
};
