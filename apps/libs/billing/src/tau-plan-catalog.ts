import type { BillingTier } from '#billing-tier.js';
import { formatStorageLimit, storageLimitBytesByTier } from '#entitlements.js';

/**
 * Credits a customer gets for one US dollar of purchased credits. The plan
 * cards and the Add credits dialog both quote this figure.
 * @public
 */
export const purchasedCreditsPerUsd = 100;

/**
 * One line of a plan card. `isComingSoon` marks a feature that no plan
 * includes yet: the card draws it with the coming-soon icon in place of the
 * tick, and the legend under the cards says what that icon means.
 * @public
 */
export type PlanCatalogFeature = { readonly label: string; readonly isComingSoon: boolean };

const included = (label: string): PlanCatalogFeature => ({ label, isComingSoon: false });
const comingSoon = (label: string): PlanCatalogFeature => ({ label, isComingSoon: true });

/*
 * The backup line each plan advertises, from the table the Hosted Remote's
 * quota enforces (charter D16). Cloud backup is live on every plan, so the
 * line is an included feature.
 */
const backupFeature = (tier: BillingTier): PlanCatalogFeature =>
  included(`${formatStorageLimit(storageLimitBytesByTier[tier])} cloud backup and sync`);

/**
 * Call-to-action kinds for a plan card (ui-patterns doc Finding 5):
 * `signup` routes to sign-up (or the app when already signed in),
 * `subscribe` starts the Pro checkout, `contact-sales` opens the
 * enterprise mailbox.
 * @public
 */
export type PlanCatalogCtaKind = 'signup' | 'subscribe' | 'contact-sales';

/**
 * One marketing plan card. The same catalogue feeds the public pricing page
 * and the Billing settings plan grid through the one `PlanCards` component.
 * @public
 */
export type PlanCatalogEntry = {
  id: BillingTier;
  name: string;
  tagline: string;
  /** USD per month; undefined for custom-priced tiers. */
  priceMonthly: number | undefined;
  priceLabel: string;
  priceSubLabel: string | undefined;
  /** Included features first, then the ones still in development. */
  features: readonly PlanCatalogFeature[];
  cta: { label: string; kind: PlanCatalogCtaKind };
  /** Drives the "Most popular" badge. */
  popular: boolean;
};

/**
 * The three-tier marketing catalogue (T6/U1/E1/E2, copy per ui-patterns doc
 * Finding 5): credits are the sole model spend-gate (every model is available
 * on every tier — see docs/research/drop-model-tier-gating.md), and the
 * AD13/AD15 verification + no-train boundary is customer-facing copy. Launch
 * carries no complimentary credit grant or refill countdown (charter D1/D2);
 * only paid plan and purchased credits are advertised. Each list opens with
 * what the plan includes today and ends with what is still in development.
 * @public
 */
export const tauPlanCatalog: readonly PlanCatalogEntry[] = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'For trying out Tau',
    priceMonthly: 0,
    priceLabel: '$0',
    priceSubLabel: '/month',
    features: [
      included(`Buy credits any time at ${String(purchasedCreditsPerUsd)} credits per $1`),
      included('Purchased credits never expire'),
      included('All AI models'),
      included('All open-source CAD kernels'),
      included('Unlimited local geometry testing'),
      included('Community support'),
      included('Export to all formats'),
      included('Public share links'),
      included('GitHub connection'),
      backupFeature('free'),
    ],
    cta: { label: 'Start for free', kind: 'signup' },
    popular: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'More credits for regular CAD work',
    priceMonthly: 20,
    priceLabel: '$20',
    // Stripe Tax is added on the payment page, so the displayed price names it.
    priceSubLabel: '/month plus tax',
    features: [
      included('Everything in Free'),
      included('2,000 credits every month'),
      included('Unused monthly credits roll over, up to 4,000'),
      included('Pro kernels (Zoo / KCL, billed in credits)'),
      included('Private and unlisted share links'),
      included('No training on your designs'),
      backupFeature('pro'),
      included('Early access to new features'),
      comingSoon('Hosted design verification'),
      comingSoon('CAD Gateway API, 30k exports a month'),
      comingSoon('3D Conversion API, 50k conversions a month'),
    ],
    cta: { label: 'Upgrade to Pro', kind: 'subscribe' },
    popular: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Verification you can sign off on',
    priceMonthly: undefined,
    priceLabel: 'Custom',
    priceSubLabel: undefined,
    features: [
      included('Everything in Pro'),
      included('Custom monthly credits'),
      included('Team billing'),
      included('Contractual no-training guarantee (DPA)'),
      backupFeature('enterprise'),
      included('Custom CAD Gateway and 3D Conversion API limits'),
      included('Enterprise Git (GitLab, Bitbucket, Azure DevOps)'),
      included('SSO and SCIM (SAML, OIDC, Okta, Google Workspace)'),
      included('Dedicated technical contact'),
      included('SLA'),
      included('Invoicing and purchase orders'),
      comingSoon('Signed evidence reports with retention'),
      comingSoon('Verification CI and org dashboards'),
    ],
    cta: { label: 'Contact sales', kind: 'contact-sales' },
    popular: false,
  },
];
