/**
 * Centralized logging for Zoo kernel/KCL engine components.
 *
 * Set `isDebugEnabled` to `true` to enable debug logging across all Zoo engine files.
 * This allows bulk enable/disable of logging for development and debugging.
 */

/** Master debug flag - set to true to enable logging across all Zoo engine components */
export const isDebugEnabled = false;

const consoleColors = {
  info: '\u001B[32m',
  error: '\u001B[31m',
  warn: '\u001B[33m',
  debug: '\u001B[34m',
  trace: '\u001B[35m',
  req: '\u001B[36m',
  res: '\u001B[36m',
  reset: '\u001B[0m',
};

/**
 * Create a scoped logger for a specific component.
 *
 * @param component - the component name (e.g., 'EngineConnection', 'KclUtils')
 * @returns A logging object with various log level methods
 */
export function createZooLogger(component: string): {
  info: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  debug: (message: string, ...args: unknown[]) => void;
  trace: (message: string, ...args: unknown[]) => void;
  req: (message: string, ...args: unknown[]) => void;
  res: (message: string, ...args: unknown[]) => void;
} {
  const prefix = `[Zoo ${component}]`;

  return {
    info(message: string, ...args: unknown[]): void {
      // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- debug flag can be toggled
      if (isDebugEnabled) {
        console.log(`${consoleColors.info}${prefix}[INFO]${consoleColors.reset} ${message}`, ...args);
      }
    },
    error(message: string, ...args: unknown[]): void {
      // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- debug flag can be toggled
      if (isDebugEnabled) {
        console.error(`${consoleColors.error}${prefix}[ERROR]${consoleColors.reset} ${message}`, ...args);
      }
    },
    warn(message: string, ...args: unknown[]): void {
      // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- debug flag can be toggled
      if (isDebugEnabled) {
        console.warn(`${consoleColors.warn}${prefix}[WARN]${consoleColors.reset} ${message}`, ...args);
      }
    },
    debug(message: string, ...args: unknown[]): void {
      // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- debug flag can be toggled
      if (isDebugEnabled) {
        console.log(`${consoleColors.debug}${prefix}[DEBUG]${consoleColors.reset} ${message}`, ...args);
      }
    },
    trace(message: string, ...args: unknown[]): void {
      // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- debug flag can be toggled
      if (isDebugEnabled) {
        console.log(`${consoleColors.trace}${prefix}[TRACE]${consoleColors.reset} ${message}`, ...args);
      }
    },
    req(message: string, ...args: unknown[]): void {
      // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- debug flag can be toggled
      if (isDebugEnabled) {
        console.log(`${consoleColors.req}${prefix}[REQ]${consoleColors.reset} ${message}`, ...args);
      }
    },
    res(message: string, ...args: unknown[]): void {
      // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- debug flag can be toggled
      if (isDebugEnabled) {
        console.log(`${consoleColors.res}${prefix}[RES]${consoleColors.reset} ${message}`, ...args);
      }
    },
  };
}
