/**
 * Serial access for machine providers in a Node host: the ports the host can see, and a bounded byte stream over one
 * of them. The native port driver is the host application's choice (`serialport`'s `SerialPort` is a Node `Duplex`
 * and its `SerialPort.list()` reports these fields); the runtime itself carries no native dependency.
 *
 * @module
 */

import type { Duplex } from 'node:stream';

import type {
  MachineConnectionRuntime,
  MachineDiscoveryRuntime,
  MachineNetworkStream,
  MachineSerialPort,
  MachineSerialRequest,
} from '#machines/machine.js';

/** One port as a driver lists it. @public */
export type NodeMachineSerialPortInfo = Readonly<{
  path: string;
  vendorId?: string;
  productId?: string;
  manufacturer?: string;
  serialNumber?: string;
}>;

/** The native driver a host application supplies. @public */
export type NodeMachineSerialDriver = Readonly<{
  list(): Promise<readonly NodeMachineSerialPortInfo[]>;
  /** Open one port; opening may reset the controller behind it. */
  open(input: Readonly<{ path: string; baudRate: number }>): Promise<Duplex>;
}>;

const hex4 = (value: string | undefined): string | undefined => {
  const normalized = value?.toLowerCase().replace(/^0x/u, '').padStart(4, '0');
  return normalized !== undefined && /^[0-9a-f]{4}$/u.test(normalized) ? normalized : undefined;
};
const text = (value: string | undefined): string | undefined =>
  value !== undefined && value.length > 0 && value.length <= 256 && value.isWellFormed() ? value : undefined;

const portOf = (info: NodeMachineSerialPortInfo): MachineSerialPort => {
  const vendorId = hex4(info.vendorId);
  const productId = hex4(info.productId);
  const manufacturer = text(info.manufacturer);
  const serialNumber = text(info.serialNumber);
  return Object.freeze({
    path: info.path,
    ...(vendorId === undefined ? {} : { vendorId }),
    ...(productId === undefined ? {} : { productId }),
    ...(manufacturer === undefined ? {} : { manufacturer }),
    ...(serialNumber === undefined ? {} : { serialNumber }),
  });
};

/**
 * Wrap one driver as the serial half of a provider runtime: discovery lists ports, a connection opens one as a
 * stream bounded by the request's byte limits and its signal.
 * @param driver - The host application's native serial driver.
 * @returns `listSerialPorts` for discovery and `openSerial` for connections.
 * @public
 */
export const createNodeMachineSerial = (
  driver: NodeMachineSerialDriver,
): Required<Pick<MachineDiscoveryRuntime, 'listSerialPorts'> & Pick<MachineConnectionRuntime, 'openSerial'>> => ({
  async listSerialPorts({ signal }) {
    signal.throwIfAborted();
    const ports = await driver.list();
    signal.throwIfAborted();
    return Object.freeze(
      ports
        .filter((port) => typeof port.path === 'string' && port.path.length > 0 && port.path.length <= 512)
        .slice(0, 64)
        .map((port) => portOf(port)),
    );
  },
  async openSerial(input: MachineSerialRequest): Promise<MachineNetworkStream> {
    input.signal.throwIfAborted();
    if (!Number.isSafeInteger(input.baudRate) || input.baudRate <= 0) {
      throw new Error('MACHINE_SERIAL_BAUD_INVALID');
    }
    const port = await driver.open({ path: input.path, baudRate: input.baudRate });
    /* The bounded async iterator reports stream failures to the provider. */
    port.on('error', () => undefined);
    let readBytes = 0;
    let writtenBytes = 0;
    let closed = false;
    const abort = (): void => {
      port.destroy(new Error('MACHINE_STREAM_ABORTED'));
    };
    input.signal.addEventListener('abort', abort, { once: true });
    if (input.signal.aborted) {
      abort();
    }
    const readable = (async function* (): AsyncGenerator<Uint8Array<ArrayBuffer>> {
      for await (const raw of port as AsyncIterable<Uint8Array<ArrayBuffer>>) {
        const chunk = Uint8Array.from(raw);
        readBytes += chunk.byteLength;
        if (readBytes > input.maximumReadBytes) {
          throw new Error('MACHINE_STREAM_READ_LIMIT');
        }
        yield chunk;
      }
    })();
    return Object.freeze({
      readable,
      async write(chunk) {
        writtenBytes += chunk.byteLength;
        if (writtenBytes > input.maximumWriteBytes) {
          throw new Error('MACHINE_STREAM_WRITE_LIMIT');
        }
        await new Promise<void>((resolve, reject) => {
          port.write(chunk, (error) => {
            if (error) {
              reject(new Error('MACHINE_STREAM_WRITE_FAILED'));
            } else {
              resolve();
            }
          });
        });
      },
      async close() {
        if (closed) {
          return;
        }
        closed = true;
        input.signal.removeEventListener('abort', abort);
        if (port.destroyed) {
          return;
        }
        const portClosed = Promise.withResolvers<void>();
        port.once('close', () => {
          portClosed.resolve();
        });
        port.destroy();
        await portClosed.promise;
      },
    });
  },
});
