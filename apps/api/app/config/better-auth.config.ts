import type { BetterAuthOptions, LogLevel as BetterAuthLogLevel, ModelNames } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { apiKey } from '@better-auth/api-key';
import { stripe } from '@better-auth/stripe';
import { bearer, magicLink, oneTimeToken } from 'better-auth/plugins';
import type Stripe from 'stripe';
import type { ConfigService } from '@nestjs/config';
import type { LogLevel } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import type { IdPrefix } from '@taucad/types';
import { idPrefix } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import type { DatabaseService } from '#database/database.service.js';
import type { AuthService } from '#auth/auth.service.js';
import type { Environment } from '#config/environment.config.js';
import { staticAuthConfig } from '#config/auth.js';
import type { EmailService } from '#email/email.service.js';
import type { BillingService } from '#api/billing/billing.service.js';
import type { StripeEventRouter } from '#api/billing/stripe-event-router.service.js';
import { proMonthlyGrantMicro, proRolloverCeilingMicro } from '#api/billing/billing.constants.js';
import {
  buildFrontendMagicLinkVerifyUrl,
  buildFrontendResetPasswordUrl,
  buildFrontendVerificationUrl,
} from '#email/email-link-builder.js';

/**
 * Mapping between BetterAuth models and ID prefixes.
 */
const prefixFromModel: Record<Exclude<ModelNames, ''> | 'subscription', IdPrefix> = {
  account: idPrefix.account,
  organization: idPrefix.organization,
  user: idPrefix.user,
  session: idPrefix.session,
  verification: idPrefix.verification,
  'rate-limit': idPrefix.rateLimit,
  'two-factor': idPrefix.twoFactor,
  member: idPrefix.member,
  invitation: idPrefix.invitation,
  jwks: idPrefix.jwks,
  passkey: idPrefix.passkey,
  apikey: idPrefix.secretKey,
  // Added by @better-auth/stripe — without this entry generateId throws on the
  // first mirrored Stripe subscription row.
  subscription: idPrefix.subscription,
};

/**
 * Mapping between BetterAuth log levels and NestJS log levels.
 */
const loggerFromLogLevel = {
  error: 'error',
  warn: 'warn',
  info: 'log',
  debug: 'debug',
  success: 'log',
} as const satisfies Record<BetterAuthLogLevel, LogLevel>;

type BetterAuthConfigOptions = {
  databaseService: DatabaseService;
  configService: ConfigService<Environment, true>;
  authService: AuthService;
  emailService: EmailService;
  billingService: BillingService;
  stripeEventRouter: StripeEventRouter;
  /** The DI-shared Stripe client (BA6) — one instance across plugin + services. */
  stripeClient: Stripe;
};

/**
 * This config specifies the runtime configuration for BetterAuth.
 * It extends the static configuration with runtime-specific options
 * using NestJS dependency injection.
 */
export function getBetterAuthConfig(options: BetterAuthConfigOptions): BetterAuthOptions {
  const logger = new Logger('BetterAuth');
  const { databaseService, configService, emailService, billingService, stripeEventRouter, stripeClient } = options;
  const baseURL = configService.get('AUTH_URL', { infer: true });
  const secureCookies = new URL(baseURL).protocol === 'https:';

  /**
   * Runtime plugin configuration with custom options.
   * IMPORTANT: This array must have the same number of plugins as staticAuthConfig.plugins
   * in auth.ts. Add/remove plugins in both places to maintain sync.
   */
  const stripeWebhookSecret = configService.get('STRIPE_WEBHOOK_SECRET', {
    infer: true,
  });
  const stripeProPriceId = configService.get('STRIPE_PRICE_ID_PRO_MONTHLY', {
    infer: true,
  });

  const runtimePlugins = [
    apiKey({
      requireName: true,
      customKeyGenerator() {
        return generatePrefixedId(idPrefix.secretKey);
      },
    }),
    magicLink({
      async sendMagicLink({ email, url, token }) {
        await emailService.sendMagicLink({
          email,
          url: buildFrontendMagicLinkVerifyUrl({
            frontendURL: configService.get('TAU_FRONTEND_URL', { infer: true }),
            generatedUrl: url,
            token,
          }),
        });
      },
    }),
    stripe({
      stripeClient,
      stripeWebhookSecret: stripeWebhookSecret === '' ? 'whsec_dummy_dev_only' : stripeWebhookSecret,
      // Lazy customer creation (blueprint deviation 8): the plugin creates the
      // Stripe customer at first checkout, so signup never touches Stripe.
      createCustomerOnSignUp: false,
      subscription: {
        enabled: true,
        plans: [
          {
            name: 'pro',
            priceId: stripeProPriceId === '' ? 'price_dev_dummy' : stripeProPriceId,
            limits: {
              // Microdollars (AD16): $20 post-markup monthly grant, 2x rollover
              // ceiling (AD10). One home: billing.constants.ts.
              monthlyGrantMicro: Number(proMonthlyGrantMicro),
              rolloverCeilingMicro: Number(proRolloverCeilingMicro),
            },
          },
          // Enterprise archetype (AD18/E4): subscriptions are attached manually by
          // ops with per-customer prices; limits come from subscription_extension.
          {
            name: 'enterprise',
            priceId: 'price_enterprise_manual',
            limits: {},
          },
        ],
        // Lifecycle hooks only invalidate the entitlements projection — every
        // credit grant flows through the single invoice.paid pathway in the
        // StripeEventRouter (AD17; the S2 exactly-once rule).
        async onSubscriptionComplete({ subscription }) {
          await billingService.invalidateEntitlements(subscription.referenceId);
        },
        async onSubscriptionUpdate({ subscription }) {
          await billingService.invalidateEntitlements(subscription.referenceId);
        },
        async onSubscriptionCancel({ subscription }) {
          await billingService.invalidateEntitlements(subscription.referenceId);
        },
      },
      // Non-subscription events (grants, top-ups, refunds, dunning) fan out to
      // the first-party router; signature verification already happened upstream.
      async onEvent(event) {
        await stripeEventRouter.dispatch(event);
      },
    }),
    // Desktop sign-in handoff (ruling D7) — must mirror auth.ts at this index.
    oneTimeToken({ storeToken: 'hashed' }),
    // `bearer()` stays LAST (see auth.ts).
    bearer(),
  ];

  // Validation: Ensure plugin arrays are in sync
  if (staticAuthConfig.plugins.length !== runtimePlugins.length) {
    throw new Error(
      `Plugin configuration mismatch! ` +
        `auth.ts has ${staticAuthConfig.plugins.length} plugin(s), ` +
        `but runtime config has ${runtimePlugins.length} plugin(s). ` +
        `Please ensure both files declare the same plugins.`,
    );
  }

  return {
    // Spread static configuration
    ...staticAuthConfig,

    // Override with runtime-configured plugins
    plugins: runtimePlugins,

    // Runtime-specific configuration
    database: drizzleAdapter(databaseService.database, {
      provider: 'pg',
    }),

    logger: {
      // Configured to use NestJS logger
      log(level, message, ...args: unknown[]) {
        logger[loggerFromLogLevel[level]](message, ...args);
      },
    },

    secret: configService.get('AUTH_SECRET', { infer: true }),
    baseURL,
    trustedOrigins: [configService.get('TAU_FRONTEND_URL', { infer: true })],

    emailAndPassword: {
      ...staticAuthConfig.emailAndPassword,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      async sendResetPassword({ user, token }) {
        await emailService.sendResetPassword({
          email: user.email,
          url: buildFrontendResetPasswordUrl({
            frontendURL: configService.get('TAU_FRONTEND_URL', { infer: true }),
            token,
          }),
        });
      },
      async onPasswordReset(data) {
        logger.log(`Password reset requested for ${data.user.email}`);
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      async sendVerificationEmail({ user, url, token }) {
        await emailService.sendVerification({
          email: user.email,
          url: buildFrontendVerificationUrl({
            frontendURL: configService.get('TAU_FRONTEND_URL', { infer: true }),
            generatedUrl: url,
            token,
          }),
        });
      },
      async afterEmailVerification(user) {
        logger.log(`User ${user.email} has been verified`);
      },
    },

    socialProviders: {
      github: {
        clientId: configService.get('GITHUB_CLIENT_ID', { infer: true }),
        clientSecret: configService.get('GITHUB_CLIENT_SECRET', {
          infer: true,
        }),
        // Default scopes for initial sign-in (basic profile info)
        scope: ['read:user', 'user:email'],
      },
      google: {
        clientId: configService.get('GOOGLE_CLIENT_ID', { infer: true }),
        clientSecret: configService.get('GOOGLE_CLIENT_SECRET', {
          infer: true,
        }),
      },
    },

    // Advanced configuration
    advanced: {
      ...staticAuthConfig.advanced,
      useSecureCookies: secureCookies,
      defaultCookieAttributes: {
        ...staticAuthConfig.advanced.defaultCookieAttributes,
        secure: secureCookies,
      },
      crossSubDomainCookies: {
        enabled: true,
        domain: undefined, // Will be set based on request
      },
      database: {
        generateId(options) {
          const prefix = prefixFromModel[options.model];

          if (!prefix) {
            throw new Error(`Model ID not supported: ${options.model}`);
          }

          return generatePrefixedId(prefix);
        },
      },
    },

    // eslint-disable-next-line @typescript-eslint/naming-convention -- onAPIError is a valid option
    onAPIError: {
      throw: false,
      onError(error, _context) {
        logger.error(`Auth error: ${JSON.stringify(error)}.`);
      },
    },
  };
}
