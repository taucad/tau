import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { HostDaemonOptions } from '@taucad/host';

/**
 * Load the provisioned cloud host image's chat observer (T11); the private reporter stays out of the published CLI.
 *
 * @param environment - Process environment.
 * @param load - Module loader, for tests.
 * @returns The module's default export, or `undefined`.
 */
export const loadCloudHostObserver = async (
  environment: Readonly<Record<string, string | undefined>> = process.env,
  load: (url: string) => Promise<unknown> = async (url) => import(url),
): Promise<HostDaemonOptions['observeChats']> => {
  const path = environment['TAU_HOST_OBSERVER_MODULE'];
  if (environment['TAU_CLOUD_HOST'] !== '1' || path === undefined || !isAbsolute(path)) {
    return undefined;
  }
  try {
    const { default: observeChats } = (await load(pathToFileURL(path).href)) as { default?: unknown };
    return typeof observeChats === 'function' ? (observeChats as HostDaemonOptions['observeChats']) : undefined;
  } catch {
    return undefined;
  }
};
