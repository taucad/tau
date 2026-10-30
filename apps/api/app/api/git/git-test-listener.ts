import { FastifyAdapter } from '@nestjs/platform-fastify';

/** The actual API socket, owned before Nest constructs controllers that capture its origin. */
export type GitTestListener = Readonly<{
  adapter: FastifyAdapter;
  origin: string;
  close: () => Promise<void>;
}>;

/**
 * Bind the adapter's Node server without starting Fastify's plugin lifecycle.
 * Nest may still register routes and middleware before app.init() and Fastify.ready().
 * There is no second listen or port handoff; the returned owner also closes a failed setup.
 *
 * @returns The bound adapter, its origin, and cleanup for every setup outcome.
 */
export async function createGitTestListener(): Promise<GitTestListener> {
  const adapter = new FastifyAdapter({ bodyLimit: 256 * 1024 * 1024 });
  const { server } = adapter.getInstance();
  const close = async (): Promise<void> => {
    server.closeAllConnections();
    await adapter.close();
  };
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('The git test API did not bind a TCP socket');
    }
    return { adapter, origin: `http://127.0.0.1:${String(address.port)}`, close };
  } catch (error) {
    await close();
    throw error;
  }
}
