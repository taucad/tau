import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { chatTurnRequestSchema } from '@taucad/chat/schemas';

const collectKeys = (node: unknown, keys: Set<string>): void => {
  if (node === null || typeof node !== 'object') {
    return;
  }
  if (Array.isArray(node)) {
    for (const entry of node) {
      collectKeys(entry, keys);
    }
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    keys.add(key);
    collectKeys(value, keys);
  }
};

describe('chatTurnRequestSchema JSON Schema contract (R13)', () => {
  // `unrepresentable: 'any'` collapses `z.never()` / `z.undefined()` (used in
  // AI SDK tool-part discriminated unions) to `{}` instead of throwing — the
  // wire contract this test cares about is on the `agent` block, not the
  // upstream-defined message-part shapes.
  const fullSchema = z.toJSONSchema(chatTurnRequestSchema, { unrepresentable: 'any' }) as Record<string, unknown>;

  const defs = (fullSchema['$defs'] ?? fullSchema['definitions']) as
    | Record<string, Record<string, unknown>>
    | undefined;

  const resolveRef = (node: Record<string, unknown>): Record<string, unknown> => {
    const ref = node['$ref'];
    if (typeof ref !== 'string') {
      return node;
    }
    const segments = ref.split('/').slice(1);
    let current: unknown = fullSchema;
    for (const segment of segments) {
      if (current === null || typeof current !== 'object') {
        throw new Error(`Could not resolve $ref ${ref}: segment ${segment} missing`);
      }
      current = (current as Record<string, unknown>)[segment];
    }
    if (current === null || typeof current !== 'object') {
      throw new Error(`Resolved $ref ${ref} is not an object`);
    }
    return current as Record<string, unknown>;
  };

  it('should emit no `not` / `if` / `then` keywords inside the agent slice — proves no `.refine()` / `.superRefine()` survives on the config block', () => {
    // Restricted to the agent slice: the messages slice imports tool-part
    // schemas from the AI SDK that use `z.never()` and surface as `not`
    // (representing "this state forbids this field"), which is not what this
    // test guards against. The agent block is the one we own end-to-end.
    const agentDefinition = (defs?.['AgentConfig'] ??
      (fullSchema['properties'] as { agent?: unknown }).agent) as Record<string, unknown>;
    const keys = new Set<string>();
    collectKeys(agentDefinition, keys);

    expect(keys.has('not'), 'agent JSON Schema must not contain `not` (would indicate a refine)').toBe(false);
    expect(keys.has('if'), 'agent JSON Schema must not contain `if`').toBe(false);
    expect(keys.has('then'), 'agent JSON Schema must not contain `then`').toBe(false);
  });

  describe('agent field structure', () => {
    const agentNodeRaw = (fullSchema['properties'] as { agent: Record<string, unknown> }).agent;
    const agentNode = resolveRef(agentNodeRaw);

    const resolvedBranches = ((agentNode['anyOf'] ?? agentNode['oneOf']) as ReadonlyArray<Record<string, unknown>>).map(
      (branch) => resolveRef(branch),
    );

    const findBranch = (profile: string): Record<string, unknown> | undefined =>
      resolvedBranches.find(
        (branch) => (branch['properties'] as { profile?: { const?: string } } | undefined)?.profile?.const === profile,
      );

    it('should declare agent as a top-level required property of the chat body', () => {
      expect((fullSchema['required'] as readonly string[]).includes('agent')).toBe(true);
    });

    it('should register the agent union by id (`AgentConfig`) in $defs for OpenAPI reuse', () => {
      expect(defs?.['AgentConfig']).toBeDefined();
    });

    it('should encode agent as a discriminated branching of three profile variants', () => {
      expect(resolvedBranches.length).toBe(3);
    });

    it('should key each agent branch on a profile literal (cad, project_name, commit_name)', () => {
      const profiles = resolvedBranches
        .map((branch) => (branch['properties'] as { profile?: { const?: string } } | undefined)?.profile?.const)
        .filter((value): value is string => typeof value === 'string')
        .sort();

      expect(profiles).toEqual(['cad', 'commit_name', 'project_name']);
    });

    it('should keep snapshot OUT of the cad agent required[] (optional, no default)', () => {
      const cadBranch = findBranch('cad');
      const required = (cadBranch?.['required'] ?? []) as readonly string[];

      expect(required).not.toContain('snapshot');
    });

    it('should keep contextPayload OUT of the cad agent required[] (optional, no default)', () => {
      const cadBranch = findBranch('cad');
      const required = (cadBranch?.['required'] ?? []) as readonly string[];

      expect(required).not.toContain('contextPayload');
    });

    it('should NOT emit a `default` key on snapshot or contextPayload — they are truly optional, not sentinel-defaulted', () => {
      const cadBranch = findBranch('cad');
      const properties = cadBranch?.['properties'] as
        | { snapshot?: Record<string, unknown>; contextPayload?: Record<string, unknown> }
        | undefined;

      expect(properties?.snapshot).toBeDefined();
      expect(properties?.contextPayload).toBeDefined();
      expect(properties?.snapshot?.['default']).toBeUndefined();
      expect(properties?.contextPayload?.['default']).toBeUndefined();
    });

    it('should keep the cad agent branch contract stable (inline snapshot guards regressions)', () => {
      const cadBranch = findBranch('cad');

      expect(cadBranch).toMatchInlineSnapshot(`
        {
          "additionalProperties": false,
          "properties": {
            "contextPayload": {
              "additionalProperties": false,
              "properties": {
                "memory": {
                  "additionalProperties": {
                    "type": "string",
                  },
                  "propertyNames": {
                    "type": "string",
                  },
                  "type": "object",
                },
                "skills": {
                  "items": {
                    "additionalProperties": false,
                    "properties": {
                      "description": {
                        "type": "string",
                      },
                      "name": {
                        "type": "string",
                      },
                      "path": {
                        "type": "string",
                      },
                      "source": {
                        "type": "string",
                      },
                    },
                    "required": [
                      "name",
                      "description",
                      "path",
                    ],
                    "type": "object",
                  },
                  "type": "array",
                },
              },
              "type": "object",
            },
            "kernel": {
              "enum": [
                "openscad",
                "replicad",
                "manifold",
                "zoo",
                "jscad",
                "opencascadejs",
              ],
              "type": "string",
            },
            "mode": {
              "enum": [
                "agent",
                "plan",
              ],
              "type": "string",
            },
            "model": {
              "type": "string",
            },
            "profile": {
              "const": "cad",
              "type": "string",
            },
            "snapshot": {
              "additionalProperties": false,
              "properties": {
                "activeFile": {
                  "additionalProperties": false,
                  "properties": {
                    "name": {
                      "type": "string",
                    },
                    "path": {
                      "type": "string",
                    },
                  },
                  "required": [
                    "path",
                    "name",
                  ],
                  "type": "object",
                },
                "fileTree": {
                  "items": {
                    "additionalProperties": false,
                    "properties": {
                      "name": {
                        "type": "string",
                      },
                      "path": {
                        "type": "string",
                      },
                      "size": {
                        "type": "number",
                      },
                      "type": {
                        "enum": [
                          "file",
                          "dir",
                        ],
                        "type": "string",
                      },
                    },
                    "required": [
                      "path",
                      "name",
                      "type",
                      "size",
                    ],
                    "type": "object",
                  },
                  "type": "array",
                },
                "openFiles": {
                  "items": {
                    "additionalProperties": false,
                    "properties": {
                      "name": {
                        "type": "string",
                      },
                      "path": {
                        "type": "string",
                      },
                    },
                    "required": [
                      "path",
                      "name",
                    ],
                    "type": "object",
                  },
                  "type": "array",
                },
              },
              "type": "object",
            },
            "testingEnabled": {
              "type": "boolean",
            },
            "toolChoice": {
              "anyOf": [
                {
                  "enum": [
                    "none",
                    "auto",
                    "any",
                    "custom",
                  ],
                  "type": "string",
                },
                {
                  "items": {
                    "enum": [
                      "web_search",
                      "web_browser",
                      "test_model",
                      "edit_tests",
                      "read_file",
                      "edit_file",
                      "list_directory",
                      "create_file",
                      "delete_file",
                      "grep",
                      "glob_search",
                      "get_kernel_result",
                      "export_geometry",
                      "screenshot",
                      "transfer_to_cad_expert",
                      "transfer_to_research_expert",
                      "transfer_back_to_supervisor",
                    ],
                    "type": "string",
                  },
                  "type": "array",
                },
              ],
            },
          },
          "required": [
            "profile",
            "model",
            "kernel",
            "mode",
            "toolChoice",
            "testingEnabled",
          ],
          "type": "object",
        }
      `);
    });
  });
});
