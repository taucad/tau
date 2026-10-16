/**
 * Test fixture: the `test_model` definition a registry with a GeoSpec runner lists. The MCP endpoints list
 * `test_model` only when their registry does, so a stub registry whose tests call it lists this. Tests only.
 */

import type { HostToolDefinition } from '@taucad/agent-host';

/** What a registry with a GeoSpec runner lists for `test_model`. */
export const testModelTool: HostToolDefinition = {
  name: 'test_model',
  description: 'Run the GeoSpec suite.',
  inputSchema: { type: 'object' },
};
