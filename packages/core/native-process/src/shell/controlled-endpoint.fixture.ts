/**
 * A controlled granted endpoint for the network rows (W7; C04, T10): preloaded into the real supervisor with
 * `--import <this file>?port=<port>&names=<a,b>`, it answers each listed name with one public address and connects that
 * address to the test's own loopback server on `port`. Everything else the supervisor does is unchanged: the sandbox's
 * proxy still admits by granted name and credential, and the address guard still judges the resolved address (D26). The
 * public address is never dialled; it only stands in for a name the test owns, so no public origin is a fixture.
 */
import dns from 'node:dns';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';

/** Never dialled: every connection to it lands on the test's loopback server instead. */
const standIn = '93.184.215.14';

const query = new URL(import.meta.url).searchParams;
const port = Number(query.get('port'));
const names = new Set((query.get('names') ?? '').split(',').filter((name) => name !== ''));
if (!Number.isInteger(port) || port < 1 || port > 65_535 || names.size === 0) {
  throw new Error('controlled-endpoint.fixture: port and names are required.');
}

const lookup = dns.promises.lookup.bind(dns.promises);
dns.promises.lookup = (async (hostname: string, options?: unknown) =>
  names.has(hostname.toLowerCase())
    ? (options as { all?: boolean } | undefined)?.all === true
      ? [{ address: standIn, family: 4 }]
      : { address: standIn, family: 4 }
    : lookup(hostname, options as dns.LookupOptions)) as typeof dns.promises.lookup;

const connect = net.connect.bind(net);
net.connect = ((...parameters: unknown[]) => {
  const [first] = parameters;
  if (typeof first === 'object' && first !== null && (first as { host?: unknown }).host === standIn) {
    return connect({ ...(first as net.NetConnectOpts), host: '127.0.0.1', port } as net.NetConnectOpts);
  }
  return (connect as (...values: unknown[]) => net.Socket)(...parameters);
}) as typeof net.connect;
net.createConnection = net.connect;

syncBuiltinESMExports();
