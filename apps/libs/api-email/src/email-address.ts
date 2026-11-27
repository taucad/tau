import type { ConfigService } from '@nestjs/config';
import type { Environment } from '@taucad/api-core';

/**
 * The form every stored address takes: `email_event.recipient`, `email_address_state.address` and
 * `project_share_access.recipient_email` all hold it trimmed and lower-cased.
 *
 * @param address - An email address as written.
 * @returns The address trimmed and lower-cased.
 */
export const normalizeEmailAddress = (address: string): string => address.trim().toLowerCase();

/**
 * An address as logs may carry it: the domain only, never the mailbox.
 *
 * @param address - An email address.
 * @returns `recipient@<domain>`, or `recipient@unknown-domain` when there is none.
 */
export const maskRecipient = (address: string): string => {
  const [, domain = 'unknown-domain'] = address.split('@');
  return `recipient@${domain === '' ? 'unknown-domain' : domain.trim().toLowerCase()}`;
};

/**
 * The deployment an email belongs to, sent as the Resend `env` tag and compared by the webhook so one
 * environment's endpoint drops the other's events when a Resend team serves both. Taken from
 * `BILLING_ENVIRONMENT` (`staging`, `prod-us`), the deployment identity every Tau Cloud API already
 * carries; unset, as in local development and self-hosted servers, it is `development`.
 *
 * @param config - The API configuration; the billing worker passes the same shape over raw `process.env`.
 * @returns The `env` tag value.
 */
export const emailEnvironmentOf = (config: Pick<ConfigService<Environment, true>, 'get'>): string => {
  const environment = config.get('BILLING_ENVIRONMENT', { infer: true });
  return environment === undefined || environment.trim() === '' ? 'development' : environment.trim();
};
