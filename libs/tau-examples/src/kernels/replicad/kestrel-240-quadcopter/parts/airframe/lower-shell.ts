import { buildShell } from '../../lib/airframe-geometry.js';
export const defaultParams = {};
export function buildLowerShell() {
  return buildShell(false);
}
export default function main() {
  return buildLowerShell();
}
