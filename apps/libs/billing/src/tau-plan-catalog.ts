import type { BillingTier } from '#billing-tier.js';

/**
 * Call-to-action kinds for a plan card (ui-patterns doc Finding 5):
 * `signup` routes to sign-up (or the app when already signed in),
 * `subscribe` starts the Pro checkout, `contact-sales` opens the
 * enterprise mailbox.
 * @public
 */
export type PlanCatalogCtaKind = 'signup' | 'subscribe' | 'contact-sales';

/**
 * One marketing plan card. The same catalogue feeds the index pricing
 * section and the BillingSettings plan grid — one source of truth.
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
  features: string[];
  cta: { label: string; kind: PlanCatalogCtaKind };
  /** Drives the POPULAR pill. */
  popular: boolean;
};

/**
 * The three-tier marketing catalogue (T6/U1/E1/E2, copy per ui-patterns doc
 * Finding 5): credits are the sole model spend-gate (every model is available
 * on every tier — see docs/research/drop-model-tier-gating.md), and the
 * AD13/AD15 verification + no-train boundary is customer-facing copy. Launch
 * carries no complimentary credit grant or refill countdown (charter D1/D2);
 * only paid plan and purchased credits are advertised.
 * @public
 */
export const tauPlanCatalog: PlanCatalogEntry[] = [
  {
    id: 'free',
    name: 'Free Forever',
    tagline: 'Perfect for trying out Tau',
    priceMonthly: 0,
    priceLabel: '$0',
    priceSubLabel: '/month',
    features: [
      'Buy credits any time — 100 credits per US$1',
      'Purchased credits never expire',
      'All AI models',
      'All open-source CAD kernels',
      'Geometry testing — unlimited local validation',
      'Community support',
      'Export to all formats',
      'Public share links',
      'GitHub connection (Coming Soon)',
    ],
    cta: { label: 'Start Creating Free', kind: 'signup' },
    popular: false,
  },
  {
    id: 'pro',
    name: 'Pro Plan',
    tagline: 'Scale your CAD workflow with more credits',
    priceMonthly: 20,
    priceLabel: '$20',
    // Stripe Tax is added at checkout, so the displayed price names it.
    priceSubLabel: '/month USD, plus applicable tax',
    features: [
      'Everything in Free',
      '2,000 credits every month',
      'Unused plan credits roll over, up to 4,000',
      'Pro kernels (Zoo / KCL, metered)',
      'Hosted design verification (Coming Soon)',
      'Private & unlisted share links',
      'No training on your designs',
      'Cross-device sync (Coming Soon)',
      'Early access to new features',
      'API CAD Gateway — 30k exports/mo (Coming Soon)',
      '3D Conversion API — 50k conversions/mo (Coming Soon)',
    ],
    cta: { label: 'Subscribe Now', kind: 'subscribe' },
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
      'Everything in Pro',
      'Custom usage credit allotment',
      'Signed evidence reports + retention (Coming Soon)',
      'Verification CI concurrency + org dashboards (Coming Soon)',
      'Contractual no-train guarantee (DPA)',
      'Custom API CAD Gateway limits',
      'Custom 3D Conversion API limits',
      'Enterprise Git (GitLab, Bitbucket, Azure DevOps)',
      'SSO / SCIM (SAML, OIDC, Okta, Google Workspace)',
      'Dedicated technical contact',
      'SLA',
      'Custom invoicing + PO support',
    ],
    cta: { label: 'Contact Us', kind: 'contact-sales' },
    popular: false,
  },
];
