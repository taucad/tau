/**
 * A rebinding name the test owns, for C05: preloaded into the real supervisor with `--import <this file>?names=<a,b>`,
 * it answers each listed name with `127.0.0.1`, as a public DNS name that rebinds to loopback would. Nothing else
 * changes: the sandbox's proxy still admits by granted name, and the address guard still judges the resolved address
 * (D26). It replaces a lookup of the public name `localtest.me`, which failed on a hosted runner's resolver
 * (ENOTFOUND, MAC-A, run 43610005823) before the sandbox was ever asked.
 */
import dns from 'node:dns';
import { syncBuiltinESMExports } from 'node:module';

const loopback = '127.0.0.1';

const names = new Set(
  (new URL(import.meta.url).searchParams.get('names') ?? '').split(',').filter((name) => name !== ''),
);
if (names.size === 0) {
  throw new Error('rebinding-name.fixture: names are required.');
}

const lookup = dns.promises.lookup.bind(dns.promises);
dns.promises.lookup = (async (hostname: string, options?: unknown) =>
  names.has(hostname.toLowerCase())
    ? (options as { all?: boolean } | undefined)?.all === true
      ? [{ address: loopback, family: 4 }]
      : { address: loopback, family: 4 }
    : lookup(hostname, options as dns.LookupOptions)) as typeof dns.promises.lookup;

syncBuiltinESMExports();
