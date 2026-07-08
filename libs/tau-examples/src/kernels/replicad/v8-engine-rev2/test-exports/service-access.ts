/**
 * Service-access export (README handshake): the full assembly plus the 28
 * named tool-probe solids for REQ-V8R2-087/088.
 */
import { buildEngine } from '../lib/assembly.js';

export default function main() {
  return buildEngine(true);
}
