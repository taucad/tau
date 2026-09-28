import { buildShell } from '../../lib/airframe-geometry.js';
export const defaultParams = {};
export function buildUpperShell() {
  return buildShell(true);
}
export default function main() {
  return buildUpperShell();
}
