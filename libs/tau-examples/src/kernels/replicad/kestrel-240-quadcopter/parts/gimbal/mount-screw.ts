import { buildShellScrew } from './shell-screw.js';

export const defaultParams = { length: 8 };
export function buildMountScrew(p = defaultParams) {
  return buildShellScrew(p);
}
export default function main(p = defaultParams) {
  return buildMountScrew(p);
}
