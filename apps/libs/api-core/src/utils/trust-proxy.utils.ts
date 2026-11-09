import process from 'node:process';
import { BlockList, isIPv4, isIPv6 } from 'node:net';

/**
 * Peers that can be Fly's edge proxy: loopback and the private ranges a Fly
 * Machine is reached from (172.16.0.0/12 for IPv4, the fdaa::/16 6PN network
 * inside fc00::/7 for IPv6). The public internet can never connect from one.
 */
const privatePeers = new BlockList();
privatePeers.addSubnet('127.0.0.0', 8, 'ipv4');
privatePeers.addSubnet('10.0.0.0', 8, 'ipv4');
privatePeers.addSubnet('172.16.0.0', 12, 'ipv4');
privatePeers.addSubnet('192.168.0.0', 16, 'ipv4');
privatePeers.addAddress('::1', 'ipv6');
privatePeers.addSubnet('fc00::', 7, 'ipv6');

/**
 * Whether a socket peer is loopback or private.
 *
 * @param address - The peer address as Node reports it (IPv4-mapped IPv6 included).
 * @returns True for a loopback or private peer.
 */
export const isPrivatePeer = (address: string): boolean => {
  const candidate = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/iu.exec(address)?.[1] ?? address;
  if (isIPv4(candidate)) {
    return privatePeers.check(candidate, 'ipv4');
  }
  if (isIPv6(candidate)) {
    return privatePeers.check(candidate, 'ipv6');
  }
  return false;
};

/**
 * Fastify `trustProxy` for an API behind Fly Proxy: trust exactly one hop, and
 * only when the socket peer is private.
 *
 * Fly terminates TLS at its edge and connects to the Machine from a private
 * address, appending the client address as the last `X-Forwarded-For` entry
 * (the same value it sends as `Fly-Client-IP`). Trusting hop 0 alone makes
 * `request.ip` that last entry; anything a client wrote earlier in the header
 * is never reached, so it cannot be spoofed. A public peer — something that
 * reached the process without Fly — is not trusted, and its own address stays
 * `request.ip`.
 *
 * @param address - The address being considered as a proxy.
 * @param hop - Its distance from the socket (0 is the socket peer).
 * @returns Whether to read the next address from `X-Forwarded-For`.
 */
export const trustFlyProxy = (address: string, hop: number): boolean => hop === 0 && isPrivatePeer(address);

/**
 * The `trustProxy` option for the Fastify adapter: the Fly proxy rule on Fly
 * (which sets `FLY_APP_NAME` in every Machine), and no proxy trust anywhere
 * else, so local and self-hosted runs keep the socket address.
 *
 * @param environment - The process environment (read before the ConfigService exists).
 * @returns The Fastify `trustProxy` option.
 */
export const getTrustProxyOption = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
): typeof trustFlyProxy | false => (environment['FLY_APP_NAME'] ? trustFlyProxy : false);
