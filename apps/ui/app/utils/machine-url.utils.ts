import type { DesktopScheme } from '#lib/desktop-deep-link.js';
import { projectUrl } from '#utils/project-url.utils.js';
import type { ProjectSlugs } from '#utils/project-url.utils.js';
import { searchParameterName } from '#constants/search-parameter.constants.js';

/** Identity links contain no machine address, credential or command. */
export type MachineLocation = { readonly hostId: string; readonly machineId: string };
/** A route identity may contain Unicode, but never path separators or control characters. */
export const isMachineRouteIdentity = (value: string): boolean =>
  value.length > 0 &&
  value.length <= 256 &&
  value.isWellFormed() &&
  value !== '.' &&
  value !== '..' &&
  !/[/\\]/u.test(value) &&
  [...value].every((character) => (character.codePointAt(0) ?? 0) >= 32 && (character.codePointAt(0) ?? 0) !== 127);
/** Canonical route, qualified by the host that owns the logical machine. */
export const machineUrl = ({ hostId, machineId }: MachineLocation): string =>
  `/machines/${encodeURIComponent(hostId)}/${encodeURIComponent(machineId)}`;
/** Native machine link; opening it only navigates. */
export const machineDeepLink = (location: MachineLocation, scheme: DesktopScheme = 'tau'): string =>
  `${scheme}://${machineUrl(location).slice(1)}`;
/** Source project with the same machine and exact durable job selected. */
export const machineJobProjectUrl = (slugs: ProjectSlugs, location: MachineLocation, jobId: string): string => {
  const query = new URLSearchParams({
    [searchParameterName.workbench]: 'print',
    [searchParameterName.machineHost]: location.hostId,
    [searchParameterName.machine]: location.machineId,
    [searchParameterName.machineJob]: jobId,
  });
  return `${projectUrl(slugs)}?${query}`;
};
