/**
 * Centralized logging for KCL LSP components.
 *
 * Set `isDebugEnabled` to `true` to enable debug logging across all KCL LSP files.
 * This allows bulk enable/disable of logging for development and debugging.
 */

/** Master debug flag - set to true to enable logging across all KCL LSP components */
export const isDebugEnabled = false;

const consoleColors = {
  info: '\u001B[32m',
  error: '\u001B[31m',
  warn: '\u001B[33m',
  debug: '\u001B[34m',
  reset: '\u001B[0m',
};

/**
 * Create a scoped logger for a specific KCL component.
 *
 * @param component The component name (e.g., 'Hover Provider', 'LSP Client')
 * @returns A logging object with various log level methods
 */
export function createKclLogger(component: string): {
  info: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
} {
  const prefix = `[KCL ${component}]`;

  return {
    info(...args: unknown[]): void {
      // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- debug flag can be toggled
      if (isDebugEnabled) {
        console.log(`${consoleColors.info}${prefix}[INFO]${consoleColors.reset}`, ...args);
      }
    },
    error(...args: unknown[]): void {
      // Errors are always logged regardless of debug flag
      console.error(`${consoleColors.error}${prefix}[ERROR]${consoleColors.reset}`, ...args);
    },
    warn(...args: unknown[]): void {
      // Warnings are always logged regardless of debug flag
      console.warn(`${consoleColors.warn}${prefix}[WARN]${consoleColors.reset}`, ...args);
    },
    debug(...args: unknown[]): void {
      // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- debug flag can be toggled
      if (isDebugEnabled) {
        console.log(`${consoleColors.debug}${prefix}[DEBUG]${consoleColors.reset}`, ...args);
      }
    },
  };
}
