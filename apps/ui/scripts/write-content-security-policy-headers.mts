/**
 * Write this site's document policy for static files into `<client-dir>/_headers`.
 *
 * `netlify.toml` is shared by the staging and production sites and both deploy the production context, so its
 * `[[headers]]` cannot differ per site. The build therefore writes the policy for this site's `TAU_FRONTEND_URL`
 * (a Netlify builds-scope variable on both sites) into the publish directory, where Netlify merges it with the
 * `netlify.toml` headers. SSR documents send the same policy from `app/lib/content-security-policy.server.ts`.
 *
 * Usage: node scripts/write-content-security-policy-headers.mts <client-dir>   (from apps/ui, in each build command)
 * Exit codes: 0 written, 2 usage.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
/* oxlint-disable no-restricted-imports -- Native Node build step reads the server's policy without bundler aliases. */
import {
  buildReportOnlyContentSecurityPolicy,
  resolveContentSecurityPolicyEnvironment,
} from '../app/lib/content-security-policy.server.ts';
import type { ContentSecurityPolicyEnvironment } from '../app/lib/content-security-policy.server.ts';
/* oxlint-enable no-restricted-imports */

/**
 * The `_headers` file for one environment: the report-only policy on every path.
 *
 * @param environment - Whose first-party hosts the policy admits.
 * @returns The file's text.
 */
export const contentSecurityPolicyHeaders = (environment: ContentSecurityPolicyEnvironment): string =>
  `/*\n  Content-Security-Policy-Report-Only: ${buildReportOnlyContentSecurityPolicy(environment)}\n`;

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const client = process.argv[2];
  if (!client) {
    console.error('Usage: node scripts/write-content-security-policy-headers.mts <client-dir>');
    process.exit(2);
  }
  const environment = resolveContentSecurityPolicyEnvironment(process.env['TAU_FRONTEND_URL']);
  const file = path.join(client, '_headers');
  await writeFile(file, contentSecurityPolicyHeaders(environment));
  console.log(`✓ Wrote the ${environment} content security policy to ${file}.`);
}
