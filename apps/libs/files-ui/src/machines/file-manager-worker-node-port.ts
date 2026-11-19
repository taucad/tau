/**
 * The file-manager worker's node filesystem port (desktop only; blueprint B7, Specification "Services port backoff").
 *
 * Main brokers one port to the provider host in the services utility and the file manager posts it to the worker as
 * `nodeFsPort`. When that channel dies the provider registry asks for a new port, which makes main fork a new services
 * utility. A utility that cannot start would otherwise be forked as fast as it dies, so each replacement request waits
 * 1 s, 2 s, 4 s and so on, up to 30 s, and three failures within 60 s end the wait with `SERVICES_UNAVAILABLE`.
 *
 * Kept apart from the worker module so the policy is tested without the worker's side effects.
 */

/** The code a port request ends with once the services utility keeps failing. @public */
export const servicesUnavailableCode = 'SERVICES_UNAVAILABLE';

/** The wait before the first replacement request; each later one doubles it. Milliseconds. */
const firstBackoff = 1000;
/** The longest wait between two replacement requests. Milliseconds. */
const longestBackoff = 30_000;
/** The window in which {@link failureLimit} failures give up. Milliseconds. */
const failureWindow = 60_000;
/** Failures within {@link failureWindow} after which the broker gives up. */
const failureLimit = 3;

/** What the broker needs from its worker. @public */
export type NodeFsPortBrokerPorts = Readonly<{
  /** Ask the file manager for a replacement port (`nodeFsPortRequest`). */
  request: () => void;
}>;

/** The broker the worker's provider registry draws node filesystem ports from. @public */
export type NodeFsPortBroker = Readonly<{
  /** A port arrived (`nodeFsPort`). */
  deliver: (port: MessagePort) => void;
  /** The file manager could not broker a port (`nodeFsPortError`). */
  fail: (message: string) => void;
  /** The provider registry's `createNodeFsPort`: the delivered port first, then a replacement for each dead one. */
  createNodeFsPort: () => Promise<MessagePort>;
}>;

const servicesUnavailable = (message: string): Error =>
  Object.assign(new Error(`The services utility did not start: ${message}`), { code: servicesUnavailableCode });

/**
 * Create the broker.
 *
 * @param ports - How to ask for a replacement port.
 * @returns The broker.
 * @public
 */
export function createNodeFsPortBroker({ request }: NodeFsPortBrokerPorts): NodeFsPortBroker {
  /* A rejected delivery nobody awaits yet is still settled through its awaiter later; never an unhandled rejection. */
  const nextDelivery = (): PromiseWithResolvers<MessagePort> => {
    const next = Promise.withResolvers<MessagePort>();
    const settleQuietly = async (): Promise<void> => {
      try {
        await next.promise;
      } catch {
        /* Its awaiter, when one comes, sees the rejection. */
      }
    };
    void settleQuietly();
    return next;
  };
  let delivery = nextDelivery();
  /* The current delivery was consumed: the next call needs a replacement. */
  let claimed = false;
  let failures: number[] = [];

  const recentFailures = (): number => {
    const now = Date.now();
    failures = failures.filter((at) => now - at < failureWindow);
    return failures.length;
  };

  const awaitDelivery = async (): Promise<MessagePort> => {
    const port = await delivery.promise;
    claimed = true;
    return port;
  };

  const requestReplacement = async (): Promise<MessagePort> => {
    for (;;) {
      const recent = recentFailures();
      if (recent >= failureLimit) {
        throw servicesUnavailable('it failed three times within a minute');
      }
      // oxlint-disable-next-line no-await-in-loop -- each wait follows the previous failure, by design.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, Math.min(firstBackoff * 2 ** recent, longestBackoff));
      });
      delivery = nextDelivery();
      request();
      try {
        // oxlint-disable-next-line no-await-in-loop -- one request at a time, by design.
        return await awaitDelivery();
      } catch (error) {
        failures.push(Date.now());
        if (recentFailures() >= failureLimit) {
          throw servicesUnavailable(error instanceof Error ? error.message : String(error));
        }
      }
    }
  };

  return {
    deliver: (port) => {
      delivery.resolve(port);
    },
    fail: (message) => {
      /* A refused port is spent like a dead one: the next call asks for a replacement. */
      claimed = true;
      delivery.reject(new Error(message));
    },
    createNodeFsPort: async () => (claimed ? requestReplacement() : awaitDelivery()),
  };
}
